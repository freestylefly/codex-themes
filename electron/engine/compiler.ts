/**
 * Shared theme compiler.
 *
 * Turns a NormalizedTheme into CSS variables, layout classes and root attributes.
 * Used both by the main-process injection payload builder and by the renderer
 * preview canvas, so the live app and the editor always speak the same language.
 */

import type {
  LayoutKind,
  NormalizedTheme,
  RadiusPreset,
  ShadowPreset,
} from "../shared/types";
import { hexToRgba, hslToHex, hexToHsl } from "../shared/tone";

export interface CompiledTheme {
  /** CSS custom property map. */
  variables: Record<string, string>;
  /** Class names to put on <html> (in Codex) or the preview root. */
  classes: string[];
  /** Data attributes to put on the root. */
  attrs: Record<string, string>;
  /** Inline style string for quick application. */
  style: string;
}

export interface CompileOptions {
  /** Light or dark palette. */
  mode?: "light" | "dark";
  /** Wide or compact viewport (affects density). */
  compact?: boolean;
  /** Which layout to render; defaults to theme.layout. */
  layout?: LayoutKind;
}

const RADIUS_PX: Record<RadiusPreset, string> = {
  none: "0px",
  sm: "8px",
  md: "16px",
  lg: "24px",
  xl: "32px",
};

const SHADOW_VALUE: Record<ShadowPreset, string> = {
  none: "none",
  sm: "0 4px 12px rgba(0,0,0,.08)",
  md: "0 10px 28px rgba(0,0,0,.10)",
  lg: "0 18px 44px rgba(0,0,0,.14)",
};

function mixHex(a: string, b: string, t: number): string {
  const pa = /^#([0-9a-f]{6})$/i.exec(a.trim());
  const pb = /^#([0-9a-f]{6})$/i.exec(b.trim());
  if (!pa || !pb) return a;
  const va = Number.parseInt(pa[1], 16);
  const vb = Number.parseInt(pb[1], 16);
  const ch = (sa: number, sb: number) => Math.round(sa * t + sb * (1 - t));
  const r = ch((va >> 16) & 255, (vb >> 16) & 255);
  const g = ch((va >> 8) & 255, (vb >> 8) & 255);
  const bl = ch(va & 255, vb & 255);
  return `#${[r, g, bl].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function darkenForInk(hex: string): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return "#14101a";
  return hslToHex({ h: hsl.h, s: Math.min(hsl.s * 1.1, 1), l: Math.max(hsl.l * 0.28, 0.08) });
}

function radiusInset(radius: RadiusPreset): string {
  const map: Record<RadiusPreset, string> = {
    none: "0px",
    sm: "6px",
    md: "12px",
    lg: "20px",
    xl: "26px",
  };
  return map[radius];
}

export function compileTheme(theme: NormalizedTheme, opts: CompileOptions = {}): CompiledTheme {
  const mode = opts.mode ?? "light";
  const compact = opts.compact ?? false;
  const layout = opts.layout ?? theme.layout;
  const palette = theme[mode];

  const heroInk = mixHex(darkenForInk(palette.highlight), "#14101a", 0.62);
  const heroPosition = `${Math.round(theme.hero.focusX * 100)}% ${Math.round(theme.hero.focusY * 100)}%`;
  const wallpaperPosition = `${Math.round(theme.wallpaper.focusX * 100)}% ${Math.round(theme.wallpaper.focusY * 100)}%`;

  const densityMultiplier = compact ? 0.82 : theme.appearance.density === "compact" ? 0.88 : theme.appearance.density === "spacious" ? 1.18 : 1;

  const variables: Record<string, string> = {
    // Core palette
    "--ds-bg": palette.background,
    "--ds-panel": palette.panel,
    "--ds-panel-2": palette.panelAlt,
    "--ds-surface": palette.surface,
    "--ds-green": palette.accent,
    "--ds-lime": palette.accentAlt,
    "--ds-cyan": palette.secondary,
    "--ds-purple": palette.highlight,
    "--ds-text": palette.text,
    "--ds-muted": palette.muted,
    "--ds-line": palette.border,

    // Derived
    "--ds-ink-shadow": hexToRgba(palette.text, 0.12),
    "--ds-accent-glow": hexToRgba(palette.accent, 0.24),
    "--ds-card-border": mixHex(palette.accent, palette.panel, 0.18),
    "--ds-hero-ink": heroInk,

    // Layout / hero
    "--ds-layout": layout,
    "--ds-hero-fit": theme.hero.fit,
    "--ds-hero-position": heroPosition,
    "--ds-hero-zoom": String(theme.hero.zoom),
    "--ds-hero-height": `${Math.round(theme.hero.height * densityMultiplier)}px`,
    "--ds-hero-text-align": theme.hero.textAlign,
    "--ds-hero-scrim": String(theme.hero.scrim),
    "--ds-retro-title-height": layout === "retro-messenger" ? "34px" : "0px",
    "--ds-retro-toolbar-height": layout === "retro-messenger" ? "52px" : "0px",
    "--ds-retro-rail-width": layout === "retro-messenger" ? "184px" : "0px",
    "--ds-retro-border": layout === "retro-messenger" ? palette.accent : palette.border,

    // Wallpaper
    "--ds-wallpaper-enabled": theme.wallpaper.enabled ? "1" : "0",
    "--ds-wallpaper-position": wallpaperPosition,
    "--ds-wallpaper-opacity": String(theme.wallpaper.opacity),
    "--ds-wallpaper-blur": `${theme.wallpaper.blur}px`,

    // Appearance
    "--ds-radius": RADIUS_PX[theme.appearance.radius],
    "--ds-radius-inset": radiusInset(theme.appearance.radius),
    "--ds-density": theme.appearance.density,
    "--ds-density-scale": String(densityMultiplier),
    "--ds-font-preset": theme.appearance.fontPreset,
    "--ds-glass": theme.appearance.glass ? "1" : "0",
    "--ds-shadow": SHADOW_VALUE[theme.appearance.shadow],
    "--ds-decoration": String(theme.appearance.decoration),

    // Effects
    "--ds-fx-particles": String(theme.effects.particles),
    "--ds-fx-aurora": String(theme.effects.aurora),
    "--ds-fx-glow": String(theme.effects.glow),
    "--ds-fx-noise": String(theme.effects.noise),
    "--ds-fx-grid": String(theme.effects.grid),
    "--ds-fx-float": String(theme.effects.float),

    // Copy
    "--dream-skin-name": JSON.stringify(theme.name),
    "--dream-skin-tagline": JSON.stringify(theme.tagline),
    "--dream-skin-project-prefix": JSON.stringify(theme.copy.projectPrefix),
    "--dream-skin-project-label": JSON.stringify(theme.copy.projectLabel),
    "--dream-skin-status-text": JSON.stringify(theme.copy.statusText),
    "--dream-skin-quote": JSON.stringify(theme.copy.quote),
    "--dream-skin-brand-subtitle": JSON.stringify(theme.copy.brandSubtitle),
  };

  const classes = [
    "codex-dream-skin",
    `codex-dream-skin--${layout}`,
    `codex-dream-skin--${mode}`,
    compact ? "codex-dream-skin--compact" : "codex-dream-skin--wide",
  ];

  const attrs: Record<string, string> = {
    "data-dream-shell": mode,
    "data-dream-layout": layout,
    "data-dream-theme": theme.id,
    "data-dream-density": compact ? "compact" : theme.appearance.density,
  };

  const style = Object.entries(variables)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");

  return { variables, classes, attrs, style };
}

/** Build a compact <style> block for the preview canvas. */
export function compilePreviewStyle(theme: NormalizedTheme, opts: CompileOptions = {}): string {
  const compiled = compileTheme(theme, opts);
  const selector = `.codex-dream-skin-preview`;
  return `${selector} { ${compiled.style}; }`;
}

/** Pick a readable text color for a given background (black/white fallback). */
export function readableTextFor(background: string): "#000000" | "#ffffff" {
  const lum = hexToHsl(background);
  if (!lum) return "#000000";
  return lum.l > 0.5 ? "#000000" : "#ffffff";
}
