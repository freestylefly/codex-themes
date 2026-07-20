/**
 * Runtime validation for Codex Theme Recipes.
 *
 * Mirrors the deterministic checks in the skill validator script.
 * Returns an array of human-readable errors; empty array means valid.
 */

import type { LayoutKind, ThemeGenerationRecipe } from "../shared/types";
import { LAYOUT_KINDS } from "../shared/types";

const IMAGE_FITS = new Set(["cover", "contain"]);
const TEXT_ALIGNS = new Set(["left", "center", "right"]);
const RADIUS = new Set(["none", "sm", "md", "lg", "xl"]);
const DENSITY = new Set(["compact", "normal", "spacious"]);
const FONTS = new Set(["system", "rounded", "mono"]);
const SHADOWS = new Set(["none", "sm", "md", "lg"]);
const EFFECTS = new Set(["particles", "aurora", "glow", "noise", "grid", "float"]);

const TOP_LEVEL_KEYS = new Set([
  "schemaVersion", "name", "description", "tagline", "tags", "layout",
  "hero", "wallpaper", "appearance", "effects", "copy", "paletteIntent",
]);
const HERO_KEYS = new Set(["fit", "focusX", "focusY", "zoom", "height", "textAlign", "scrim"]);
const WALLPAPER_KEYS = new Set(["enabled", "focusX", "focusY", "opacity", "blur"]);
const APPEARANCE_KEYS = new Set(["radius", "density", "fontPreset", "glass", "shadow", "decoration"]);
const COPY_KEYS = new Set(["brandSubtitle", "projectPrefix", "projectLabel", "statusText", "quote"]);
const PALETTE_INTENT_KEYS = new Set(["appearance", "contrast", "temperature"]);

function isNumber(v: unknown, min: number, max: number): boolean {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

function rejectUnknownKeys(obj: object, allowed: Set<string>, prefix: string, errors: string[]): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) errors.push(`unknown key ${prefix}${key}`);
  }
}

export function validateThemeRecipe(recipe: unknown): string[] {
  const errors: string[] = [];
  if (!recipe || typeof recipe !== "object") {
    return ["Recipe must be an object."];
  }
  const r = recipe as Partial<ThemeGenerationRecipe>;
  rejectUnknownKeys(r, TOP_LEVEL_KEYS, "", errors);

  if (r.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (typeof r.name !== "string" || r.name.length > 80) errors.push("name must be ≤80 chars");
  if (typeof r.description !== "string" || r.description.length > 160) errors.push("description must be ≤160 chars");
  if (typeof r.tagline !== "string" || r.tagline.length > 160) errors.push("tagline must be ≤160 chars");
  if (!Array.isArray(r.tags) || r.tags.length > 16 || r.tags.some((t) => typeof t !== "string" || t.length > 32)) {
    errors.push("tags must be ≤16 strings ≤32 chars");
  }
  if (!LAYOUT_KINDS.includes(r.layout as LayoutKind)) errors.push("layout must be a registered layout");

  const hero = r.hero;
  if (!hero || typeof hero !== "object") {
    errors.push("hero is required");
  } else {
    rejectUnknownKeys(hero, HERO_KEYS, "hero.", errors);
    if (!IMAGE_FITS.has(hero.fit as string)) errors.push("hero.fit invalid");
    if (!isNumber(hero.focusX, 0, 1)) errors.push("hero.focusX must be in [0,1]");
    if (!isNumber(hero.focusY, 0, 1)) errors.push("hero.focusY must be in [0,1]");
    if (!isNumber(hero.zoom, 0.5, 2)) errors.push("hero.zoom must be in [0.5,2]");
    if (!isNumber(hero.height, 200, 360)) errors.push("hero.height must be in [200,360]");
    if (!TEXT_ALIGNS.has(hero.textAlign as string)) errors.push("hero.textAlign invalid");
    if (!isNumber(hero.scrim, 0, 0.85)) errors.push("hero.scrim must be in [0,0.85]");
  }

  const wp = r.wallpaper;
  if (!wp || typeof wp !== "object") {
    errors.push("wallpaper is required");
  } else {
    rejectUnknownKeys(wp, WALLPAPER_KEYS, "wallpaper.", errors);
    if (typeof wp.enabled !== "boolean") errors.push("wallpaper.enabled must be boolean");
    if (!isNumber(wp.focusX, 0, 1)) errors.push("wallpaper.focusX must be in [0,1]");
    if (!isNumber(wp.focusY, 0, 1)) errors.push("wallpaper.focusY must be in [0,1]");
    if (!isNumber(wp.opacity, 0, 1)) errors.push("wallpaper.opacity must be in [0,1]");
    if (!isNumber(wp.blur, 0, 32)) errors.push("wallpaper.blur must be in [0,32]");
  }

  const app = r.appearance;
  if (!app || typeof app !== "object") {
    errors.push("appearance is required");
  } else {
    rejectUnknownKeys(app, APPEARANCE_KEYS, "appearance.", errors);
    if (!RADIUS.has(app.radius as string)) errors.push("appearance.radius invalid");
    if (!DENSITY.has(app.density as string)) errors.push("appearance.density invalid");
    if (!FONTS.has(app.fontPreset as string)) errors.push("appearance.fontPreset invalid");
    if (typeof app.glass !== "boolean") errors.push("appearance.glass must be boolean");
    if (!SHADOWS.has(app.shadow as string)) errors.push("appearance.shadow invalid");
    if (!isNumber(app.decoration, 0, 1)) errors.push("appearance.decoration must be in [0,1]");
  }

  const eff = r.effects;
  if (!eff || typeof eff !== "object") {
    errors.push("effects is required");
  } else {
    for (const key of EFFECTS) {
      if (!isNumber((eff as unknown as Record<string, unknown>)[key], 0, 1)) {
        errors.push(`effects.${key} must be in [0,1]`);
      }
    }
    for (const key of Object.keys(eff)) {
      if (!EFFECTS.has(key)) errors.push(`unknown effect ${key}`);
    }
  }

  const copy = r.copy;
  if (!copy || typeof copy !== "object") {
    errors.push("copy is required");
  } else {
    rejectUnknownKeys(copy, COPY_KEYS, "copy.", errors);
    for (const key of COPY_KEYS) {
      const value = (copy as unknown as Record<string, unknown>)[key];
      if (typeof value !== "string" || value.length > 80) {
        errors.push(`copy.${key} must be a string ≤80 chars`);
      }
    }
  }

  const pi = r.paletteIntent;
  if (!pi || typeof pi !== "object") {
    errors.push("paletteIntent is required");
  } else {
    rejectUnknownKeys(pi, PALETTE_INTENT_KEYS, "paletteIntent.", errors);
    if (!["light", "dark"].includes(pi.appearance as string)) errors.push("paletteIntent.appearance invalid");
    if (!["soft", "normal", "high"].includes(pi.contrast as string)) errors.push("paletteIntent.contrast invalid");
    if (!["cool", "neutral", "warm"].includes(pi.temperature as string)) errors.push("paletteIntent.temperature invalid");
  }

  return errors;
}
