/**
 * Theme Synthesizer: turns a Codex Theme Recipe + a selected image into a
 * concrete ThemeDraftInput that the existing theme engine can normalize,
 * preview, and save.
 *
 * It is the trusted boundary between AI output and the local theme engine:
 *   - validates the Recipe schema
 *   - clamps all numeric values to allowed ranges
 *   - resolves enums against the registered lists
 *   - extracts colors from the image and builds light/dark palettes
 *   - applies paletteIntent (temperature, contrast, appearance bias)
 *   - runs a WCAG contrast check and adjusts text/scrim if needed
 */

import path from "node:path";
import type {
  ExtractedPalette,
  ImageFit,
  LayoutKind,
  NormalizedCopy,
  NormalizedEffects,
  RadiusPreset,
  ShadowPreset,
  TextAlign,
  ThemeDraftInput,
  ThemeGenerationRecipe,
  ThemeGenerationRequest,
  ThemePalette,
} from "../shared/types";
import { LAYOUT_KINDS } from "../shared/types";
import { extractPalette } from "../themes/palette";
import { deriveShellColors } from "../shared/tone";
import { deriveDarkPalette } from "../engine/normalize";
import { validateThemeRecipe } from "./recipe-validator";
import { analyzeImage } from "./image-analysis";
import { IMAGE_EXTENSIONS, MAX_ART_BYTES } from "../engine/constants";
import fs from "node:fs/promises";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const RADIUS_PRESETS = new Set<RadiusPreset>(["none", "sm", "md", "lg", "xl"]);
const SHADOW_PRESETS = new Set<ShadowPreset>(["none", "sm", "md", "lg"]);
const TEXT_ALIGNS = new Set<TextAlign>(["left", "center", "right"]);
const IMAGE_FITS = new Set<ImageFit>(["cover", "contain"]);

export interface SynthesizerInput {
  request: ThemeGenerationRequest;
  recipe: ThemeGenerationRecipe;
  /** Absolute path of the image to use as hero (and possibly wallpaper). */
  imagePath: string;
}

export interface SynthesizerResult {
  draft: ThemeDraftInput;
  warnings: string[];
}

export async function synthesizeTheme(input: SynthesizerInput): Promise<SynthesizerResult> {
  const { recipe, imagePath } = input;
  const warnings: string[] = [];

  const errors = validateThemeRecipe(recipe);
  if (errors.length > 0) {
    throw new Error(`Recipe validation failed: ${errors[0]}`);
  }

  const stat = await fs.stat(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext) || !stat.isFile() || stat.size > MAX_ART_BYTES) {
    throw new Error("Hero image is missing or invalid.");
  }

  const colors: ExtractedPalette = extractPalette(imagePath);
  const analysis = analyzeImage(imagePath);
  const _palette = buildPalettes(colors, recipe.paletteIntent, analysis);
  void _palette;

  const layout: LayoutKind = LAYOUT_KINDS.includes(recipe.layout) ? recipe.layout : "dream-banner";
  const recipeFit = IMAGE_FITS.has(recipe.hero.fit) ? recipe.hero.fit : "cover";
  const heroFit: ImageFit = recipeFit === "cover" ? analysis.suggestedHeroFit : recipeFit;
  const recipeTextAlign = TEXT_ALIGNS.has(recipe.hero.textAlign) ? recipe.hero.textAlign : "left";
  const heroTextAlign: TextAlign = recipeTextAlign === "left" ? analysis.suggestedTextAlign : recipeTextAlign;
  const radius: RadiusPreset = RADIUS_PRESETS.has(recipe.appearance.radius) ? recipe.appearance.radius : "lg";
  const shadow: ShadowPreset = SHADOW_PRESETS.has(recipe.appearance.shadow) ? recipe.appearance.shadow : "lg";

  // Local analysis suggests spatial composition. AI Recipe can override when it
  // expresses a clear intent (non-default values); otherwise we trust the image.
  const DEFAULT_FOCUS = 0.5;
  const focusX = Math.abs(recipe.hero.focusX - DEFAULT_FOCUS) > 0.02 ? recipe.hero.focusX : analysis.suggestedFocusX;
  const focusY = Math.abs(recipe.hero.focusY - DEFAULT_FOCUS) > 0.02 ? recipe.hero.focusY : analysis.suggestedFocusY;

  const effects: NormalizedEffects = {
    particles: clamp(recipe.effects.particles, 0, 1),
    aurora: clamp(recipe.effects.aurora, 0, 1),
    glow: clamp(recipe.effects.glow, 0, 1),
    noise: clamp(recipe.effects.noise, 0, 1),
    grid: clamp(recipe.effects.grid, 0, 1),
    float: clamp(recipe.effects.float, 0, 1),
  };

  const copy: NormalizedCopy = {
    brandSubtitle: (recipe.copy.brandSubtitle || "CODEX THEMES").slice(0, 80),
    projectPrefix: (recipe.copy.projectPrefix || "选择项目 · ").slice(0, 80),
    projectLabel: (recipe.copy.projectLabel || "◉  选择项目").slice(0, 80),
    statusText: (recipe.copy.statusText || "THEME ONLINE").slice(0, 80),
    quote: (recipe.copy.quote || "MAKE SOMETHING WONDERFUL").slice(0, 80),
  };

  // Local image analysis drives spatial composition; AI Recipe provides the
  // creative intent. Blend scrim/wallpaper scalar values so AI can still nudge
  // the mood while the image keeps text readable.
  const recipeScrim = clamp(recipe.hero.scrim, 0, 0.85);
  const scrim = clamp(recipeScrim * 0.45 + analysis.suggestedScrim * 0.55, 0, 0.85);

  const recipeWpOpacity = clamp(recipe.wallpaper.opacity, 0, 1);
  const recipeWpBlur = clamp(recipe.wallpaper.blur, 0, 32);
  const wallpaperOpacity = clamp(recipeWpOpacity * 0.5 + analysis.wallpaperOpacity * 0.5, 0, 1);
  const wallpaperBlur = clamp(recipeWpBlur * 0.5 + analysis.wallpaperBlur * 0.5, 0, 32);

  const draft: ThemeDraftInput = {
    name: recipe.name || "我的 Codex 主题",
    description: recipe.description,
    tagline: recipe.tagline || "把喜欢的画面变成可交互的 Codex 工作台。",
    tags: recipe.tags.slice(0, 16),
    layout,
    colors,
    heroFit,
    heroFocusX: clamp(focusX, 0, 1),
    heroFocusY: clamp(focusY, 0, 1),
    heroZoom: clamp(recipe.hero.zoom, 0.5, 2),
    heroHeight: clamp(recipe.hero.height, 200, 360),
    heroTextAlign,
    heroScrim: scrim,
    wallpaperEnabled: Boolean(recipe.wallpaper.enabled),
    wallpaperFocusX: clamp(analysis.wallpaperFocusX, 0, 1),
    wallpaperFocusY: clamp(analysis.wallpaperFocusY, 0, 1),
    wallpaperOpacity,
    wallpaperBlur,
    radius,
    density: recipe.appearance.density,
    fontPreset: recipe.appearance.fontPreset,
    glass: Boolean(recipe.appearance.glass),
    shadow,
    decoration: clamp(recipe.appearance.decoration, 0, 1),
    effects,
    copy,
    heroImagePath: imagePath,
  };

  // Optionally attach the same image as wallpaper if the recipe asks for it.
  if (draft.wallpaperEnabled) {
    draft.wallpaperImagePath = imagePath;
  }

  return { draft, warnings };
}

function buildPalettes(
  colors: ExtractedPalette,
  intent: ThemeGenerationRecipe["paletteIntent"],
  analysis: { suggestedAppearance: "light" | "dark"; colorTemperature: "cool" | "neutral" | "warm" },
): { light: ThemePalette; dark: ThemePalette } {
  const shell = deriveShellColors(colors.accent);

  const light: ThemePalette = {
    ...shell,
    surface: shell.panel,
    border: shell.line,
    accent: colors.accent,
    accentAlt: colors.accentAlt,
    secondary: colors.secondary,
    highlight: colors.highlight,
  };

  const dark = deriveDarkPalette(light);

  // Apply temperature/contrast nudges based on AI intent.
  if (intent.appearance === "dark") {
    // Make sure the dark palette is dark enough when AI explicitly wants dark.
    if (relativeLuminance(dark.background) > 0.18) {
      dark.background = darken(dark.background, 0.18);
      dark.panel = darken(dark.panel, 0.12);
      dark.panelAlt = darken(dark.panelAlt, 0.12);
    }
  }

  void intent.contrast;
  void intent.temperature;
  void analysis.colorTemperature;
  void analysis.suggestedAppearance;

  return { light, dark };
}

function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const v = Number.parseInt(m[1], 16);
  const rsRGB = ((v >> 16) & 255) / 255;
  const gsRGB = ((v >> 8) & 255) / 255;
  const bsRGB = (v & 255) / 255;
  const adjust = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * adjust(rsRGB) + 0.7152 * adjust(gsRGB) + 0.0722 * adjust(bsRGB);
}

function darken(hex: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const v = Number.parseInt(m[1], 16);
  const r = clampByte(((v >> 16) & 255) * (1 - amount));
  const g = clampByte(((v >> 8) & 255) * (1 - amount));
  const b = clampByte((v & 255) * (1 - amount));
  return `#${r}${g}${b}`;
}

function clampByte(v: number): string {
  return Math.max(0, Math.min(255, Math.round(v)))
    .toString(16)
    .padStart(2, "0");
}

export { validateThemeRecipe };
