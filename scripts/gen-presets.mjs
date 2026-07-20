/**
 * Generates the bundled preset themes (pure JS PNG encoding, zero deps):
 *   assets/presets/<id>/{theme.json, background.png, preview.png}
 * plus the tray template icons and the app icon.
 *
 * The visual direction is the cream/handbook aesthetic: warm neutrals, soft
 * sage and blush accents, gentle gradients, rounded shapes.
 *
 * Usage: node scripts/gen-presets.mjs
 */

import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------- minimal PNG encoder ----------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i += 1) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- scene renderer ----------

const hex = (value) => {
  const n = Number.parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * spec: { from, to, angle, blobs: [{x, y, r, color, strength}], grain }
 * Renders a diagonal gradient with soft additive color blobs and a vignette.
 */
function renderScene(spec, width, height) {
  const out = Buffer.alloc(width * height * 4);
  const from = hex(spec.from);
  const to = hex(spec.to);
  const rad = (spec.angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const blobs = spec.blobs.map((b) => ({ ...b, color: hex(b.color) }));
  const aspect = height / width;
  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const t = clamp01((u * dx + v * dy + 1) / 2);
      let color = mix(from, to, t);
      for (const blob of blobs) {
        const bx = u - blob.x;
        const by = (v - blob.y) * aspect * 1.6;
        const d2 = bx * bx + by * by;
        const w = Math.exp(-d2 / (blob.r * blob.r)) * blob.strength;
        color = mix(color, blob.color, clamp01(w));
      }
      // gentle vignette so UI chrome stays readable
      const cx = u - 0.5;
      const cy = v - 0.5;
      const vignette = 1 - clamp01((cx * cx + cy * cy) * 0.45);
      color = color.map((c) => c * vignette);
      // faint deterministic grain to avoid banding
      const g = (((x * 73856093) ^ (y * 19349663)) % 7) - 3;
      const offset = (y * width + x) * 4;
      out[offset] = Math.max(0, Math.min(255, Math.round(color[0] + g)));
      out[offset + 1] = Math.max(0, Math.min(255, Math.round(color[1] + g)));
      out[offset + 2] = Math.max(0, Math.min(255, Math.round(color[2] + g)));
      out[offset + 3] = 255;
    }
  }
  return out;
}

// ---------- preset definitions ----------

const rgba = (hexValue, alpha) => {
  const [r, g, b] = hex(hexValue);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const PRESETS = [
  {
    id: "cream-sage",
    name: "奶油鼠尾草 Cream Sage",
    tagline: "清晨厨房窗台上的一小盆绿。",
    quote: "GROW SOFTLY",
    scene: {
      from: "#f7f4ef",
      to: "#ebe3d7",
      angle: 35,
      blobs: [
        { x: 0.78, y: 0.22, r: 0.36, color: "#c7d4b2", strength: 0.38 },
        { x: 0.22, y: 0.72, r: 0.42, color: "#e8d5c4", strength: 0.32 },
        { x: 0.55, y: 0.48, r: 0.28, color: "#f0e6d8", strength: 0.28 },
      ],
    },
    colors: { background: "#f7f4ef", panel: "#ffffff", panelAlt: "#faf7f2", accent: "#8a9a6d", accentAlt: "#a8b894", secondary: "#d4a5a5", highlight: "#c9b18a", text: "#3d3630", muted: "#7d756b" },
  },
  {
    id: "peach-blush",
    name: "蜜桃腮红 Peach Blush",
    tagline: "傍晚六点的粉色反光。",
    quote: "STAY GENTLE",
    scene: {
      from: "#faf4f2",
      to: "#f2e4df",
      angle: 55,
      blobs: [
        { x: 0.72, y: 0.2, r: 0.36, color: "#f0b8b0", strength: 0.36 },
        { x: 0.2, y: 0.75, r: 0.4, color: "#e9c6a8", strength: 0.34 },
        { x: 0.5, y: 0.5, r: 0.24, color: "#f7ddd8", strength: 0.3 },
      ],
    },
    colors: { background: "#faf4f2", panel: "#ffffff", panelAlt: "#fdf6f4", accent: "#d17a7a", accentAlt: "#e8a8a0", secondary: "#c9a86c", highlight: "#b87b5c", text: "#3d2e2b", muted: "#8a726d" },
  },
  {
    id: "vanilla-sky",
    name: "香草天空 Vanilla Sky",
    tagline: "云很轻，阳光是温的。",
    quote: "LIGHT AS AIR",
    scene: {
      from: "#f8f6f1",
      to: "#ece6db",
      angle: 25,
      blobs: [
        { x: 0.8, y: 0.15, r: 0.34, color: "#d9e2f0", strength: 0.34 },
        { x: 0.15, y: 0.8, r: 0.42, color: "#f0d9a8", strength: 0.3 },
        { x: 0.55, y: 0.45, r: 0.26, color: "#e8e4dc", strength: 0.28 },
      ],
    },
    colors: { background: "#f8f6f1", panel: "#ffffff", panelAlt: "#faf9f5", accent: "#9ab0c9", accentAlt: "#b8cddf", secondary: "#d4b882", highlight: "#a89f8d", text: "#38342f", muted: "#7b756d" },
  },
  {
    id: "linen-rose",
    name: "亚麻玫瑰 Linen Rose",
    tagline: "旧书页里夹着的一片干花。",
    quote: "KEEP IT CLOSE",
    scene: {
      from: "#f5f0ec",
      to: "#e7ddd6",
      angle: 60,
      blobs: [
        { x: 0.75, y: 0.18, r: 0.34, color: "#d8b4b4", strength: 0.36 },
        { x: 0.2, y: 0.72, r: 0.42, color: "#c9b8a8", strength: 0.34 },
        { x: 0.52, y: 0.5, r: 0.26, color: "#e2cfc8", strength: 0.3 },
      ],
    },
    colors: { background: "#f5f0ec", panel: "#ffffff", panelAlt: "#faf6f3", accent: "#b87b7b", accentAlt: "#d6a3a3", secondary: "#a89f8d", highlight: "#8c7b6b", text: "#3b322f", muted: "#7d716b" },
  },
  {
    id: "honey-milk",
    name: "蜂蜜牛奶 Honey Milk",
    tagline: "搅拌后还留一圈琥珀色。",
    quote: "SWEET AND SLOW",
    scene: {
      from: "#faf6ed",
      to: "#efe5d4",
      angle: 40,
      blobs: [
        { x: 0.76, y: 0.14, r: 0.36, color: "#e6c78e", strength: 0.36 },
        { x: 0.18, y: 0.78, r: 0.4, color: "#d4b896", strength: 0.34 },
        { x: 0.55, y: 0.5, r: 0.26, color: "#f0e2c8", strength: 0.3 },
      ],
    },
    colors: { background: "#faf6ed", panel: "#ffffff", panelAlt: "#fdf9f1", accent: "#c9a35f", accentAlt: "#e0c288", secondary: "#b8a28a", highlight: "#8c9a6d", text: "#3d362e", muted: "#7d7468" },
  },
  {
    id: "soft-moss",
    name: "柔苔 Soft Moss",
    tagline: "雨后石阶上的青苔色。",
    quote: "BREATHE IN",
    scene: {
      from: "#f2f4ef",
      to: "#e2e7d9",
      angle: 30,
      blobs: [
        { x: 0.78, y: 0.16, r: 0.34, color: "#b8c9a6", strength: 0.38 },
        { x: 0.16, y: 0.78, r: 0.42, color: "#c9d4b8", strength: 0.34 },
        { x: 0.52, y: 0.5, r: 0.28, color: "#d9e0cc", strength: 0.3 },
      ],
    },
    colors: { background: "#f2f4ef", panel: "#ffffff", panelAlt: "#f6f9f2", accent: "#7d9a6d", accentAlt: "#a3b894", secondary: "#b8a68a", highlight: "#8a9a7d", text: "#333a2f", muted: "#6f7a65" },
  },
  {
    id: "velvet-plum",
    name: "丝绒梅紫 Velvet Plum",
    tagline: "紫夜限定，一盏台灯的温柔。",
    quote: "STAY UP LATE",
    scene: {
      from: "#f4f0f5",
      to: "#e6dde8",
      angle: 45,
      blobs: [
        { x: 0.76, y: 0.18, r: 0.36, color: "#c4a3c9", strength: 0.38 },
        { x: 0.2, y: 0.74, r: 0.42, color: "#9a8db5", strength: 0.34 },
        { x: 0.52, y: 0.48, r: 0.26, color: "#e2d4e4", strength: 0.3 },
      ],
    },
    colors: { background: "#f4f0f5", panel: "#ffffff", panelAlt: "#f8f4f9", accent: "#8e6a9e", accentAlt: "#b08fbd", secondary: "#6d7eb0", highlight: "#a99cc4", text: "#352d38", muted: "#7a7080" },
  },
  {
    id: "ink-gold",
    name: "墨金舞台 Ink Gold",
    tagline: "聚光灯下的黑金时刻。",
    quote: "OWN THE STAGE",
    scene: {
      from: "#f7f5f0",
      to: "#e8e2d6",
      angle: 35,
      blobs: [
        { x: 0.74, y: 0.16, r: 0.34, color: "#d4b87a", strength: 0.4 },
        { x: 0.22, y: 0.78, r: 0.42, color: "#a89f8d", strength: 0.32 },
        { x: 0.52, y: 0.5, r: 0.24, color: "#2c2824", strength: 0.08 },
      ],
    },
    colors: { background: "#f7f5f0", panel: "#ffffff", panelAlt: "#faf8f3", accent: "#b8975a", accentAlt: "#d4b87a", secondary: "#5c564d", highlight: "#8c826f", text: "#2d2923", muted: "#7a7469" },
  },
  {
    id: "cherry-frost",
    name: "樱桃霜糖 Cherry Frost",
    tagline: "红白科幻，冷冽的甜。",
    quote: "FUTURE SWEET",
    scene: {
      from: "#faf6f5",
      to: "#efe4e2",
      angle: 55,
      blobs: [
        { x: 0.72, y: 0.2, r: 0.36, color: "#e89a9a", strength: 0.38 },
        { x: 0.2, y: 0.72, r: 0.4, color: "#d6b0a8", strength: 0.34 },
        { x: 0.52, y: 0.5, r: 0.26, color: "#f0dddd", strength: 0.3 },
      ],
    },
    colors: { background: "#faf6f5", panel: "#ffffff", panelAlt: "#fdf7f6", accent: "#c95f5f", accentAlt: "#e08a8a", secondary: "#9a7b7b", highlight: "#c9a08a", text: "#3a2b2b", muted: "#8a7272" },
  },
  {
    id: "clear-cyan",
    name: "清透青空 Clear Cyan",
    tagline: "像清晨窗户上的一层薄雾。",
    quote: "BREATHE CLEAR",
    scene: {
      from: "#f4f7f8",
      to: "#e3ecee",
      angle: 25,
      blobs: [
        { x: 0.8, y: 0.14, r: 0.34, color: "#9fd4e0", strength: 0.36 },
        { x: 0.16, y: 0.78, r: 0.42, color: "#a8c9d4", strength: 0.34 },
        { x: 0.52, y: 0.5, r: 0.26, color: "#dce8ec", strength: 0.3 },
      ],
    },
    colors: { background: "#f4f7f8", panel: "#ffffff", panelAlt: "#f6fafb", accent: "#5a9aa8", accentAlt: "#85bcc8", secondary: "#8a9aa8", highlight: "#a8c4cc", text: "#2d3538", muted: "#6b7a80" },
  },
];

// ---------- tray + app icons ----------

function renderTrayIcon(size) {
  const out = Buffer.alloc(size * size * 4);
  const c = (size - 1) / 2;
  const radius = size * 0.42;
  const bite = size * 0.2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - c;
      const dy = y - c;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
      const inCircle = dist <= radius;
      const inWedge = angle >= 20 && angle <= 75 && dist > bite * 0.4;
      const dot = Math.sqrt((x - c) ** 2 + (y - c) ** 2) <= size * 0.1;
      const alpha = (inCircle && !inWedge) || dot ? 255 : 0;
      const offset = (y * size + x) * 4;
      out[offset] = 0;
      out[offset + 1] = 0;
      out[offset + 2] = 0;
      out[offset + 3] = alpha;
    }
  }
  return out;
}

function renderAppIcon(size) {
  const out = Buffer.alloc(size * size * 4);
  const radius = size * 0.22; // rounded corner
  const from = hex("#f7f4ef");
  const to = hex("#e2e7d9");
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / (size - 1);
      const v = y / (size - 1);
      const qx = Math.max(0, Math.max(radius - x, x - (size - 1 - radius)));
      const qy = Math.max(0, Math.max(radius - y, y - (size - 1 - radius)));
      const alpha = Math.sqrt(qx * qx + qy * qy) <= radius ? 255 : 0;
      let color = mix(from, to, clamp01((u + v) / 2));
      // soft sage blob top-right
      const bx = u - 0.74;
      const by = (v - 0.22) * 1.4;
      color = mix(color, hex("#a8b894"), clamp01(Math.exp(-(bx * bx + by * by) / 0.06) * 0.55));
      // blush blob bottom-left
      const cx = u - 0.26;
      const cy = (v - 0.8) * 1.4;
      color = mix(color, hex("#d4a5a5"), clamp01(Math.exp(-(cx * cx + cy * cy) / 0.07) * 0.45));
      const offset = (y * size + x) * 4;
      out[offset] = Math.round(color[0]);
      out[offset + 1] = Math.round(color[1]);
      out[offset + 2] = Math.round(color[2]);
      out[offset + 3] = alpha;
    }
  }
  return out;
}

// ---------- main ----------

function writeFileEnsured(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  console.log(`wrote ${path.relative(root, file)} (${(data.length / 1024).toFixed(0)} KB)`);
}

// Remove old presets that no longer match the new aesthetic.
const presetsRoot = path.join(root, "assets", "presets");
for (const entry of fs.readdirSync(presetsRoot)) {
  const dir = path.join(presetsRoot, entry);
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) continue;
  const stillUsed = PRESETS.some((p) => p.id === entry);
  if (!stillUsed) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`removed old preset ${entry}`);
  }
}

for (const preset of PRESETS) {
  const dir = path.join(root, "assets", "presets", preset.id);
  const background = renderScene(preset.scene, 1600, 1000);
  writeFileEnsured(path.join(dir, "background.png"), encodePng(1600, 1000, background));
  const preview = renderScene(preset.scene, 640, 400);
  writeFileEnsured(path.join(dir, "preview.png"), encodePng(640, 400, preview));
  const theme = {
    schemaVersion: 1,
    id: preset.id,
    name: preset.name,
    brandSubtitle: "CODEX THEMES",
    tagline: preset.tagline,
    projectPrefix: "选择项目 · ",
    projectLabel: "◉  选择项目",
    statusText: "THEME ONLINE",
    quote: preset.quote,
    image: "background.png",
    colors: {
      ...preset.colors,
      line: rgba(preset.colors.accent, 0.22),
    },
  };
  writeFileEnsured(path.join(dir, "theme.json"), Buffer.from(`${JSON.stringify(theme, null, 2)}\n`, "utf8"));
}

writeFileEnsured(path.join(root, "assets", "tray", "iconTemplate.png"), encodePng(22, 22, renderTrayIcon(22)));
writeFileEnsured(path.join(root, "assets", "tray", "iconTemplate@2x.png"), encodePng(44, 44, renderTrayIcon(44)));
writeFileEnsured(path.join(root, "assets", "build", "icon.png"), encodePng(512, 512, renderAppIcon(512)));

console.log(`\n${PRESETS.length} presets + tray icons + app icon generated.`);
