#!/usr/bin/env node
/**
 * Migrate bundled presets from schema v1 to schema v2.
 * Keeps existing images (background.png is referenced as hero),
 * assigns each preset to one of the six layout skeletons, and
 * writes a v2 theme.json next to the original assets.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRESETS_ROOT = path.resolve(__dirname, "../assets/presets");

const LAYOUT_ASSIGNMENTS = {
  "cherry-frost": "dream-banner",
  "cream-sage": "dream-banner",
  "soft-moss": "dream-banner",
  "clear-cyan": "split-studio",
  "vanilla-sky": "split-studio",
  "ink-gold": "full-canvas",
  "velvet-plum": "full-canvas",
  "linen-rose": "terminal-grid",
  "honey-milk": "paper-board",
  "peach-blush": "minimal-focus",
};

const LAYOUT_PARAMS = {
  "dream-banner": { heroHeight: 252, heroTextAlign: "left", heroScrim: 0.62, heroFocusX: 0.62, heroFocusY: 0.24 },
  "split-studio": { heroHeight: 280, heroTextAlign: "left", heroScrim: 0.55, heroFocusX: 0.5, heroFocusY: 0.35 },
  "full-canvas": { heroHeight: 320, heroTextAlign: "center", heroScrim: 0.45, heroFocusX: 0.5, heroFocusY: 0.5 },
  "terminal-grid": { heroHeight: 224, heroTextAlign: "left", heroScrim: 0.7, heroFocusX: 0.3, heroFocusY: 0.2 },
  "paper-board": { heroHeight: 260, heroTextAlign: "left", heroScrim: 0.6, heroFocusX: 0.6, heroFocusY: 0.3 },
  "minimal-focus": { heroHeight: 300, heroTextAlign: "center", heroScrim: 0.4, heroFocusX: 0.5, heroFocusY: 0.4 },
};

function v1ToV2(v1, dirName) {
  const layout = LAYOUT_ASSIGNMENTS[dirName] ?? "dream-banner";
  const params = LAYOUT_PARAMS[layout];
  return {
    schemaVersion: 2,
    uuid: `preset-${dirName}`,
    id: dirName,
    version: "2.0.0",
    minEngineVersion: "2.0.0",
    name: v1.name,
    description: v1.tagline || "",
    tagline: v1.tagline,
    tags: [],
    hero: v1.image,
    preview: "preview.png",
    light: {
      background: v1.colors.background,
      panel: v1.colors.panel,
      panelAlt: v1.colors.panelAlt,
      surface: v1.colors.panel,
      text: v1.colors.text,
      muted: v1.colors.muted,
      border: v1.colors.line,
      accent: v1.colors.accent,
      accentAlt: v1.colors.accentAlt,
      secondary: v1.colors.secondary,
      highlight: v1.colors.highlight,
    },
    layout,
    heroFit: "cover",
    heroFocusX: params.heroFocusX,
    heroFocusY: params.heroFocusY,
    heroZoom: 1,
    heroHeight: params.heroHeight,
    heroTextAlign: params.heroTextAlign,
    heroScrim: params.heroScrim,
    wallpaperEnabled: false,
    wallpaperFocusX: 0.5,
    wallpaperFocusY: 0.5,
    wallpaperOpacity: 0.15,
    wallpaperBlur: 0,
    radius: "lg",
    density: "normal",
    fontPreset: "system",
    glass: false,
    shadow: "lg",
    decoration: 0.8,
    effects: {},
    brandSubtitle: v1.brandSubtitle,
    projectPrefix: v1.projectPrefix,
    projectLabel: v1.projectLabel,
    statusText: v1.statusText,
    quote: v1.quote,
  };
}

async function main() {
  const entries = await fs.readdir(PRESETS_ROOT);
  for (const entry of entries) {
    const dir = path.join(PRESETS_ROOT, entry);
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) continue;
    const themePath = path.join(dir, "theme.json");
    let raw;
    try {
      raw = JSON.parse(await fs.readFile(themePath, "utf8"));
    } catch {
      console.warn(`Skipping ${entry}: no theme.json`);
      continue;
    }
    if (raw.schemaVersion !== 1) {
      console.log(`Skipping ${entry}: already v${raw.schemaVersion}`);
      continue;
    }
    const v2 = v1ToV2(raw, entry);
    await fs.writeFile(themePath, `${JSON.stringify(v2, null, 2)}\n`, "utf8");
    console.log(`Migrated ${entry} → ${v2.layout}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
