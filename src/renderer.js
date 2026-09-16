// Renders compact Stream Deck key cards with a Lucide glyph or agent number,
// a short label, and a color-coded accent. The dark visual system keeps all
// fifteen keys cohesive while retaining Codex's live per-agent status colors.
//
// Rasterisation uses `sharp` and the icon SVGs come from `lucide-static` — both
// OPTIONAL dependencies. If either is missing, the renderer degrades gracefully
// to solid color fills, which every Stream Deck can do natively. Rendered key
// images are cached so we only rasterise each (icon, colors, size) once.

let sharp = null;
let lucideDir = null;
let loaded = false;

async function ensureDeps() {
  if (loaded) return;
  loaded = true;
  try {
    ({ default: sharp } = await import("sharp"));
  } catch {
    sharp = null;
  }
  try {
    const mod = await import("lucide-static");
    // lucide-static exposes an icons directory; resolve its path.
    const { fileURLToPath } = await import("node:url");
    const path = await import("node:path");
    const base = path.dirname(fileURLToPath(import.meta.resolve("lucide-static/package.json")));
    lucideDir = path.join(base, "icons");
    void mod;
  } catch {
    lucideDir = null;
  }
}

/** Whether image rendering (icons) is available in this environment. */
export async function canRenderIcons() {
  await ensureDeps();
  return Boolean(sharp && lucideDir);
}

const cache = new Map();
const CACHE_LIMIT = 256;

function cacheImage(key, buffer) {
  cache.set(key, buffer);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
}

/**
 * Produce a key image buffer (raw RGB) or return null if icons can't be
 * rendered (caller should fall back to a solid color fill).
 *
 * @param {object} spec
 * @param {number} spec.size          key pixel size (square), e.g. 72 or 96
 * @param {{r,g,b}} spec.bg           background color
 * @param {{r,g,b}} [spec.fg]         icon color (default: readable on bg)
 * @param {string|null} [spec.lucide] Lucide icon name, or null for none
 * @param {{r,g,b}} [spec.accent]     top status/category accent
 * @param {string} [spec.label]       short bottom label
 * @param {string} [spec.badge]       large centered text (agent keys)
 * @param {string} [spec.detail]      small status line below the label
 * @param {boolean} [spec.emphasis]   strong status treatment for agent keys
 * @param {number} [spec.accentStrength] translucent accent fill (0..1)
 * @returns {Promise<Buffer|null>}
 */
export async function renderKey(spec) {
  await ensureDeps();
  if (!sharp) return null;

  const {
    size,
    bg,
    fg,
    lucide,
    accent,
    label = "",
    badge = "",
    detail = "",
    emphasis = false,
    accentStrength = 0.20,
  } = spec;
  const key = JSON.stringify(spec);
  if (cache.has(key)) return cache.get(key);

  const fs = await import("node:fs/promises");
  const layers = [];
  const color = fg ?? readableOn(bg);
  const accentColor = accent ?? color;
  const borderColor = emphasis ? accentColor : { r: 91, g: 98, b: 120 };
  const borderWidth = emphasis ? 4 : 1;
  const card = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect x="2" y="2" width="${size - 4}" height="${size - 4}" rx="${Math.max(7, Math.round(size * 0.11))}" ` +
        `fill="rgb(${bg.r},${bg.g},${bg.b})" stroke="rgb(${borderColor.r},${borderColor.g},${borderColor.b})" stroke-width="${borderWidth}"/>` +
      (emphasis
        ? `<rect x="6" y="6" width="${size - 12}" height="${size - 12}" rx="${Math.max(5, Math.round(size * 0.08))}" ` +
            `fill="rgb(${accentColor.r},${accentColor.g},${accentColor.b})" fill-opacity="${Math.max(0, Math.min(1, accentStrength))}"/>`
        : `<path d="M${Math.round(size * 0.16)} 3 H${Math.round(size * 0.84)}" ` +
            `stroke="rgb(${accentColor.r},${accentColor.g},${accentColor.b})" stroke-width="4" stroke-linecap="round"/>`) +
    `</svg>`,
  );
  layers.push({ input: card, top: 0, left: 0 });

  if (lucide && lucideDir) {
    try {
      let svg = await fs.readFile(`${lucideDir}/${lucide}.svg`, "utf8");
      const hex = `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
      // Lucide strokes use currentColor; set it explicitly and leave room for
      // the bottom label.
      svg = svg
        .replace("<svg", `<svg color="${hex}"`)
        .replace(/stroke="[^"]*"/g, `stroke="${hex}"`)
        .replace(/stroke-width="[^"]*"/g, `stroke-width="2.25"`);
      const glyph = Math.round(size * (label ? 0.43 : 0.52));
      const iconPng = await sharp(Buffer.from(svg)).resize(glyph, glyph).png().toBuffer();
      layers.push({
        input: iconPng,
        top: Math.round(size * 0.17),
        left: Math.round((size - glyph) / 2),
      });
    } catch {
      /* icon missing — background only */
    }
  }

  if (badge) {
    const badgeSize = Math.round(size * (detail ? 0.30 : 0.37));
    const badgeY = Math.round(size * (detail ? 0.40 : 0.57));
    const badgeSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
        `<text x="50%" y="${badgeY}" text-anchor="middle" ` +
          `font-family="-apple-system,BlinkMacSystemFont,'SF Pro Display',Arial,sans-serif" ` +
          `font-size="${badgeSize}" font-weight="750" fill="rgb(${color.r},${color.g},${color.b})">` +
          `${escapeXml(badge)}</text>` +
      `</svg>`,
    );
    layers.push({ input: badgeSvg, top: 0, left: 0 });
  }

  if (label) {
    const fontSize = Math.max(8, Math.round(size * 0.115));
    const labelY = Math.round(size * (detail ? 0.67 : 0.87));
    const labelSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
        `<text x="50%" y="${labelY}" text-anchor="middle" ` +
          `font-family="-apple-system,BlinkMacSystemFont,'SF Pro Text',Arial,sans-serif" ` +
          `font-size="${fontSize}" font-weight="650" letter-spacing="0.35" ` +
          `fill="rgb(238,241,248)">${escapeXml(label.toUpperCase())}</text>` +
      `</svg>`,
    );
    layers.push({ input: labelSvg, top: 0, left: 0 });
  }

  if (detail) {
    const detailSize = Math.max(7, Math.round(size * 0.10));
    const detailSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
        `<text x="50%" y="${Math.round(size * 0.88)}" text-anchor="middle" ` +
          `font-family="-apple-system,BlinkMacSystemFont,'SF Pro Text',Arial,sans-serif" ` +
          `font-size="${detailSize}" font-weight="750" letter-spacing="0.45" ` +
          `fill="rgb(${accentColor.r},${accentColor.g},${accentColor.b})">` +
          `${escapeXml(detail.toUpperCase())}</text>` +
      `</svg>`,
    );
    layers.push({ input: detailSvg, top: 0, left: 0 });
  }

  const img = sharp({
    create: { width: size, height: size, channels: 3, background: bg },
  });
  if (layers.length) img.composite(layers);

  const buf = await img.removeAlpha().raw().toBuffer();
  cacheImage(key, buf);
  return buf;
}

/**
 * Render an LCD dial-zone label: dark background, a centered Lucide icon, and an
 * optional caption underneath. Returns a raw RGB buffer, or null if sharp/lucide
 * aren't available.
 *
 * @param {object} spec
 * @param {number} spec.width
 * @param {number} spec.height
 * @param {string|null} spec.lucide
 * @param {string} [spec.text]
 * @param {{r,g,b}} [spec.bg]
 * @param {{r,g,b}} [spec.fg]
 */
export async function renderLcdZone(spec) {
  await ensureDeps();
  if (!sharp) return null;

  const { width, height, lucide, text = "", bg = { r: 16, g: 16, b: 18 }, fg = { r: 235, g: 235, b: 235 } } = spec;
  const key = "lcd:" + JSON.stringify(spec);
  if (cache.has(key)) return cache.get(key);

  const fs = await import("node:fs/promises");
  const layers = [];
  const glyph = Math.round(Math.min(width, height) * (text ? 0.42 : 0.6));

  if (lucide && lucideDir) {
    try {
      let svg = await fs.readFile(`${lucideDir}/${lucide}.svg`, "utf8");
      const hex = `#${toHex(fg.r)}${toHex(fg.g)}${toHex(fg.b)}`;
      svg = svg.replace("<svg", `<svg color="${hex}"`).replace(/stroke="[^"]*"/g, `stroke="${hex}"`);
      const iconPng = await sharp(Buffer.from(svg)).resize(glyph, glyph).png().toBuffer();
      layers.push({ input: iconPng, top: Math.round(height * 0.14), left: Math.round((width - glyph) / 2) });
    } catch {
      /* icon missing */
    }
  }

  if (text) {
    const fontSize = Math.round(height * 0.2);
    const label = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<text x="50%" y="${height - fontSize / 2}" text-anchor="middle" font-family="sans-serif" ` +
      `font-size="${fontSize}" fill="rgb(${fg.r},${fg.g},${fg.b})">${escapeXml(text)}</text></svg>`;
    layers.push({ input: Buffer.from(label), top: 0, left: 0 });
  }

  const img = sharp({ create: { width, height, channels: 3, background: bg } });
  if (layers.length) img.composite(layers);
  const buf = await img.removeAlpha().raw().toBuffer();
  cacheImage(key, buf);
  return buf;
}

function escapeXml(s) {
  return String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]);
}

/** Pick black or white for legibility against a background color. */
function readableOn(bg) {
  const luma = 0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b;
  return luma > 140 ? { r: 20, g: 20, b: 20 } : { r: 245, g: 245, b: 245 };
}

function toHex(n) {
  return n.toString(16).padStart(2, "0");
}
