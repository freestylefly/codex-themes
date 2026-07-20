/**
 * Palette extraction: nativeImage decoding + in-house color quantization.
 * No third-party color libraries.
 *
 * Strategy (tuned against Codex-Dream-Skin's hand-picked palettes): find the
 * image's dominant *hue family* via a saturation-weighted hue histogram, then
 * normalize it into a vivid accent (saturation floor + lightness clamp) so
 * even misty/pastel photos yield accents with presence instead of washed-out
 * grays. Secondary picks the strongest hue family far from the accent.
 */

import { nativeImage } from "electron";
import type { ExtractedPalette } from "../shared/types";
import { hexToHsl, hslToHex, type Hsl } from "../shared/tone";

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const rgbToHsl = ({ r, g, b }: Rgb): Hsl => {
  const hex = `#${[r, g, b]
    .map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0"))
    .join("")}`;
  return hexToHsl(hex) ?? { h: 0, s: 0, l: 0.5 };
};

const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

interface Bucket {
  r: number;
  g: number;
  b: number;
  count: number;
}

const HUE_BINS = 24;
const BIN_SIZE = 360 / HUE_BINS;

interface HueFamily {
  hue: number;
  saturation: number;
  lightness: number;
  weight: number;
}

/**
 * Collapse quantized color buckets into hue families: each 15° bin gets the
 * saturation-weighted circular mean of its member colors.
 */
function buildHueFamilies(colors: (Rgb & { count: number })[]): HueFamily[] {
  const bins = Array.from({ length: HUE_BINS }, () => ({
    weight: 0,
    sinSum: 0,
    cosSum: 0,
    satSum: 0,
    lightSum: 0,
  }));
  for (const c of colors) {
    const { h, s, l } = rgbToHsl(c);
    if (s < 0.08 || l < 0.1 || l > 0.94) continue; // greys/blacks/whites tint nothing
    const weight = c.count * (0.15 + s ** 1.2);
    const bin = bins[Math.floor(h / BIN_SIZE) % HUE_BINS];
    const rad = (h * Math.PI) / 180;
    bin.weight += weight;
    bin.sinSum += Math.sin(rad) * weight;
    bin.cosSum += Math.cos(rad) * weight;
    bin.satSum += s * weight;
    bin.lightSum += l * weight;
  }
  return bins
    .filter((bin) => bin.weight > 0)
    .map((bin) => ({
      hue: ((Math.atan2(bin.sinSum, bin.cosSum) * 180) / Math.PI + 360) % 360,
      saturation: bin.satSum / bin.weight,
      lightness: bin.lightSum / bin.weight,
      weight: bin.weight,
    }))
    .sort((a, b) => b.weight - a.weight);
}

/** Vivid accent normalization: keep the hue, guarantee presence. */
const vivify = (f: HueFamily): Hsl => ({
  h: f.hue,
  s: clamp(Math.max(f.saturation * 1.4, 0.46), 0, 0.8),
  l: clamp(f.lightness, 0.42, 0.58),
});

/**
 * Extract accent/secondary/highlight from an image file.
 */
export function extractPalette(imagePath: string): ExtractedPalette {
  const image = nativeImage.createFromPath(imagePath);
  if (image.isEmpty()) throw new Error("Could not decode the selected image.");
  const small = image.resize({ width: 96, quality: "good" });
  // Electron's d.ts lags the runtime here — getBitmap returns a Buffer.
  const bitmap = small.getBitmap() as unknown as Buffer; // BGRA on macOS
  const { width, height } = small.getSize();

  const buckets = new Map<number, Bucket>();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const b = bitmap[offset];
      const g = bitmap[offset + 1];
      const r = bitmap[offset + 2];
      const a = bitmap[offset + 3];
      if (a < 40) continue;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum < 14 || lum > 246) continue;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.r += r;
        bucket.g += g;
        bucket.b += b;
        bucket.count += 1;
      } else {
        buckets.set(key, { r, g, b, count: 1 });
      }
    }
  }

  const averaged = [...buckets.values()].map((bucket) => ({
    r: bucket.r / bucket.count,
    g: bucket.g / bucket.count,
    b: bucket.b / bucket.count,
    count: bucket.count,
  }));

  const families = buildHueFamilies(averaged);
  // Effectively monochrome image: fall back to an elegant slate-blue duo
  // rather than inventing color that is not there.
  if (families.length === 0) {
    return {
      accent: "#6d7fa3",
      accentAlt: "#93a3c2",
      secondary: "#b99a7c",
      highlight: "#3f4d6b",
    };
  }

  const accentFamily = families[0];
  const accentHsl = vivify(accentFamily);
  const accent = hslToHex(accentHsl);

  const accentAlt = hslToHex({
    h: accentHsl.h,
    s: accentHsl.s * 0.85,
    l: clamp(accentHsl.l + 0.16, 0, 0.74),
  });

  const secondaryFamily = families.find((f) => hueDistance(f.hue, accentFamily.hue) >= 55);
  const secondaryHsl: Hsl = secondaryFamily
    ? {
        h: secondaryFamily.hue,
        s: clamp(Math.max(secondaryFamily.saturation * 1.3, 0.38), 0, 0.7),
        l: clamp(secondaryFamily.lightness, 0.5, 0.68),
      }
    : { h: (accentHsl.h + 38) % 360, s: accentHsl.s * 0.8, l: clamp(accentHsl.l + 0.12, 0, 0.68) };
  const secondary = hslToHex(secondaryHsl);

  const highlight = hslToHex({
    h: accentHsl.h,
    s: clamp(accentHsl.s * 1.05, 0, 0.75),
    l: 0.3,
  });

  return { accent, accentAlt, secondary, highlight };
}
