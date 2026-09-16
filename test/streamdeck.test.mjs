// Unit tests for the Stream Deck backend's input mapping that don't need a
// physical device: they call the handlers directly and assert the emitted
// v.oai.hid notifications. Guards the encoder-rotation contract in particular.

import { test } from "node:test";
import assert from "node:assert/strict";

import { CodexMicroEmulator } from "../src/emulator.js";
import {
  agentDirectStatusAccent,
  agentDirectStatusLabel,
  enableNonExclusiveHid,
  StreamDeckBackend,
} from "../src/streamdeck.js";
import { DEFAULT_LAYOUT, PLUS_DIALS, DIAL_KEYCODES, PLUS_LAYOUT } from "../src/mapping.js";
import { Notify } from "../src/protocol.js";

/** Collect every notification the emulator emits. */
function capture(emulator) {
  const notes = [];
  emulator.on("send", (line) => {
    const obj = JSON.parse(line);
    if (obj.m === Notify.HID) notes.push(obj.p);
  });
  return notes;
}

test("macOS opens node-hid devices non-exclusively", async () => {
  const calls = [];
  const hid = {
    HIDAsync: {
      async open(...args) {
        calls.push(args);
        return "opened";
      },
    },
  };

  assert.equal(enableNonExclusiveHid(hid, "darwin"), true);
  assert.equal(await hid.HIDAsync.open("deck-path"), "opened");
  assert.equal(await hid.HIDAsync.open(4057, 128, { nonExclusive: false }), "opened");
  assert.deepEqual(calls, [
    ["deck-path", { nonExclusive: true }],
    [4057, 128, { nonExclusive: true }],
  ]);

  // Applying the hook repeatedly must not wrap or alter the call again.
  assert.equal(enableNonExclusiveHid(hid, "darwin"), true);
  await hid.HIDAsync.open("deck-path", { custom: true });
  assert.deepEqual(calls[2], ["deck-path", { custom: true, nonExclusive: true }]);
});

test("non-macOS node-hid access remains unchanged", () => {
  const original = async () => "opened";
  const hid = { HIDAsync: { open: original } };
  assert.equal(enableNonExclusiveHid(hid, "linux"), false);
  assert.equal(hid.HIDAsync.open, original);
});

test("action colors match their semantics", async () => {
  const backend = new StreamDeckBackend(new CodexMicroEmulator(), {
    layout: DEFAULT_LAYOUT,
  });
  const rendered = new Map();
  backend._fillKey = async (index, _background, options) => {
    rendered.set(index, options);
    return true;
  };

  for (const index of [5, 6, 8, 9, 10, 12, 13, 14]) {
    await backend._drawAction(index);
  }

  assert.deepEqual(
    [...rendered].map(([index, options]) => [
      index,
      options.label,
      options.accent,
      options.fg,
      options.emphasis,
      options.accentStrength,
    ]),
    [
      [5, "Genehmigen", { r: 50, g: 215, b: 132 }, { r: 50, g: 215, b: 132 }, true, 0.34],
      [6, "Ablehnen", { r: 245, g: 99, b: 99 }, { r: 245, g: 99, b: 99 }, true, 0.34],
      [8, "Fast Mode", { r: 255, g: 196, b: 61 }, { r: 255, g: 196, b: 61 }, true, 0.34],
      [9, "Split", { r: 167, g: 126, b: 255 }, { r: 167, g: 126, b: 255 }, true, 0.34],
      [10, "Quickchat", { r: 55, g: 199, b: 235 }, { r: 55, g: 199, b: 235 }, true, 0.34],
      [12, "Archivieren", { r: 244, g: 153, b: 57 }, { r: 244, g: 153, b: 57 }, true, 0.34],
      [13, "Sprache", { r: 239, g: 92, b: 160 }, { r: 239, g: 92, b: 160 }, true, 0.34],
      [14, "Open Codex", { r: 93, g: 142, b: 255 }, { r: 93, g: 142, b: 255 }, true, 0.34],
    ],
  );
});

test("working direct-mode tasks are blue instead of recent green", () => {
  const working = {
    threadId: "00000000-0000-4000-8000-000000000011",
    recencyAt: Date.now() / 1000,
    runState: "working",
  };
  assert.equal(agentDirectStatusLabel(working), "ARBEITET");
  assert.deepEqual(agentDirectStatusAccent(working), { r: 48, g: 79, b: 254 });
});

test("finished direct-mode results turn grey only after Codex marks them read", () => {
  const complete = { runState: "complete", hasUnreadTurn: true };
  assert.equal(agentDirectStatusLabel(complete), "FERTIG");
  assert.deepEqual(agentDirectStatusAccent(complete), { r: 0, g: 255, b: 76 });
  const read = { ...complete, hasUnreadTurn: false };
  assert.equal(agentDirectStatusLabel(read), "BEREIT");
  assert.deepEqual(agentDirectStatusAccent(read), { r: 105, g: 112, b: 130 });
  const unknown = { runState: "complete", hasUnreadTurn: null };
  assert.equal(agentDirectStatusLabel(unknown), "FERTIG");
  assert.deepEqual(agentDirectStatusAccent(unknown), { r: 0, g: 255, b: 76 });
  assert.equal(agentDirectStatusLabel({ ...complete, runState: "working" }), "ARBEITET");
});

test("the deck repaints when a completed result is read and when a new unread result arrives", async () => {
  let hasUnreadTurn = true;
  const backend = new StreamDeckBackend(new CodexMicroEmulator(), {
    directMode: true,
    loadAgentEntries: () => [{ threadId: "00000000-0000-4000-8000-000000000011", title: "TEST", runState: "complete", hasUnreadTurn }],
  });
  backend.deck = {};
  const paints = [];
  backend._fillKey = async (key, bg, options) => { if (key === 0) paints.push(options); return true; };
  await backend._refreshAgentTitles(true);
  hasUnreadTurn = false;
  await backend._refreshAgentTitles(true);
  await backend._refreshAgentTitles(true);
  hasUnreadTurn = true;
  await backend._refreshAgentTitles(true);
  assert.deepEqual(paints.map(({ detail, accent }) => [detail, accent]), [
    ["FERTIG", { r: 0, g: 255, b: 76 }],
    ["BEREIT", { r: 105, g: 112, b: 130 }],
    ["FERTIG", { r: 0, g: 255, b: 76 }],
  ]);
});

test("reasoning dial rotation emits ENC_CW/ENC_CC with act 2 (single tick)", () => {
  const emulator = new CodexMicroEmulator();
  const backend = new StreamDeckBackend(emulator);
  const notes = capture(emulator);

  backend._onRotate({ type: "encoder", index: PLUS_DIALS.reason }, 1); // right -> raise
  backend._onRotate({ type: "encoder", index: PLUS_DIALS.reason }, -1); // left  -> lower

  // Right (clockwise) raises reasoning depth, which the app reads as ENC_CC.
  assert.deepEqual(notes, [
    { k: "ENC_CC", act: 2 },
    { k: "ENC_CW", act: 2 },
  ]);
});

test("rotating other dials does nothing", () => {
  const emulator = new CodexMicroEmulator();
  const backend = new StreamDeckBackend(emulator);
  const notes = capture(emulator);
  backend._onRotate({ type: "encoder", index: PLUS_DIALS.mic }, 1);
  assert.equal(notes.length, 0);
});

test("dial presses map to push-to-talk and submit", () => {
  const emulator = new CodexMicroEmulator();
  const backend = new StreamDeckBackend(emulator);
  const notes = capture(emulator);

  backend._onDown({ type: "encoder", index: PLUS_DIALS.mic });
  backend._onUp({ type: "encoder", index: PLUS_DIALS.mic });
  backend._onDown({ type: "encoder", index: PLUS_DIALS.codex });
  backend._onUp({ type: "encoder", index: PLUS_DIALS.codex });

  assert.deepEqual(notes, [
    { k: DIAL_KEYCODES.mic, act: 1 },
    { k: DIAL_KEYCODES.mic, act: 0 },
    { k: DIAL_KEYCODES.codex, act: 1 },
    { k: DIAL_KEYCODES.codex, act: 0 },
  ]);
});

test("top-row keys send agent slots, bottom-row keys send actions", () => {
  const emulator = new CodexMicroEmulator();
  const backend = new StreamDeckBackend(emulator, { layout: PLUS_LAYOUT, activateApp: () => {} });
  const notes = capture(emulator);

  backend._onDown({ type: "button", index: 0 }); // agent slot 0
  backend._onDown({ type: "button", index: 4 }); // first action (FAST / ACT06)

  assert.equal(notes[0].k, "AG00");
  assert.equal(notes[0].ag, 0);
  assert.equal(notes[1].k, "ACT06");
});

test("stop closes the device even if clearing its panel fails", async () => {
  const backend = new StreamDeckBackend(new CodexMicroEmulator());
  let closes = 0;
  backend.deck = {
    clearPanel: async () => { throw Error("device write failed"); },
    close: async () => { closes++; },
  };

  await backend.stop();
  assert.equal(closes, 1);
  assert.equal(backend.deck, null);
});
