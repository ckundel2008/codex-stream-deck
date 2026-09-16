// node-hid shim (CommonJS — loaded via NODE_OPTIONS="--require preload.cjs").
//
// Monkeypatches the `node-hid` module the ChatGPT app loads so it enumerates a
// synthetic Codex Micro and, when opened, returns a fake device whose 64-byte
// HID reports are forwarded over a Unix socket to the external bridge (the same
// SocketServerTransport / emulator / Stream Deck stack the native helper used).
//
// Self-contained: depends only on Node built-ins, so it can be injected into the
// app's main process without pulling in the ESM `src/` code.

const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { EventEmitter } = require("node:events");

const REPORT_SIZE = 64;
const FAKE_PATH = "codex-micro-virtual";

// Descriptor the app's discovery must accept: VID 0x303A, PID 0x8360, vendor
// usage page 0xFF00, "Work Louder" manufacturer, USB (release low bits clear).
const FAKE_DESCRIPTOR = Object.freeze({
  vendorId: 0x303a,
  productId: 0x8360,
  path: FAKE_PATH,
  serialNumber: "codex-micro-emulator",
  manufacturer: "Work Louder",
  product: "Codex Micro",
  release: 0x0100,
  interface: 0,
  usagePage: 0xff00,
  usage: 0x01,
});

function defaultSocketPath() {
  return process.env.CODEX_MICRO_SOCKET || path.join(os.tmpdir(), "codex-micro-vhid.sock");
}

let logStream = null;
function log(msg) {
  const file = process.env.CODEX_MICRO_SHIM_LOG;
  if (!file) return;
  try {
    if (!logStream) logStream = fs.createWriteStream(file, { flags: "a" });
    logStream.write(`[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    /* logging is best-effort */
  }
}

/** Pad/truncate a Buffer to exactly one 64-byte report frame. */
function toFrame(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (buf.length === REPORT_SIZE) return buf;
  const frame = Buffer.alloc(REPORT_SIZE);
  buf.copy(frame, 0, 0, Math.min(buf.length, REPORT_SIZE));
  return frame;
}

/**
 * Fake HIDAsync device backed by a socket to the bridge. Implements the surface
 * the Work Louder device-comm layer uses: on('data'|'error'|'close'), write(),
 * close(), read(), getDeviceInfo().
 */
class FakeHIDAsync extends EventEmitter {
  constructor(socketPath) {
    super();
    this.socketPath = socketPath;
    this.sock = null;
    this.connected = false;
    this._rx = Buffer.alloc(0);
    this._queue = [];
    this._connect();
  }

  _connect() {
    const sock = net.createConnection(this.socketPath);
    this.sock = sock;

    sock.on("connect", () => {
      this.connected = true;
      log(`connected to bridge at ${this.socketPath}`);
      for (const f of this._queue) sock.write(f);
      this._queue = [];
    });
    sock.on("data", (chunk) => this._onData(chunk));
    sock.on("error", (err) => {
      log(`socket error: ${err.message}`);
      // Surface as a device error so the app's own reconnect loop kicks in.
      this.emit("error", err);
    });
    sock.on("close", () => {
      this.connected = false;
      this.emit("close");
    });
  }

  _onData(chunk) {
    this._rx = Buffer.concat([this._rx, chunk]);
    while (this._rx.length >= REPORT_SIZE) {
      const frame = this._rx.subarray(0, REPORT_SIZE);
      this._rx = this._rx.subarray(REPORT_SIZE);
      this.emit("data", Buffer.from(frame));
    }
  }

  write(data) {
    const frame = toFrame(data);
    if (this.connected && this.sock) this.sock.write(frame);
    else this._queue.push(frame);
    return Promise.resolve(frame.length);
  }

  read(timeout) {
    return new Promise((resolve) => {
      const onData = (buf) => {
        if (t) clearTimeout(t);
        resolve(buf);
      };
      const t = timeout
        ? setTimeout(() => {
            this.off("data", onData);
            resolve(Buffer.alloc(0));
          }, timeout)
        : null;
      this.once("data", onData);
    });
  }

  getDeviceInfo() {
    return { ...FAKE_DESCRIPTOR };
  }

  // Feature reports are unused by the Codex flow; provide harmless stubs.
  sendFeatureReport() {
    return Promise.resolve(0);
  }
  getFeatureReport() {
    return Promise.resolve(Buffer.alloc(0));
  }
  setNonBlocking() {}
  pause() {}
  resume() {}

  close() {
    try {
      this.sock?.end();
    } catch {
      /* ignore */
    }
    return Promise.resolve();
  }
}

function isFakePath(p) {
  return p === FAKE_PATH || (typeof p === "string" && p.includes(FAKE_PATH));
}

/**
 * Return a patched copy of a real `node-hid` module: `devices()` gains the fake
 * Codex Micro; `HIDAsync.open()` returns the fake device for the fake path and
 * delegates everything else to the real module.
 */
function patchModule(real, opts = {}) {
  const socketPath = opts.socketPath || defaultSocketPath();
  const patched = Object.create(real); // inherit HID, setDriverType, …

  patched.devices = function (...args) {
    let list = [];
    try {
      list = real.devices(...args) || [];
    } catch {
      /* ignore */
    }
    return list.concat([{ ...FAKE_DESCRIPTOR }]);
  };

  if (typeof real.devicesAsync === "function") {
    patched.devicesAsync = async function (...args) {
      let list = [];
      try {
        list = (await real.devicesAsync(...args)) || [];
      } catch {
        /* ignore */
      }
      return list.concat([{ ...FAKE_DESCRIPTOR }]);
    };
  }

  const RealAsync = real.HIDAsync;
  if (RealAsync) {
    patched.HIDAsync = new Proxy(RealAsync, {
      get(target, prop, receiver) {
        if (prop === "open") {
          return (openPath, openOpts) =>
            isFakePath(openPath)
              ? Promise.resolve(new FakeHIDAsync(socketPath))
              : openOpts === undefined
                ? RealAsync.open(openPath)
                : RealAsync.open(openPath, openOpts);
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  log("node-hid patched");
  return patched;
}

/**
 * Add the virtual Codex Micro to ChatGPT's native macOS HID topology scan.
 * Newer app builds use this addon for discovery before opening the selected
 * path through node-hid, so both layers must expose the same fake descriptor.
 */
function patchTopologyWatcher(real) {
  const patched = Object.create(real);

  patched.findCodexMicroInterfaces = function (...args) {
    const addFake = (value) => {
      const list = Array.isArray(value) ? value : [];
      if (list.some((device) => isFakePath(device?.path))) return list;
      return list.concat([{ ...FAKE_DESCRIPTOR }]);
    };

    try {
      const found = real.findCodexMicroInterfaces(...args);
      return found && typeof found.then === "function" ? found.then(addFake) : addFake(found);
    } catch {
      return addFake([]);
    }
  };

  log("HID topology watcher patched");
  return patched;
}

/** Intercept both discovery layers and return patched module views. */
function installHook(opts = {}) {
  const Module = require("node:module");
  const original = Module._load;
  const nodeHidCache = new WeakMap();
  const topologyCache = new WeakMap();

  Module._load = function (request, parent, isMain) {
    const mod = original.apply(this, arguments);
    if (looksLikeNodeHid(request, mod)) {
      if (!nodeHidCache.has(mod)) nodeHidCache.set(mod, patchModule(mod, opts));
      return nodeHidCache.get(mod);
    }
    if (looksLikeTopologyWatcher(request, mod)) {
      if (!topologyCache.has(mod)) topologyCache.set(mod, patchTopologyWatcher(mod));
      return topologyCache.get(mod);
    }
    return mod;
  };
  installAgentSlotCapture(Module);
  log(`hook installed (socket=${opts.socketPath || defaultSocketPath()})`);
}

/**
 * Capture the exact task IDs assigned by Codex to its Micro agent slots.
 * The HID lighting protocol carries only colours, so the external renderer
 * needs this small sidecar to associate a slot with its real task title.
 */
function installAgentSlotCapture(Module) {
  if (Module.prototype._compile.__codexMicroAgentSlotCapture) return;
  const originalCompile = Module.prototype._compile;
  function compileWithAgentSlotCapture(content, filename) {
    if (/[/\\]main-[^/\\]+\.js$/.test(filename)) {
      content = injectAgentSlotCapture(content);
    }
    return originalCompile.call(this, content, filename);
  }
  compileWithAgentSlotCapture.__codexMicroAgentSlotCapture = true;
  Module.prototype._compile = compileWithAgentSlotCapture;
}

function injectAgentSlotCapture(source) {
  const marker = "updateAgentThreadKeys(e,t,n=!1){this.agentThreadKeys=e,this.agentActionSlots=new Set(t)";
  if (!source.includes(marker)) {
    log("agent slot capture marker not found");
    return source;
  }
  const capture =
    'updateAgentThreadKeys(e,t,n=!1){try{let r=require("node:fs"),i=require("node:path"),' +
    'a=process.env.CODEX_MICRO_AGENT_SLOTS||i.join(require("node:os").homedir(),"Library","Application Support","CodexMicro","agent-slots.json"),' +
    'o=a+".tmp";r.mkdirSync(i.dirname(a),{recursive:true});r.writeFileSync(o,JSON.stringify({threadKeys:e,updatedAt:Date.now()}));r.renameSync(o,a)}catch{}' +
    'this.agentThreadKeys=e,this.agentActionSlots=new Set(t)';
  log("agent slot capture installed");
  return source.replace(marker, capture);
}

function looksLikeNodeHid(request, mod) {
  if (typeof request === "string" && /(^|[\\/])node-hid($|[\\/.])/.test(request)) return true;
  // Shape check as a fallback (bare module already resolved to an object).
  return Boolean(mod && typeof mod.devices === "function" && mod.HIDAsync);
}

function looksLikeTopologyWatcher(request, mod) {
  if (
    typeof request === "string" &&
    /hid[-_]topology[-_]watcher(?:\.node)?$/i.test(request)
  ) {
    return true;
  }
  return Boolean(
    mod &&
      typeof mod.findCodexMicroInterfaces === "function" &&
      typeof mod.watch === "function",
  );
}

module.exports = {
  REPORT_SIZE,
  FAKE_PATH,
  FAKE_DESCRIPTOR,
  FakeHIDAsync,
  patchModule,
  patchTopologyWatcher,
  installHook,
  injectAgentSlotCapture,
  defaultSocketPath,
};
