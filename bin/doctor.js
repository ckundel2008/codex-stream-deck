#!/usr/bin/env node
// Read-only environment check. It opens no HID device and emits no input.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const project = path.resolve(import.meta.dirname, "..");
const nodeParts = process.versions.node.split(".").map(Number);
const nodeOk = nodeParts[0] > 22 || (nodeParts[0] === 22 && nodeParts[1] >= 13);
let sqliteOk = false;
try {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  db.close();
  sqliteOk = true;
} catch { /* reported below */ }
const deckModule = path.join(project, "node_modules", "@elgato-stream-deck", "node", "package.json");
const directEntry = path.join(project, "bin", "codex-streamdeck-direct.js");
const catalog = path.join(os.homedir(), ".codex", "sqlite", "codex-dev.db");
const codexCli = spawnSync("/usr/bin/which", ["codex"], { encoding: "utf8" });
const checks = [
  ["macOS", process.platform === "darwin", process.platform],
  ["Node.js >= 22.13", nodeOk, `v${process.versions.node}`],
  ["node:sqlite", sqliteOk, sqliteOk ? "available" : "unavailable"],
  ["Direct bridge entry", fs.existsSync(directEntry), fs.existsSync(directEntry) ? "available" : "missing"],
  ["Stream Deck module", fs.existsSync(deckModule), fs.existsSync(deckModule) ? "installed" : "missing; run npm install"],
  ["Local Codex catalogue", fs.existsSync(catalog), fs.existsSync(catalog) ? "available" : "not created yet"],
  ["Codex CLI", codexCli.status === 0, codexCli.status === 0 ? "available" : "not on PATH"],
];
for (const [name, ok, detail] of checks) console.log(`${ok ? "OK" : "CHECK"}  ${name}: ${detail}`);
console.log("Read-only: no Stream Deck/HID device was opened and no app, key, dial, or network action was performed.");
process.exitCode = checks.slice(0, 5).every(([, ok]) => ok) ? 0 : 1;
