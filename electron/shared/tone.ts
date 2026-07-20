/**
 * Tonal color system: turns the artwork's accent colors into the full shell
 * palette (background / panels / ink / muted / line) so the whole window
 * follows the picture instead of a fixed cream shell.
 *
 * Dependency-free on purpose — imported from both the main process
 * (palette extraction, theme store) and the renderer (editor live preview).
 */

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export interface ShellColors {
  background: string;
  panel: string;
  panelAlt: string;
  text: string;
  muted: string;
  line: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function hexToHsl(hex: string): Hsl | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = Number.parseInt(m[1], 16);
  const r = ((v >> 16) & 255) / 255;
  const g = ((v >> 8) & 255) / 255;
  const b = (v & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const hh = ((h % 360) + 360) % 360;
  const ss = clamp(s, 0, 1);
  const ll = clamp(l, 0, 1);
  const chroma = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = chroma * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - chroma / 2;
  const [rn, gn, bn] =
    hh < 60 ? [chroma, x, 0]
    : hh < 120 ? [x, chroma, 0]
    : hh < 180 ? [0, chroma, x]
    : hh < 240 ? [0, x, chroma]
    : hh < 300 ? [x, 0, chroma]
    : [chroma, 0, x];
  const toByte = (c: number) =>
    Math.round((c + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toByte(rn)}${toByte(gn)}${toByte(bn)}`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const v = Number.parseInt(m[1], 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${alpha})`;
}

/**
 * Shell palette derived from the accent hue. Tuned so a vivid accent yields
 * a softly tinted, airy shell (think 图1: lavender window around violet art)
 * with ink text that carries the same hue.
 */
export function deriveShellColors(accentHex: string): ShellColors {
  const a = hexToHsl(accentHex) ?? { h: 95, s: 0.28, l: 0.52 };
  const h = a.h;
  // Near-grey accents get a near-neutral shell instead of a fake tint.
  const chroma = a.s < 0.08 ? 0.3 : 1;
  return {
    background: hslToHex({ h, s: clamp(0.2 + a.s * 0.35, 0, 0.46) * chroma, l: 0.955 }),
    panel: hslToHex({ h, s: clamp(0.25 + a.s * 0.3, 0, 0.5) * chroma, l: 0.988 }),
    panelAlt: hslToHex({ h, s: clamp(0.22 + a.s * 0.32, 0, 0.48) * chroma, l: 0.965 }),
    text: hslToHex({ h, s: clamp(0.12 + a.s * 0.45, 0, 0.4) * chroma, l: 0.17 }),
    muted: hslToHex({ h, s: clamp(0.08 + a.s * 0.28, 0, 0.22) * chroma, l: 0.44 }),
    line: hexToRgba(accentHex, 0.26),
  };
}
