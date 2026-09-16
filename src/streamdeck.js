import { Act, Effect, Keys } from "./protocol.js";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import {
  DEFAULT_LAYOUT,
  PLUS_DIALS,
  DIAL_KEYCODES,
  layoutForKeyCount,
  resolveKey,
  keycapAt,
  unpackRgb,
} from "./mapping.js";
import { ICON_TO_LUCIDE } from "./keycaps.js";
import { renderKey, renderLcdZone, canRenderIcons } from "./renderer.js";
import { loadAgentTitles } from "./agent-titles.js";
import {
  activateCodexApp as activateCodexAppDirect,
  directActionForKeycode,
  openCodexThread,
  runDirectCodexAction,
} from "./direct-controller.js";
import { STATE_COLOR } from "./states.js";
import { readWeeklyUsage, renderWeeklyGauge } from "./weekly-usage.js";

const KEY_BG = { r: 48, g: 53, b: 70 };
const EMPTY_BG = { r: 8, g: 10, b: 14 };
const KEY_FG = { r: 245, g: 247, b: 252 };
const AGENT_OFF = { r: 105, g: 112, b: 130 };
const RECENT_TODAY = { r: 255, g: 190, b: 71 };

const ACTION_STYLE = Object.freeze({
  APPR: { label: "Genehmigen", accent: { r: 50, g: 215, b: 132 } },
  REJ: { label: "Ablehnen", accent: { r: 245, g: 99, b: 99 } },
  FAST: { label: "Fast Mode", accent: { r: 255, g: 196, b: 61 } },
  SPLIT: { label: "Split", accent: { r: 167, g: 126, b: 255 } },
  NEW: { label: "Quickchat", accent: { r: 55, g: 199, b: 235 } },
  DEL: { label: "Archivieren", accent: { r: 244, g: 153, b: 57 } },
  MIC: { label: "Sprache", accent: { r: 239, g: 92, b: 160 } },
  CODEX: { label: "Open Codex", accent: { r: 93, g: 142, b: 255 } },
});

const requireFromHere = createRequire(import.meta.url);
const NON_EXCLUSIVE_MARKER = Symbol.for("codex-micro.non-exclusive-hid");

/**
 * node-hid seizes devices by default on macOS. A Stream Deck MK.2 can also be
 * held by the macOS event system, so force this process to share the device.
 * The Elgato wrapper does not currently expose node-hid's nonExclusive option.
 */
export function enableNonExclusiveHid(hid, platform = process.platform) {
  const hidAsync = hid?.HIDAsync;
  const originalOpen = hidAsync?.open;
  if (platform !== "darwin" || typeof originalOpen !== "function") return false;
  if (originalOpen[NON_EXCLUSIVE_MARKER]) return true;

  const openShared = function (...args) {
    const optionIndex = typeof args[0] === "string" ? 1 : 2;
    const options = args[optionIndex];
    args[optionIndex] = {
      ...(options && typeof options === "object" ? options : {}),
      nonExclusive: true,
    };
    return originalOpen.apply(this, args);
  };
  Object.defineProperty(openShared, NON_EXCLUSIVE_MARKER, { value: true });
  hidAsync.open = openShared;
  return true;
}

async function loadStreamDeckModule() {
  if (process.platform === "darwin") {
    const deckEntry = requireFromHere.resolve("@elgato-stream-deck/node");
    const requireFromDeck = createRequire(deckEntry);
    enableNonExclusiveHid(requireFromDeck("node-hid"));
  }
  return import("@elgato-stream-deck/node");
}

// LCD dial labels (Stream Deck +). Index = encoder index.
const DIAL_LABELS = {
  [PLUS_DIALS.reason]: { lucide: "brain", text: "Think" },
  [PLUS_DIALS.mic]: { lucide: "mic", text: "Talk" },
  [PLUS_DIALS.codex]: { lucide: "square-terminal", text: "Submit" },
};

/**
 * Drives an Elgato Stream Deck (v7 API) as the Codex Micro's front end.
 *
 * Uses the device's `CONTROLS` model: buttons, encoders (dials), and the LCD
 * segment are discovered at runtime rather than assumed. On a Stream Deck +:
 *   - top row keys   → agent status slots (live state colors + center dot)
 *   - bottom row keys → action keys (Fast / Approve / Reject / Split, with icons)
 *   - dial 0 rotate   → reasoning depth (ENC_CW / ENC_CC); press → ENC_CLK
 *   - dial 1 press    → push-to-talk (mic)
 *   - dial 2 press    → submit (codex)
 *   - LCD strip       → labels for the three active dials
 *
 * `@elgato-stream-deck/node` is an optional dependency, imported dynamically.
 */
export class StreamDeckBackend {
  /**
   * @param {import("./emulator.js").CodexMicroEmulator} emulator
   * @param {object} [opts]
   * @param {string} [opts.path]   specific device path; otherwise first found
   * @param {Array}  [opts.layout] key layout override (see mapping.js)
   * @param {Function} [opts.activateApp] bring Codex to the foreground
   * @param {Function} [opts.runLocalAction] run a local Codex action
   * @param {Function} [opts.loadAgentTitles] read short labels for agent slots
   * @param {Function} [opts.loadAgentEntries] read direct-mode task ids/labels
   * @param {boolean} [opts.directMode] control Codex without an injected shim
   */
  constructor(emulator, opts = {}) {
    this.emulator = emulator;
    this.explicitLayout = opts.layout ?? null;
    this.path = opts.path;
    this.activateApp = opts.activateApp ?? activateCodexApp;
    this.runLocalAction = opts.runLocalAction ?? runLocalCodexAction;
    this.loadAgentTitles = opts.loadAgentTitles ?? loadAgentTitles;
    this.loadAgentEntries = opts.loadAgentEntries ?? null;
    this.directMode = opts.directMode ?? false;
    this.openThread = opts.openThread ?? openCodexThread;
    this.runDirectAction = opts.runDirectAction ?? runDirectCodexAction;
    this.onError = opts.onError ?? (() => {});
    this.deck = null;
    this.layout = opts.layout ?? DEFAULT_LAYOUT;
    this.icons = false;
    this.agentTitles = [];
    this.agentEntries = [];
    this.paintedAgentTitles = [];
    this.titleTimer = null;
    this.usageTimer = null;
    this.usagePending = false;
    this.usageGeneration = 0;
    this.readWeeklyUsage = opts.readWeeklyUsage ?? readWeeklyUsage;
    this.lastLighting = emulator.lighting;
    this.paintChain = Promise.resolve();

    this.buttons = []; // button control defs, indexed by control.index
    this.encoders = []; // encoder control defs
    this.lcd = null; // lcd-segment control def
  }

  async start() {
    let mod;
    try {
      mod = await loadStreamDeckModule();
    } catch {
      throw new Error(
        "@elgato-stream-deck/node is not installed. Run `npm install` (it is an " +
          "optional dependency) or use --input keyboard to test without hardware.",
      );
    }

    const { openStreamDeck, listStreamDecks } = mod;
    let path = this.path;
    if (!path) {
      const found = await listStreamDecks();
      if (!found.length) throw new Error("No Stream Deck found.");
      path = found[0].path;
    }

    this.deck = await openStreamDeck(path);

    // The Elgato app is not running while this backend owns the device, so set
    // a dependable hardware brightness instead of inheriting a dim old value.
    await this.deck.setBrightness(100);

    // Discover controls (v7 model). NUM_KEYS/ICON_SIZE don't exist in v7.
    const controls = this.deck.CONTROLS ?? [];
    this.buttons = controls.filter((c) => c.type === "button").sort((a, b) => a.index - b.index);
    this.encoders = controls.filter((c) => c.type === "encoder").sort((a, b) => a.index - b.index);
    this.lcd = controls.find((c) => c.type === "lcd-segment") ?? null;

    this.icons = await canRenderIcons();
    this.layout = this.explicitLayout ?? layoutForKeyCount(this.buttons.length);

    await this.deck.clearPanel();

    // v7: both key and dial presses arrive via down/up with a control object.
    this.deck.on("down", (control) => this._onDown(control));
    this.deck.on("up", (control) => this._onUp(control));
    this.deck.on("rotate", (control, amount) => this._onRotate(control, amount));
    this.deck.on("error", (error) => this.onError(error));

    this.emulator.on("lighting", (model) => {
      this.lastLighting = model;
      this._queuePaint(() => this._paint(model)).catch(() => {});
    });

    await this._refreshAgentTitles(false);
    await this._paintStatic();
    await this._paintLcdLabels();
    this.titleTimer = setInterval(
      () => this._queuePaint(() => this._refreshAgentTitles(true)).catch(() => {}),
      2000,
    );
    this.titleTimer.unref?.();
    if (this.layout.some(entry => entry.kind === "usage")) {
      void this._refreshUsage();
      this.usageTimer = setInterval(() => void this._refreshUsage(), 60000);
      this.usageTimer.unref?.();
    }
    return this.deck;
  }

  // --- input ---------------------------------------------------------------

  _onDown(control) {
    if (control.type === "button") {
      console.error(`Stream Deck button down: ${control.index}`);
      const resolved = resolveKey(control.index, this.layout);
      if (resolved) {
        if (this.directMode) {
          if (resolved.agent != null) {
            const threadId = this.agentEntries[resolved.agent]?.threadId;
            if (threadId) this.openThread(threadId);
          } else {
            const action = resolved.localAction ?? directActionForKeycode(resolved.keycode);
            if (action) this.runDirectAction(action);
          }
          return;
        }
        if (resolved.localAction) {
          this.runLocalAction(resolved.localAction);
          return;
        }
        if (resolved.agent != null) this.activateApp();
        this.emulator.sendKey(resolved.keycode, Act.PRESS, resolved.agent);
      }
    } else if (control.type === "encoder") {
      this._encoderKey(control.index, Act.PRESS);
    }
  }

  _onUp(control) {
    if (this.directMode) return;
    if (control.type === "button") {
      const resolved = resolveKey(control.index, this.layout);
      if (resolved && !resolved.localAction) {
        this.emulator.sendKey(resolved.keycode, Act.RELEASE, resolved.agent);
      }
    } else if (control.type === "encoder") {
      this._encoderKey(control.index, Act.RELEASE);
    }
  }

  _encoderKey(index, act) {
    if (this.directMode) {
      if (act !== Act.PRESS) return;
      if (index === PLUS_DIALS.mic) this.runDirectAction("voice");
      else if (index === PLUS_DIALS.codex) this.runDirectAction("submit");
      return;
    }
    if (index === PLUS_DIALS.mic) this.emulator.sendKey(DIAL_KEYCODES.mic, act);
    else if (index === PLUS_DIALS.codex) this.emulator.sendKey(DIAL_KEYCODES.codex, act);
    else if (index === PLUS_DIALS.reason) this.emulator.sendKey(Keys.ENCODER_CLICK, act);
  }

  _onRotate(control, amount) {
    if (control.index !== PLUS_DIALS.reason) return;
    if (this.directMode) {
      this.runDirectAction(amount >= 0 ? "reasoning-up" : "reasoning-down");
      return;
    }
    // Turning right (clockwise, amount >= 0) raises reasoning depth; left lowers
    // it. The app maps ENC_CC -> ArrowUp and ENC_CW -> ArrowDown in its effort
    // list, so right sends ENC_CC. Each tick is a single event with act === 2
    // (not a press/release pair) — the only form the app treats as rotation.
    const key = amount >= 0 ? Keys.ENCODER_CCW : Keys.ENCODER_CW;
    for (let i = 0; i < Math.max(1, Math.abs(amount)); i++) {
      this.emulator.sendKey(key, Act.ROTATE);
    }
  }

  // --- output --------------------------------------------------------------

  /** Keep all HID image writes ordered; overlapping reports can be dropped. */
  _queuePaint(work) {
    const next = this.paintChain.then(work, work);
    this.paintChain = next.catch(() => {});
    return next;
  }

  /** Paint the complete dark key set once; live agent colors update afterwards. */
  async _paintStatic() {
    for (let i = 0; i < this.layout.length; i++) {
      if (this.layout[i]?.kind === "action" || this.layout[i]?.kind === "local") {
        await this._drawAction(i);
      }
      else if (this.layout[i]?.kind === "agent") {
        const slot = this.layout[i].slot;
        await this._drawAgent(i, slot, AGENT_OFF, null);
      }
      else if (this.layout[i]?.kind === "usage") await this._drawUsage(i, null);
      else await this._fillKey(i, EMPTY_BG);
    }
  }

  /** Paint agent-slot colors from the latest lighting model. */
  async _paint(model) {
    for (let i = 0; i < this.layout.length; i++) {
      const entry = this.layout[i];
      if (entry?.kind !== "agent") continue;
      const thread = model.slots[entry.slot];
      const accent = agentAccent(thread);
      await this._drawAgent(i, entry.slot, accent, thread);
    }
  }

  async _drawAgent(keyIndex, slot, accent, thread = null) {
    const entry = this.agentEntries[slot] ?? null;
    return this._fillKey(keyIndex, KEY_BG, {
      badge: `A${slot + 1}`,
      label: this.agentTitles[slot] ?? "Agent",
      detail: this.directMode ? agentDirectStatusLabel(entry) : agentStatusLabel(thread),
      accent: this.directMode ? agentDirectStatusAccent(entry) : accent,
      fg: KEY_FG,
      emphasis: true,
    });
  }

  async _refreshAgentTitles(repaint) {
    const entries = this.loadAgentEntries ? await this.loadAgentEntries(5) : null;
    const titles = entries
      ? entries.map((entry) => entry?.title ?? "AGENT")
      : await this.loadAgentTitles(5);
    if (!Array.isArray(titles)) return;
    const next = titles.slice(0, 5);
    this.agentEntries = Array.isArray(entries) ? entries.slice(0, 5) : [];
    this.agentTitles = next;
    if (!repaint || !this.deck) return;
    const signature = this.directMode
      ? next.map((title, slot) => `${title}:${agentDirectStatusLabel(this.agentEntries[slot])}`)
      : next;
    if (JSON.stringify(signature) === JSON.stringify(this.paintedAgentTitles)) return;
    let painted = true;
    for (let i = 0; i < this.layout.length; i++) {
      const entry = this.layout[i];
      if (entry?.kind !== "agent") continue;
      const thread = this.lastLighting?.slots?.[entry.slot];
      const accent = agentAccent(thread);
      painted = (await this._drawAgent(i, entry.slot, accent, thread)) && painted;
    }
    if (painted) this.paintedAgentTitles = [...signature];
  }

  async _drawAction(keyIndex) {
    const cap = keycapAt(keyIndex, this.layout);
    const lucide = cap ? ICON_TO_LUCIDE[cap.icon] ?? null : null;
    const style = ACTION_STYLE[cap?.id] ?? { label: cap?.id ?? "", accent: KEY_FG };
    await this._fillKey(keyIndex, KEY_BG, {
      lucide,
      ...style,
      fg: style.accent,
      emphasis: true,
      accentStrength: 0.34,
    });
  }

  async _drawUsage(keyIndex, remaining) {
    const button = this.buttons[keyIndex];
    if (!this.deck || button?.feedbackType !== "lcd") return;
    const buffer = await renderWeeklyGauge(remaining, button.pixelSize?.width ?? 96);
    await this.deck.fillKeyBuffer(keyIndex, buffer, { format: "rgb" });
  }

  async _refreshUsage() {
    if (this.usagePending || !this.deck) return;
    this.usagePending = true;
    const generation = this.usageGeneration;
    try {
      let remaining = null;
      try { remaining = await this.readWeeklyUsage(); } catch { /* display unavailable */ }
      if (generation !== this.usageGeneration || !this.deck) return;
      await this._queuePaint(async () => {
        if (generation !== this.usageGeneration || !this.deck) return;
        for (let i = 0; i < this.layout.length; i++) {
          if (this.layout[i]?.kind === "usage") await this._drawUsage(i, remaining);
        }
      });
    } catch (error) {
      this.onError(error);
    } finally {
      this.usagePending = false;
    }
  }

  /** Fill one key, using the button's real pixel size for image feedback. */
  async _fillKey(keyIndex, bg, { lucide = null, accent = null, label = "", badge = "", detail = "", fg = null, emphasis = false, accentStrength = 0.20 } = {}) {
    if (!this.deck) return;
    const button = this.buttons[keyIndex];
    const canImage = button?.feedbackType === "lcd" && this.icons && (lucide || accent || label || badge || detail);

    if (canImage) {
      const size = button.pixelSize?.width ?? 96;
      const buf = await renderKey({ size, bg, lucide, accent, label, badge, detail, fg, emphasis, accentStrength });
      if (buf) {
        try {
          await this.deck.fillKeyBuffer(keyIndex, buf, { format: "rgb" });
          return true;
        } catch {
          /* fall through to color */
        }
      }
    }
    try {
      await this.deck.fillKeyColor(keyIndex, bg.r, bg.g, bg.b);
      return !canImage;
    } catch {
      /* key may not support color feedback */
      return false;
    }
  }

  /** Draw dial labels on the LCD strip so the touchscreen is lit and useful. */
  async _paintLcdLabels() {
    if (!this.deck || !this.lcd || !this.icons) return;
    if (typeof this.deck.fillLcdRegion !== "function") return;

    const { width, height } = this.lcd.pixelSize;
    const zoneCount = Math.max(this.encoders.length, 1);
    const zoneW = Math.floor(width / zoneCount);

    for (let i = 0; i < zoneCount; i++) {
      const label = DIAL_LABELS[i] ?? { lucide: null, text: "" };
      try {
        const buf = await renderLcdZone({ width: zoneW, height, lucide: label.lucide, text: label.text });
        if (buf) {
          await this.deck.fillLcdRegion(this.lcd.id, i * zoneW, 0, buf, {
            format: "rgb",
            width: zoneW,
            height,
          });
        }
      } catch {
        /* LCD labels are best-effort */
      }
    }
  }

  async stop() {
    this.usageGeneration++;
    if (this.usageTimer) clearInterval(this.usageTimer);
    this.usageTimer = null;
    if (this.titleTimer) clearInterval(this.titleTimer);
    this.titleTimer = null;
    if (!this.deck) return;
    const deck = this.deck;
    try {
      await deck.clearPanel();
    } catch {
      /* ignore */
    }
    try {
      await deck.close();
    } catch {
      /* ignore */
    }
    if (this.deck === deck) this.deck = null;
  }
}

/** Bring the running Codex/ChatGPT desktop app in front of RDP and other apps. */
function activateCodexApp() {
  return activateCodexAppDirect(execFile);
}

/** Run actions that do not have a dedicated Codex Micro keycode. */
function runLocalCodexAction(action) {
  activateCodexApp();
  if (action === "open-codex") return;

  const shortcut =
    action === "quick-chat"
      ? 'keystroke "n" using {command down, option down}'
      : action === "archive"
        ? 'keystroke "a" using {command down, shift down}'
        : null;
  if (!shortcut) return;

  setTimeout(() => {
    execFile(
      "/usr/bin/osascript",
      ["-e", `tell application "System Events" to ${shortcut}`],
      () => {},
    );
  }, 200);
}

// Use the host's live task color as the accent; inactive slots retain violet.
function agentAccent(thread) {
  if (thread && thread.b !== 0 && thread.e !== Effect.off) return unpackRgb(thread.c ?? 0);
  return AGENT_OFF;
}

export function agentStatusLabel(thread) {
  if (!thread || thread.b === 0 || thread.e === Effect.off) return "FREI";
  const color = (thread.c ?? 0) >>> 0;
  if (color === STATE_COLOR.working) return "DENKT";
  if (color === STATE_COLOR.unread) return "FERTIG";
  if (color === STATE_COLOR["awaiting-approval"] || color === STATE_COLOR["awaiting-response"]) return "EINGABE";
  if (color === STATE_COLOR.error) return "FEHLER";
  if (color === STATE_COLOR.idle) return "BEREIT";
  return "AKTIV";
}

/** Factual direct-mode status: how recently Codex updated the task catalogue. */
export function agentRecencyLabel(entry, now = Date.now()) {
  if (!entry?.threadId || !entry?.recencyAt) return "FREI";
  const ageMinutes = Math.max(0, Math.floor((now - entry.recencyAt * 1000) / 60000));
  if (ageMinutes < 2) return "JETZT";
  if (ageMinutes < 60) return `${ageMinutes} MIN`;
  const ageHours = Math.floor(ageMinutes / 60);
  if (ageHours < 24) return `${ageHours} STD`;
  return `${Math.min(99, Math.floor(ageHours / 24))} TAGE`;
}

export function agentDirectStatusLabel(entry, now = Date.now()) {
  if (entry?.runState === "working") return "ARBEITET";
  if (entry?.runState === "complete") return "BEREIT";
  if (entry?.runState === "error") return "FEHLER";
  return agentRecencyLabel(entry, now);
}

export function agentDirectStatusAccent(entry, now = Date.now()) {
  if (entry?.runState === "working") return unpackRgb(STATE_COLOR.working);
  // Direct mode has no reliable unread/read signal. A completed turn is
  // therefore neutral "ready", not a misleading green success state.
  if (entry?.runState === "complete") return AGENT_OFF;
  if (entry?.runState === "error") return unpackRgb(STATE_COLOR.error);
  if (!entry?.threadId || !entry?.recencyAt) return AGENT_OFF;
  const ageMinutes = Math.max(0, (now - entry.recencyAt * 1000) / 60000);
  if (ageMinutes < 24 * 60) return RECENT_TODAY;
  return AGENT_OFF;
}
