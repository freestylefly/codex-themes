/**
 * Deterministic Theme Recipe validator.
 *
 * Run: node scripts/validate-theme-recipe.mjs <recipe.json>
 *
 * Returns exit code 0 on valid, 1 on invalid, printing the first error.
 * Does not invent defaults; it only checks that the supplied Recipe matches
 * the allowed schema and ranges.
 */

import fs from "node:fs";
import path from "node:path";

const LAYOUTS = [
  "dream-banner",
  "split-studio",
  "full-canvas",
  "terminal-grid",
  "paper-board",
  "minimal-focus",
  "retro-messenger",
  "silk-scroll",
];

const IMAGE_FITS = ["cover", "contain"];
const TEXT_ALIGNS = ["left", "center", "right"];
const RADIUS = ["none", "sm", "md", "lg", "xl"];
const DENSITY = ["compact", "normal", "spacious"];
const FONTS = ["system", "rounded", "mono"];
const SHADOWS = ["none", "sm", "md", "lg"];
const EFFECTS = ["particles", "aurora", "glow", "noise", "grid", "float"];

function fail(message) {
  console.error(`Invalid recipe: ${message}`);
  process.exit(1);
}

function isNumber(v, min, max) {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

function rejectUnknownKeys(obj, allowed, prefix) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) fail(`unknown key ${prefix}${key}`);
  }
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node validate-theme-recipe.mjs <recipe.json>");
    process.exit(1);
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  } catch (err) {
    fail(`could not read/parse ${file}: ${err.message}`);
  }

  rejectUnknownKeys(raw, [
    "schemaVersion", "name", "description", "tagline", "tags", "layout",
    "hero", "wallpaper", "appearance", "effects", "copy", "paletteIntent",
  ], "");

  if (raw.schemaVersion !== 1) fail("schemaVersion must be 1");
  if (typeof raw.name !== "string" || raw.name.length > 80) fail("name must be a string ≤ 80 chars");
  if (typeof raw.description !== "string" || raw.description.length > 160) fail("description must be ≤ 160 chars");
  if (typeof raw.tagline !== "string" || raw.tagline.length > 160) fail("tagline must be ≤ 160 chars");
  if (!Array.isArray(raw.tags) || raw.tags.length > 16 || raw.tags.some((t) => typeof t !== "string" || t.length > 32)) {
    fail("tags must be an array of ≤16 strings ≤32 chars");
  }
  if (!LAYOUTS.includes(raw.layout)) fail(`layout must be one of ${LAYOUTS.join(", ")}`);

  const hero = raw.hero;
  if (!hero || typeof hero !== "object") fail("hero is required");
  rejectUnknownKeys(hero, ["fit", "focusX", "focusY", "zoom", "height", "textAlign", "scrim"], "hero.");
  if (!IMAGE_FITS.includes(hero.fit)) fail("hero.fit invalid");
  if (!isNumber(hero.focusX, 0, 1)) fail("hero.focusX must be in [0,1]");
  if (!isNumber(hero.focusY, 0, 1)) fail("hero.focusY must be in [0,1]");
  if (!isNumber(hero.zoom, 0.5, 2)) fail("hero.zoom must be in [0.5,2]");
  if (!isNumber(hero.height, 200, 360)) fail("hero.height must be in [200,360]");
  if (!TEXT_ALIGNS.includes(hero.textAlign)) fail("hero.textAlign invalid");
  if (!isNumber(hero.scrim, 0, 0.85)) fail("hero.scrim must be in [0,0.85]");

  const wp = raw.wallpaper;
  if (!wp || typeof wp !== "object") fail("wallpaper is required");
  rejectUnknownKeys(wp, ["enabled", "focusX", "focusY", "opacity", "blur"], "wallpaper.");
  if (typeof wp.enabled !== "boolean") fail("wallpaper.enabled must be boolean");
  if (!isNumber(wp.focusX, 0, 1)) fail("wallpaper.focusX must be in [0,1]");
  if (!isNumber(wp.focusY, 0, 1)) fail("wallpaper.focusY must be in [0,1]");
  if (!isNumber(wp.opacity, 0, 1)) fail("wallpaper.opacity must be in [0,1]");
  if (!isNumber(wp.blur, 0, 32)) fail("wallpaper.blur must be in [0,32]");

  const app = raw.appearance;
  if (!app || typeof app !== "object") fail("appearance is required");
  rejectUnknownKeys(app, ["radius", "density", "fontPreset", "glass", "shadow", "decoration"], "appearance.");
  if (!RADIUS.includes(app.radius)) fail("appearance.radius invalid");
  if (!DENSITY.includes(app.density)) fail("appearance.density invalid");
  if (!FONTS.includes(app.fontPreset)) fail("appearance.fontPreset invalid");
  if (typeof app.glass !== "boolean") fail("appearance.glass must be boolean");
  if (!SHADOWS.includes(app.shadow)) fail("appearance.shadow invalid");
  if (!isNumber(app.decoration, 0, 1)) fail("appearance.decoration must be in [0,1]");

  const eff = raw.effects;
  if (!eff || typeof eff !== "object") fail("effects is required");
  for (const key of EFFECTS) {
    if (!isNumber(eff[key], 0, 1)) fail(`effects.${key} must be in [0,1]`);
  }
  for (const key of Object.keys(eff)) {
    if (!EFFECTS.includes(key)) fail(`unknown effect ${key}`);
  }

  const copy = raw.copy;
  if (!copy || typeof copy !== "object") fail("copy is required");
  rejectUnknownKeys(copy, ["brandSubtitle", "projectPrefix", "projectLabel", "statusText", "quote"], "copy.");
  for (const key of ["brandSubtitle", "projectPrefix", "projectLabel", "statusText", "quote"]) {
    if (typeof copy[key] !== "string" || copy[key].length > 80) fail(`copy.${key} must be a string ≤80 chars`);
  }

  const pi = raw.paletteIntent;
  if (!pi || typeof pi !== "object") fail("paletteIntent is required");
  rejectUnknownKeys(pi, ["appearance", "contrast", "temperature"], "paletteIntent.");
  if (!["light", "dark"].includes(pi.appearance)) fail("paletteIntent.appearance invalid");
  if (!["soft", "normal", "high"].includes(pi.contrast)) fail("paletteIntent.contrast invalid");
  if (!["cool", "neutral", "warm"].includes(pi.temperature)) fail("paletteIntent.temperature invalid");

  console.log("Recipe is valid.");
}

main();
