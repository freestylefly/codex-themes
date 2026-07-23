/**
 * Theme normalization: every theme (schema v1 legacy or v2 structured) is
 * converted into a single NormalizedTheme before the compiler or renderer
 * touches it. This keeps the injection engine, preview canvas and store free
 * of schema-version conditionals.
 */

import type {
  LayoutKind,
  NormalizedResources,
  NormalizedTheme,
  ThemeColors,
  ThemeConfigV1,
  ThemeConfigV2,
  ThemePalette,
} from "../shared/types.js";
import { deriveShellColors, hexToHsl, hslToHex } from "../shared/tone.js";

const DEFAULT_V1_LAYOUT: LayoutKind = "dream-banner";

export interface NormalizationOptions {
  /** When true, low-contrast palettes are accepted with a warning only. */
  local?: boolean;
}

export interface NormalizationResult {
  theme: NormalizedTheme;
  warnings: string[];
}

const HEX_RE = /^#[0-9a-f]{6}$/i;
const RGBA_RE = /^rgba?\([0-9., %]+\)$/i;

function isHex(value: string): boolean {
  return HEX_RE.test(value);
}

function isColor(value: string): boolean {
  return HEX_RE.test(value) || RGBA_RE.test(value);
}

function colorOr(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return isColor(normalized) ? normalized : fallback;
}

function hexOr(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  return isHex(normalized) ? normalized : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pickString(value: unknown, fallback: string, max?: number): string {
  const s = typeof value === "string" ? value.trim() : fallback;
  if (max && s.length > max) return s.slice(0, max);
  return s;
}

function pickArrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function pickNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return clamp(n, min, max);
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** Derive a dark palette from a light palette, keeping hue/saturation warm. */
export function deriveDarkPalette(light: ThemePalette): ThemePalette {
  const darken = (hex: string, factor: number, floor = 12): string => {
    if (!isHex(hex)) return hex;
    const hsl = hexToHsl(hex);
    if (!hsl) return hex;
    return hslToHex({ h: hsl.h, s: hsl.s, l: clamp(hsl.l * factor, floor / 255, 1) });
  };

  const mute = (hex: string, factor: number): string => {
    if (!isHex(hex)) return hex;
    const hsl = hexToHsl(hex);
    if (!hsl) return hex;
    return hslToHex({ h: hsl.h, s: clamp(hsl.s * factor, 0, 1), l: hsl.l });
  };

  return {
    background: darken(light.background, 0.34, 18),
    panel: darken(light.panel, 0.4, 22),
    panelAlt: darken(light.panelAlt, 0.38, 20),
    surface: darken(light.surface, 0.36, 20),
    text: "#f2eee8",
    muted: mute(light.muted, 0.85),
    border: light.border,
    accent: light.accent,
    accentAlt: light.accentAlt,
    secondary: light.secondary,
    highlight: light.highlight,
  };
}

/** Build a v2 palette from the legacy v1 ThemeColors. */
function paletteFromV1(colors: ThemeColors): ThemePalette {
  return {
    background: colors.background,
    panel: colors.panel,
    panelAlt: colors.panelAlt,
    surface: colors.panel,
    text: colors.text,
    muted: colors.muted,
    border: colors.line,
    accent: colors.accent,
    accentAlt: colors.accentAlt,
    secondary: colors.secondary,
    highlight: colors.highlight,
  };
}

function normalizePalette(raw: unknown, shell: "light" | "dark", warnings: string[]): ThemePalette {
  const fallback: ThemePalette =
    shell === "light"
      ? {
          background: "#f7f4ef",
          panel: "#ffffff",
          panelAlt: "#faf7f2",
          surface: "#ffffff",
          text: "#3d3630",
          muted: "#7d756b",
          border: "rgba(138, 154, 109, 0.22)",
          accent: "#8a9a6d",
          accentAlt: "#a8b894",
          secondary: "#d4a5a5",
          highlight: "#c9b18a",
        }
      : deriveDarkPalette({
          background: "#f7f4ef",
          panel: "#ffffff",
          panelAlt: "#faf7f2",
          surface: "#ffffff",
          text: "#3d3630",
          muted: "#7d756b",
          border: "rgba(138, 154, 109, 0.22)",
          accent: "#8a9a6d",
          accentAlt: "#a8b894",
          secondary: "#d4a5a5",
          highlight: "#c9b18a",
        });

  if (!raw || typeof raw !== "object") {
    warnings.push(`Missing ${shell} palette; using defaults.`);
    return fallback;
  }
  const r = raw as Record<string, unknown>;
  return {
    background: colorOr(r.background, fallback.background),
    panel: colorOr(r.panel, fallback.panel),
    panelAlt: colorOr(r.panelAlt, fallback.panelAlt),
    surface: colorOr(r.surface, fallback.surface),
    text: colorOr(r.text, fallback.text),
    muted: colorOr(r.muted, fallback.muted),
    border: colorOr(r.border, fallback.border),
    accent: hexOr(r.accent, fallback.accent),
    accentAlt: hexOr(r.accentAlt, fallback.accentAlt),
    secondary: hexOr(r.secondary, fallback.secondary),
    highlight: hexOr(r.highlight, fallback.highlight),
  };
}

/** Convert a v1 theme to NormalizedTheme (layout fixed to dream-banner). */
function normalizeV1(raw: ThemeConfigV1, warnings: string[]): NormalizedTheme {
  const palette = paletteFromV1(raw.colors);
  const shell = deriveShellColors(palette.accent);
  const light: ThemePalette = {
    ...palette,
    background: shell.background,
    panel: shell.panel,
    panelAlt: shell.panelAlt,
  };

  return {
    schemaVersion: 2,
    uuid: raw.id,
    id: raw.id,
    version: "1.0.0",
    minEngineVersion: "1.0.0",
    name: pickString(raw.name, "Codex Theme", 80),
    description: pickString(raw.tagline, "", 160),
    tagline: pickString(raw.tagline, "把喜欢的画面变成可交互的 Codex 工作台。", 160),
    tags: [],
    resources: { hero: raw.image },
    light,
    dark: deriveDarkPalette(light),
    layout: DEFAULT_V1_LAYOUT,
    hero: {
      fit: "cover",
      focusX: 0.62,
      focusY: 0.24,
      zoom: 1,
      height: 252,
      textAlign: "left",
      scrim: 0.62,
    },
    wallpaper: {
      enabled: false,
      focusX: 0.5,
      focusY: 0.5,
      opacity: 0.15,
      blur: 0,
    },
    appearance: {
      radius: "lg",
      density: "normal",
      fontPreset: "system",
      glass: false,
      shadow: "lg",
      decoration: 0.8,
    },
    effects: {
      particles: 0,
      aurora: 0,
      glow: 0,
      noise: 0,
      grid: 0,
      float: 0,
    },
    copy: {
      brandSubtitle: pickString(raw.brandSubtitle, "CODEX THEMES", 80),
      projectPrefix: pickString(raw.projectPrefix, "选择项目 · ", 80),
      projectLabel: pickString(raw.projectLabel, "◉  选择项目", 80),
      statusText: pickString(raw.statusText, "THEME ONLINE", 80),
      quote: pickString(raw.quote, "MAKE SOMETHING WONDERFUL", 80),
    },
  };
}

/** Convert / validate a v2 theme to NormalizedTheme. */
function normalizeV2(raw: ThemeConfigV2, warnings: string[]): NormalizedTheme {
  const light = normalizePalette(raw.light, "light", warnings);
  const dark = raw.dark
    ? normalizePalette(raw.dark, "dark", warnings)
    : deriveDarkPalette(light);

  const resources: NormalizedResources = {
    hero: pickString(raw.hero, "hero.png"),
    wallpaper: raw.wallpaper ? pickString(raw.wallpaper, "") || undefined : undefined,
    stamp: raw.stamp ? pickString(raw.stamp, "") || undefined : undefined,
    preview: raw.preview ? pickString(raw.preview, "") || undefined : undefined,
  };

  return {
    schemaVersion: 2,
    uuid: pickString(raw.uuid, raw.id),
    id: pickString(raw.id, "theme", 80),
    version: pickString(raw.version, "1.0.0", 32),
    minEngineVersion: pickString(raw.minEngineVersion, "1.0.0", 32),
    name: pickString(raw.name, "Codex Theme", 80),
    description: pickString(raw.description, "", 160),
    tagline: pickString(raw.tagline, "把喜欢的画面变成可交互的 Codex 工作台。", 160),
    tags: pickArrayOfStrings(raw.tags).slice(0, 16),
    resources,
    light,
    dark,
    layout: pickEnum(
      raw.layout,
      ["dream-banner", "split-studio", "full-canvas", "terminal-grid", "paper-board", "minimal-focus", "retro-messenger", "silk-scroll"],
      "dream-banner",
    ),
    hero: {
      fit: pickEnum(raw.heroFit, ["cover", "contain"], "cover"),
      focusX: pickNumber(raw.heroFocusX, 0.5, 0, 1),
      focusY: pickNumber(raw.heroFocusY, 0.5, 0, 1),
      zoom: pickNumber(raw.heroZoom, 1, 1, 2),
      height: Math.round(pickNumber(raw.heroHeight, 252, 200, 360)),
      textAlign: pickEnum(raw.heroTextAlign, ["left", "center", "right"], "left"),
      scrim: pickNumber(raw.heroScrim, 0.62, 0, 0.85),
    },
    wallpaper: {
      enabled: pickBoolean(raw.wallpaperEnabled, false),
      focusX: pickNumber(raw.wallpaperFocusX, 0.5, 0, 1),
      focusY: pickNumber(raw.wallpaperFocusY, 0.5, 0, 1),
      opacity: pickNumber(raw.wallpaperOpacity, 0.15, 0, 0.45),
      blur: pickNumber(raw.wallpaperBlur, 0, 0, 20),
    },
    appearance: {
      radius: pickEnum(raw.radius, ["none", "sm", "md", "lg", "xl"], "lg"),
      density: pickEnum(raw.density, ["compact", "normal", "spacious"], "normal"),
      fontPreset: pickEnum(raw.fontPreset, ["system", "rounded", "mono"], "system"),
      glass: pickBoolean(raw.glass, false),
      shadow: pickEnum(raw.shadow, ["none", "sm", "md", "lg"], "lg"),
      decoration: pickNumber(raw.decoration, 0.8, 0, 1),
    },
    effects: {
      particles: clamp01(Number(raw.effects?.particles ?? 0)),
      aurora: clamp01(Number(raw.effects?.aurora ?? 0)),
      glow: clamp01(Number(raw.effects?.glow ?? 0)),
      noise: clamp01(Number(raw.effects?.noise ?? 0)),
      grid: clamp01(Number(raw.effects?.grid ?? 0)),
      float: clamp01(Number(raw.effects?.float ?? 0)),
    },
    copy: {
      brandSubtitle: pickString(raw.brandSubtitle, "CODEX THEMES", 80),
      projectPrefix: pickString(raw.projectPrefix, "选择项目 · ", 80),
      projectLabel: pickString(raw.projectLabel, "◉  选择项目", 80),
      statusText: pickString(raw.statusText, "THEME ONLINE", 80),
      quote: pickString(raw.quote, "MAKE SOMETHING WONDERFUL", 80),
    },
    catalogOnly: raw.catalogOnly === true,
  };
}

/** Detect schema version from an untrusted JSON object. */
function detectVersion(raw: unknown): 1 | 2 | null {
  if (!raw || typeof raw !== "object") return null;
  const version = (raw as Record<string, unknown>).schemaVersion;
  if (version === 2) return 2;
  if (version === 1) return 1;
  // Legacy detection: v1 has no schemaVersion but has `image` and `colors`.
  if (typeof (raw as Record<string, unknown>).image === "string") return 1;
  return null;
}

/**
 * Normalize any raw theme config into a v2 NormalizedTheme.
 * Throws on hard violations (missing id, missing image, etc.).
 */
export function normalizeTheme(raw: unknown, opts: NormalizationOptions = {}): NormalizationResult {
  const warnings: string[] = [];
  const version = detectVersion(raw);

  if (version === null) {
    throw new Error("Unrecognized theme schema: missing schemaVersion and legacy fields.");
  }

  if (version === 1) {
    const v1 = raw as ThemeConfigV1;
    if (typeof v1.id !== "string" || !v1.id) {
      throw new Error("Legacy theme has no id.");
    }
    if (typeof v1.image !== "string" || !v1.image) {
      throw new Error("Legacy theme has no image.");
    }
    return { theme: normalizeV1(v1, warnings), warnings };
  }

  const v2 = raw as ThemeConfigV2;
  if (typeof v2.id !== "string" || !v2.id) {
    throw new Error("Theme has no id.");
  }
  if (typeof v2.hero !== "string" || !v2.hero) {
    throw new Error("Theme has no hero image.");
  }

  const theme = normalizeV2(v2, warnings);
  return { theme, warnings };
}

/** Compute relative luminance of an sRGB color (WCAG). */
export function relativeLuminance(hex: string): number | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = Number.parseInt(m[1], 16);
  const rsRGB = ((v >> 16) & 255) / 255;
  const gsRGB = ((v >> 8) & 255) / 255;
  const bsRGB = (v & 255) / 255;
  const adjust = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * adjust(rsRGB) + 0.7152 * adjust(gsRGB) + 0.0722 * adjust(bsRGB);
}

/** Contrast ratio between two hex colors. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Validate WCAG AA contrast for core text. Returns warnings. */
export function validateContrast(theme: NormalizedTheme, local = true): string[] {
  const warnings: string[] = [];
  const aaBody = 4.5;
  const aaLarge = 3.0;
  for (const mode of ["light", "dark"] as const) {
    const palette = theme[mode];
    const body = contrastRatio(palette.text, palette.background);
    const accent = contrastRatio(palette.accent, palette.background);
    if (body !== null && body < aaBody) {
      warnings.push(`${mode} mode body text contrast ${body.toFixed(2)} < ${aaBody}.`);
    }
    if (accent !== null && accent < aaLarge) {
      warnings.push(`${mode} mode accent contrast ${accent.toFixed(2)} < ${aaLarge}.`);
    }
  }
  return warnings;
}

/** Default empty NormalizedTheme, useful for previews and tests. */
export function defaultNormalizedTheme(): NormalizedTheme {
  return normalizeTheme({
    schemaVersion: 2,
    uuid: "00000000-0000-0000-0000-000000000000",
    id: "default",
    version: "1.0.0",
    minEngineVersion: "1.0.0",
    name: "Codex Theme",
    description: "",
    tagline: "把喜欢的画面变成可交互的 Codex 工作台。",
    tags: [],
    hero: "hero.png",
    light: {
      background: "#f7f4ef",
      panel: "#ffffff",
      panelAlt: "#faf7f2",
      surface: "#ffffff",
      text: "#3d3630",
      muted: "#7d756b",
      border: "rgba(138, 154, 109, 0.22)",
      accent: "#8a9a6d",
      accentAlt: "#a8b894",
      secondary: "#d4a5a5",
      highlight: "#c9b18a",
    },
    layout: "dream-banner",
    heroFit: "cover",
    heroFocusX: 0.5,
    heroFocusY: 0.5,
    heroZoom: 1,
    heroHeight: 252,
    heroTextAlign: "left",
    heroScrim: 0.62,
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
    brandSubtitle: "CODEX THEMES",
    projectPrefix: "选择项目 · ",
    projectLabel: "◉  选择项目",
    statusText: "THEME ONLINE",
    quote: "MAKE SOMETHING WONDERFUL",
  } as ThemeConfigV2).theme;
}
