/**
 * Local image analysis for the Theme Synthesizer.
 *
 * Computes low-level visual properties from the selected hero image so the
 * synthesizer can ground AI Recipe decisions in real pixel data:
 *   - brightness / contrast
 *   - warm/cool/neutral color temperature
 *   - light/dark UI appearance bias
 *   - salient subject position and suggested hero focus
 *   - left/right negative-space balance for text alignment
 *   - edge complexity for scrim / wallpaper blur + opacity
 *
 * All processing happens on a small resized bitmap; no third-party CV
 * libraries are required.
 */

import { nativeImage } from "electron";
import type { ImageFit, TextAlign } from "../shared/types";

const ANALYSIS_WIDTH = 256;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface ImageAnalysis {
  averageBrightness: number;
  contrast: number;
  colorTemperature: "cool" | "neutral" | "warm";
  suggestedAppearance: "light" | "dark";
  /** Focal point the hero should be cropped around (0-1). */
  suggestedFocusX: number;
  suggestedFocusY: number;
  /** Where text should live so it does not overlap the main subject. */
  suggestedTextAlign: TextAlign;
  /** Suggested hero dark scrim intensity (0-1). */
  suggestedScrim: number;
  /** Suggested wallpaper focus point (0-1). */
  wallpaperFocusX: number;
  wallpaperFocusY: number;
  /** Suggested wallpaper blur radius (0-32). */
  wallpaperBlur: number;
  /** Suggested wallpaper opacity (0-1). */
  wallpaperOpacity: number;
  /** Perceptual complexity of the image (0-1). */
  complexity: number;
  /** Whether the image feels more suited to `cover` or `contain`. */
  suggestedHeroFit: ImageFit;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Lab {
  l: number;
  a: number;
  b: number;
}

export function analyzeImage(imagePath: string): ImageAnalysis {
  const image = nativeImage.createFromPath(imagePath);
  if (image.isEmpty()) throw new Error("无法解码图片以进行构图分析。");

  const original = image.getSize();
  const scale = ANALYSIS_WIDTH / original.width;
  const resized =
    scale < 1 ? image.resize({ width: ANALYSIS_WIDTH, quality: "good" }) : image;
  const bitmap = resized.getBitmap() as unknown as Buffer;
  const { width, height } = resized.getSize();

  const pixels: Rgb[] = [];
  const lums: number[] = [];
  const sats: number[] = [];
  const hues: number[] = [];

  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    const b = bitmap[offset] / 255;
    const g = bitmap[offset + 1] / 255;
    const r = bitmap[offset + 2] / 255;
    const a = bitmap[offset + 3] / 255;
    const alphaWeight = a;
    pixels.push({ r, g, b });
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lums.push(lum);
    const hsl = rgbToHsl(r, g, b);
    sats.push(hsl.s * alphaWeight);
    if (hsl.s > 0.08) hues.push(hsl.h);
  }

  const n = width * height;
  const avgBrightness = lums.reduce((a, b) => a + b, 0) / n;
  const contrast = Math.sqrt(lums.reduce((sum, v) => sum + (v - avgBrightness) ** 2, 0) / n);

  const colorTemperature = classifyTemperature(hues);
  const suggestedAppearance = avgBrightness > 0.55 ? "light" : "dark";

  // Build a coarse saliency map on the resized image.
  const saliency = computeSaliency(pixels, lums, sats, width, height);
  const blurred = boxBlur(saliency, width, height, 3);

  // Weighted centroid of saliency.
  let totalWeight = 0;
  let sumX = 0;
  let sumY = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const w = blurred[y * width + x];
      totalWeight += w;
      sumX += w * (x + 0.5);
      sumY += w * (y + 0.5);
    }
  }
  const suggestedFocusX = totalWeight > 0 ? sumX / totalWeight / width : 0.5;
  const suggestedFocusY = totalWeight > 0 ? sumY / totalWeight / height : 0.5;

  // Left/right negative space: text goes opposite to the main mass.
  let leftWeight = 0;
  let rightWeight = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const w = blurred[y * width + x];
      if (x < width / 2) leftWeight += w;
      else rightWeight += w;
    }
  }
  let suggestedTextAlign: TextAlign = "center";
  if (leftWeight > rightWeight * 1.35) suggestedTextAlign = "right";
  else if (rightWeight > leftWeight * 1.35) suggestedTextAlign = "left";

  // Complexity from average local gradient magnitude.
  const complexity = estimateComplexity(lums, width, height);

  // Scrim: bright and/or low-contrast images need more help for white text.
  let suggestedScrim = 0.42;
  if (avgBrightness > 0.6) suggestedScrim += 0.12;
  else if (avgBrightness < 0.25) suggestedScrim -= 0.1;
  if (contrast < 0.2) suggestedScrim += 0.08;
  if (complexity > 0.6) suggestedScrim += 0.06;
  suggestedScrim = clamp(suggestedScrim, 0.2, 0.72);

  // Wallpaper: busy images benefit from more blur and lower opacity.
  const wallpaperBlur = clamp(complexity * 18 + avgBrightness * 4, 0, 24);
  const wallpaperOpacity = clamp(0.22 - complexity * 0.12 + avgBrightness * 0.1, 0.08, 0.4);

  // Fit: very wide or detailed images work better with cover; portraits/vertical
  // subjects that risk cropping are hinted toward contain.
  const aspectRatio = original.width / original.height;
  const suggestedHeroFit: ImageFit =
    aspectRatio > 2.4 || aspectRatio < 0.7 ? "contain" : "cover";

  return {
    averageBrightness: avgBrightness,
    contrast,
    colorTemperature,
    suggestedAppearance,
    suggestedFocusX: clamp(suggestedFocusX, 0, 1),
    suggestedFocusY: clamp(suggestedFocusY, 0, 1),
    suggestedTextAlign,
    suggestedScrim,
    wallpaperFocusX: clamp(suggestedFocusX, 0, 1),
    wallpaperFocusY: clamp(suggestedFocusY, 0, 1),
    wallpaperBlur,
    wallpaperOpacity,
    complexity,
    suggestedHeroFit,
  };
}

function rgbToHsl(r: number, g: number, b: number) {
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

function classifyTemperature(hues: number[]): "cool" | "neutral" | "warm" {
  if (hues.length === 0) return "neutral";
  let warm = 0;
  let cool = 0;
  for (const h of hues) {
    if (h <= 70 || h >= 320) warm += 1;
    else if (h >= 110 && h <= 250) cool += 1;
  }
  const total = warm + cool;
  if (total === 0) return "neutral";
  const ratio = warm / total;
  if (ratio > 0.62) return "warm";
  if (ratio < 0.38) return "cool";
  return "neutral";
}

function computeSaliency(pixels: Rgb[], lums: number[], sats: number[], width: number, height: number): number[] {
  const n = width * height;
  const global = averageLab(pixels);
  const out = new Array(n).fill(0);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const lab = rgbToLab(pixels[i]);
      // Color rarity vs global average.
      const colorDist = Math.hypot(lab.l - global.l, lab.a - global.a, lab.b - global.b);
      // Local luminance gradient.
      const gx = lums[i + 1] - lums[i - 1];
      const gy = lums[i + width] - lums[i - width];
      const grad = Math.hypot(gx, gy);
      out[i] = colorDist * 0.5 + grad * 2 + sats[i] * 0.3;
    }
  }

  // Normalize to 0-1.
  const max = Math.max(...out);
  if (max > 0) {
    for (let i = 0; i < n; i += 1) out[i] /= max;
  }
  return out;
}

function boxBlur(values: number[], width: number, height: number, radius: number): number[] {
  const out = new Array(width * height).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const yy = clamp(y + dy, 0, height - 1);
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = clamp(x + dx, 0, width - 1);
          sum += values[yy * width + xx];
          count += 1;
        }
      }
      out[y * width + x] = sum / count;
    }
  }
  return out;
}

function estimateComplexity(lums: number[], width: number, height: number): number {
  let totalGrad = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const gx = lums[i + 1] - lums[i - 1];
      const gy = lums[i + width] - lums[i - width];
      totalGrad += Math.hypot(gx, gy);
      count += 1;
    }
  }
  const avgGrad = count > 0 ? totalGrad / count : 0;
  return clamp(avgGrad * 6, 0, 1);
}

function averageLab(pixels: Rgb[]): Lab {
  let l = 0;
  let a = 0;
  let b = 0;
  for (const p of pixels) {
    const lab = rgbToLab(p);
    l += lab.l;
    a += lab.a;
    b += lab.b;
  }
  const n = pixels.length;
  return { l: l / n, a: a / n, b: b / n };
}

function rgbToLab({ r, g, b }: Rgb): Lab {
  // Simple sRGB -> XYZ -> Lab approximation, accurate enough for clustering.
  const toLinear = (c: number) => (c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92);
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  const x = lr * 0.4124 + lg * 0.3576 + lb * 0.1805;
  const y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722;
  const z = lr * 0.0193 + lg * 0.1192 + lb * 0.9505;

  const toLab = (t: number) =>
    t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116;
  const fx = toLab(x / 0.95047);
  const fy = toLab(y);
  const fz = toLab(z / 1.08883);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

// Re-export for callers that only need the focal suggestion.
export type { Rgb, Lab };
