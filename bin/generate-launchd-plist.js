#!/usr/bin/env node
import fs from "node:fs";

const [source, destination, nodeBin, runtimeDir, logsDir, manifest] = process.argv.slice(2);
if (![source, destination, nodeBin, runtimeDir, logsDir, manifest].every(Boolean)) {
  throw new Error("Usage: generate-launchd-plist.js TEMPLATE DESTINATION NODE RUNTIME LOGS MANIFEST");
}
const escapeXml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const environment = ["CODEX_DECK_LOCALE", "CODEX_DECK_FAST_COMMAND", "CODEX_DECK_SPLIT_COMMAND", "CODEX_CLI_BIN"]
  .filter((key) => process.env[key])
  .map((key) => `    <key>${key}</key>\n    <string>${escapeXml(process.env[key])}</string>`)
  .join("\n");
const plist = fs.readFileSync(source, "utf8")
  .replaceAll("__CODEX_NODE_BIN__", escapeXml(nodeBin))
  .replaceAll("__CODEX_MICRO_RUNTIME__", escapeXml(runtimeDir))
  .replaceAll("__CODEX_MICRO_LOG_DIR__", escapeXml(logsDir))
  .replace("__CODEX_MICRO_ENVIRONMENT__", environment);
fs.writeFileSync(destination, plist, { mode: 0o644 });
fs.writeFileSync(manifest, JSON.stringify({ label: "de.kundel.codex-micro", runtimeDir, version: 1 }) + "\n", { mode: 0o600 });
