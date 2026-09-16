#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { CodexMicroEmulator } from "../src/emulator.js";
import { Link } from "../src/link.js";
import { SocketTransport } from "../src/transports/socket.js";
import { SocketServerTransport } from "../src/transports/socket-server.js";
import { StreamDeckBackend } from "../src/streamdeck.js";
import { KeyboardInput } from "../src/keyboard-input.js";

const DEFAULT_SOCKET = path.join(os.tmpdir(), "codex-micro-vhid.sock");

function parseArgs(argv) {
  const opts = {
    input: "streamdeck",
    mode: "helper",
    socket: DEFAULT_SOCKET,
    battery: 100,
    verbose: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input") opts.input = argv[++i];
    else if (a === "--mode") opts.mode = argv[++i];
    else if (a === "--socket") opts.socket = argv[++i];
    else if (a === "--battery") opts.battery = Number(argv[++i]);
    else if (a === "--verbose" || a === "-v") opts.verbose = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else {
      console.error(`Unknown argument: ${a}`);
      opts.help = true;
    }
  }
  return opts;
}

function usage() {
  console.log(`codex-micro-emulator — present a virtual Codex Micro backed by a Stream Deck

Usage:
  codex-micro-emulator [options]

Options:
  --mode <helper|shim>           How the app reaches us (default: helper)
                                   helper: connect to the native IOKit helper
                                   shim:   listen for the in-app node-hid shim
  --input <streamdeck|keyboard>  Physical input source (default: streamdeck)
  --socket <path>                Unix socket path (default: ${DEFAULT_SOCKET})
  --battery <0-100>              Reported battery level (default: 100)
  -v, --verbose                  Log every RPC request/response
  -h, --help                     Show this help

helper mode: start native/CodexMicroVirtualHID first (it owns the virtual USB
HID device). shim mode: start this bridge first, then launch the app via
shim/launch-chatgpt.sh. See the README.`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return usage();

  const emulator = new CodexMicroEmulator({ battery: opts.battery });

  if (opts.verbose) {
    emulator.on("request", ({ method, id }) => console.error(`[rpc] <- ${method} (id ${id})`));
    emulator.on("send", (line) => console.error(`[rpc] -> ${line.trim()}`));
    emulator.on("log", (level, ...args) => console.error(`[${level}]`, ...args));
  }
  emulator.on("lighting", (m) => {
    if (opts.verbose) console.error("[lighting]", JSON.stringify(m));
  });

  // Transport: either connect to the native helper (helper mode) or listen for
  // the in-app node-hid shim to connect (shim mode).
  let transport;
  if (opts.mode === "shim") {
    transport = new SocketServerTransport(opts.socket);
    try {
      await transport.listen();
    } catch (err) {
      console.error(`Could not listen on ${opts.socket}: ${err.message}`);
      process.exit(1);
    }
    transport.on("open", () => console.error("Shim connected."));
    transport.on("client-close", () => console.error("Shim disconnected (waiting for reconnect)."));
    console.error(`Listening for the node-hid shim on ${opts.socket}.`);
    console.error("Now launch the app:  ./shim/launch-chatgpt.sh");
  } else {
    transport = new SocketTransport(opts.socket);
    try {
      await transport.connect();
    } catch (err) {
      console.error(`Could not connect to the virtual-HID helper at ${opts.socket}.`);
      console.error(`Is it running?  ${err.message}`);
      process.exit(1);
    }
    console.error(`Connected to virtual-HID helper at ${opts.socket}.`);
  }
  // eslint-disable-next-line no-new -- Link wires emulator<->transport via events
  new Link(emulator, transport);

  // Input source.
  let input;
  if (opts.input === "keyboard") {
    input = new KeyboardInput(emulator);
    input.start();
  } else {
    const backend = new StreamDeckBackend(emulator);
    try {
      await backend.start();
      console.error("Stream Deck ready.");
    } catch (err) {
      console.error(`Stream Deck backend failed: ${err.message}`);
      console.error("Tip: retry with `--input keyboard` to test without hardware.");
      process.exit(1);
    }
    input = backend;
  }

  const shutdown = async () => {
    console.error("\nShutting down…");
    try {
      await input.stop?.();
    } catch {
      /* ignore */
    }
    transport.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export { parseArgs, DEFAULT_SOCKET, fileURLToPath };
