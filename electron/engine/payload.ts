/**
 * Theme loading + injection payload assembly.
 *
 * Supports schema v1 (legacy) and schema v2 (structured). Both are normalized
 * to NormalizedTheme before the payload is built.
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { NormalizedTheme, ThemeConfig } from "../shared/types";
import { IMAGE_EXTENSIONS, MAX_ART_BYTES, SKIN_VERSION } from "./constants";
import { normalizeTheme } from "./normalize";
import { compileTheme } from "./compiler";

export interface LoadedTheme {
  themeDir: string;
  imagePath: string;
  imageBytes: number;
  theme: NormalizedTheme;
}

export interface BuiltPayload {
  payload: string;
  imageBytes: number;
  theme: NormalizedTheme;
}

function fileToDataUrl(file: string): Promise<string> {
  return fs.readFile(file).then((buf) => {
    const extension = path.extname(file).toLowerCase();
    const mime =
      extension === ".jpg" || extension === ".jpeg"
        ? "image/jpeg"
        : extension === ".webp"
          ? "image/webp"
          : "image/png";
    return `data:${mime};base64,${buf.toString("base64")}`;
  });
}

async function resolveResource(themeDir: string, filename: string): Promise<string | null> {
  if (path.basename(filename) !== filename) return null;
  const file = path.join(themeDir, filename);
  const extension = path.extname(filename).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) return null;
  try {
    const stat = await fs.stat(file);
    return stat.isFile() && stat.size > 0 && stat.size <= MAX_ART_BYTES ? file : null;
  } catch {
    return null;
  }
}

async function sha256File(file: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  hash.update(await fs.readFile(file));
  return hash.digest("hex");
}

/**
 * Read + sanitize a theme directory. Throws on hard violations.
 * Returns the normalized v2 theme and the primary hero image path.
 */
export async function loadTheme(themeDir: string): Promise<LoadedTheme> {
  const configPath = path.join(themeDir, "theme.json");
  const raw: ThemeConfig = JSON.parse(await fs.readFile(configPath, "utf8"));
  const { theme, warnings } = normalizeTheme(raw, { local: true });
  if (warnings.length > 0) {
    // Warnings are not fatal for local themes; surface via log later if needed.
    // eslint-disable-next-line no-console
    console.warn(`Theme ${theme.id}:`, warnings.join("; "));
  }

  const heroFile = await resolveResource(themeDir, theme.resources.hero);
  if (!heroFile) {
    throw new Error(`Theme hero image "${theme.resources.hero}" is missing or invalid`);
  }

  const imageStat = await fs.stat(heroFile);
  return { themeDir, imagePath: heroFile, imageBytes: imageStat.size, theme };
}

/**
 * Build the injection payload: renderer-inject template with CSS, image data
 * URLs, theme config and engine version substituted in.
 */
export async function buildPayload(injectAssetsDir: string, themeDir: string): Promise<BuiltPayload> {
  const [css, template, loaded] = await Promise.all([
    fs.readFile(path.join(injectAssetsDir, "dream-skin.css"), "utf8"),
    fs.readFile(path.join(injectAssetsDir, "renderer-inject.js"), "utf8"),
    loadTheme(themeDir),
  ]);

  const art = await fs.readFile(loaded.imagePath);
  const heroDataUrl = await fileToDataUrl(loaded.imagePath);

  let wallpaperDataUrl: string | null = null;
  if (loaded.theme.resources.wallpaper) {
    const wpFile = await resolveResource(themeDir, loaded.theme.resources.wallpaper);
    if (wpFile) wallpaperDataUrl = await fileToDataUrl(wpFile);
  }

  let stampDataUrl: string | null = null;
  if (loaded.theme.resources.stamp) {
    const stampFile = await resolveResource(themeDir, loaded.theme.resources.stamp);
    if (stampFile) stampDataUrl = await fileToDataUrl(stampFile);
  }

  // Compile initial variables for the light palette. The renderer script
  // recompiles variables itself when Codex switches between light/dark modes.
  const compiled = compileTheme(loaded.theme, { mode: "light" });

  const payload = template
    .replace("__DREAM_SKIN_CSS_JSON__", JSON.stringify(css))
    .replace("__DREAM_SKIN_ART_JSON__", JSON.stringify(heroDataUrl))
    .replace("__DREAM_SKIN_WALLPAPER_JSON__", JSON.stringify(wallpaperDataUrl))
    .replace("__DREAM_SKIN_STAMP_JSON__", JSON.stringify(stampDataUrl))
    .replace("__DREAM_SKIN_THEME_JSON__", JSON.stringify(loaded.theme))
    .replace("__DREAM_SKIN_VARS_JSON__", JSON.stringify(compiled.variables))
    .replace("__DREAM_SKIN_VERSION_JSON__", JSON.stringify(SKIN_VERSION));

  return { payload, imageBytes: art.length, theme: loaded.theme };
}

/** Compute SHA-256 of a theme directory's theme.json and primary image. */
export async function hashThemePackage(themeDir: string): Promise<{ themeHash: string; imageHash: string }> {
  const loaded = await loadTheme(themeDir);
  const themeHash = await sha256File(path.join(themeDir, "theme.json"));
  const imageHash = await sha256File(loaded.imagePath);
  return { themeHash, imageHash };
}

export { normalizeTheme };
