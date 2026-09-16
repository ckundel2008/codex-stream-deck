// Synthetic publication illustration; never loads user tasks or opens hardware.
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { CodexMicroEmulator } from "../src/emulator.js";
import { StreamDeckBackend } from "../src/streamdeck.js";
import { renderKey } from "../src/renderer.js";
import { renderWeeklyGauge } from "../src/weekly-usage.js";

const size = 144, gap = 16, margin = 30;
const width = 5 * size + 4 * gap + margin * 2;
const height = 3 * size + 2 * gap + margin * 2;
const layers = [];
async function add(index, buffer) {
  layers.push({ input: await sharp(buffer, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer(),
    left: margin + (index % 5) * (size + gap), top: margin + Math.floor(index / 5) * (size + gap) });
}
const backend = new StreamDeckBackend(new CodexMicroEmulator(), { activateApp() {} });
backend._fillKey = async (index, bg, options) => add(index, await renderKey({ size, bg, ...options }));
for (let i = 0; i < 5; i++) {
  const accent = i < 2 ? { r: 48, g: 79, b: 254 } : { r: 105, g: 112, b: 130 };
  await add(i, await renderKey({ size, bg: { r: 48, g: 53, b: 70 }, accent, badge: String(i + 1),
    label: ["WEB APP", "REVIEW", "DOCS", "TESTS", "RELEASE"][i], detail: i < 2 ? "ARBEITET" : "BEREIT", emphasis: true }));
}
for (const i of [5, 6, 8, 9, 10, 12, 13, 14]) await backend._drawAction(i);
await add(7, await renderWeeklyGauge(75, size));
await add(11, await renderKey({ size, bg: { r: 8, g: 10, b: 14 } }));
await sharp({ create: { width, height, channels: 3, background: "#0d1117" } }).composite(layers).png().toFile(fileURLToPath(new URL("../assets/layout-preview.png", import.meta.url)));
console.log("Rendered assets/layout-preview.png using synthetic data.");
