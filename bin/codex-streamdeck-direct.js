#!/usr/bin/env node
import { setTimeout as wait } from "node:timers/promises";
import { CodexMicroEmulator } from "../src/emulator.js";
import { loadAgentEntries } from "../src/agent-titles.js";
import { StreamDeckBackend } from "../src/streamdeck.js";

const args = process.argv.slice(2);
if (args.length) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log("Usage: codex-stream-deck\n\nStart the macOS direct Stream Deck bridge. Quit Elgato and other bridge instances first.\nConfiguration: CODEX_DECK_LOCALE, CODEX_DECK_FAST_COMMAND, CODEX_DECK_SPLIT_COMMAND, CODEX_CLI_BIN.\nRun npm run doctor for a read-only environment check. Stop with Ctrl+C.");
    process.exit(0);
  }
  console.error("Unknown option. Use --help; direct mode has no keyboard-input emulator.");
  process.exit(2);
}
if (process.platform !== "darwin") {
  console.error("Direct mode requires macOS.");
  process.exit(1);
}

let stopping = false;
let backend = null;
let wake = null;

function requestStop() {
  stopping = true;
  wake?.();
}
process.on("SIGINT", requestStop);
process.on("SIGTERM", requestStop);

async function run() {
  console.error("Codex Stream Deck direct mode starting (no app restart required).");
  while (!stopping) {
    let disconnected;
    const disconnectedPromise = new Promise((resolve) => { disconnected = resolve; });
    wake = disconnected;
    backend = new StreamDeckBackend(new CodexMicroEmulator(), {
      directMode: true,
      // A shim capture freezes when Codex updates. Direct mode follows Codex's
      // live local catalogue, so newly opened tasks appear automatically.
      loadAgentEntries: (limit) => loadAgentEntries(limit, undefined, null),
      onError: (error) => {
        console.error(`Stream Deck connection lost: ${error?.message ?? error}`);
        disconnected();
      },
    });

    try {
      await backend.start();
      console.error("Stream Deck ready (direct mode). Codex remains untouched.");
      await disconnectedPromise;
    } catch (error) {
      console.error(`Stream Deck unavailable: ${error?.message ?? error}`);
    } finally {
      await backend.stop().catch(() => {});
      backend = null;
    }
    if (!stopping) {
      console.error("Retrying the Stream Deck connection in 5 seconds.");
      await wait(5000).catch(() => {});
    }
  }
}

await run();
