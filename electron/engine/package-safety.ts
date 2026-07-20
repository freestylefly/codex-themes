/**
 * Theme package (.codextheme) safety rules — pure, testable helpers shared by
 * the inspect and install paths (DESIGN/plan §11.3):
 *   - hard limits on package size, unpacked size, file count and image bytes
 *   - a strict root-file whitelist (no nested paths, no unknown files)
 *   - animated image detection (APNG / animated WebP are rejected)
 */

export const MAX_PACKAGE_BYTES = 24 * 1024 * 1024;
export const MAX_UNPACKED_BYTES = 32 * 1024 * 1024;
export const MAX_PACKAGE_FILES = 16;
export const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 8192;

/** Root-only whitelist: config, docs, and the known image slots. */
const PACKAGE_NAME_RE =
  /^(?:theme\.json|README\.md|LICENSE|(?:hero|wallpaper|stamp|preview|background)\.(?:png|jpe?g|webp))$/;

const IMAGE_NAME_RE = /\.(?:png|jpe?g|webp)$/i;

export function isAllowedPackageEntry(name: string): boolean {
  return PACKAGE_NAME_RE.test(name);
}

export function isImageEntry(name: string): boolean {
  return IMAGE_NAME_RE.test(name);
}

/** True when the entry name tries to escape the package root. */
export function isUnsafeEntryPath(name: string): boolean {
  return (
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("..") ||
    name.startsWith("~") ||
    name.trim() !== name ||
    name.length === 0
  );
}

/** APNG: an `acTL` chunk appearing before the first `IDAT`. */
export function isAnimatedPng(buf: Buffer): boolean {
  const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) return false;
  let offset = 8;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    if (type === "acTL") return true;
    if (type === "IDAT" || type === "IEND") return false;
    offset += 12 + length;
  }
  return false;
}

/** Animated WebP: VP8X animation flag, or an ANIM chunk. */
export function isAnimatedWebp(buf: Buffer): boolean {
  if (buf.length < 21) return false;
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") {
    return false;
  }
  if (buf.toString("ascii", 12, 16) === "VP8X" && (buf[20] & 0x02) !== 0) return true;
  return buf.includes("ANIM");
}

/** Reject animated variants of formats that are otherwise allowed. */
export function isAnimatedImage(name: string, buf: Buffer): boolean {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return isAnimatedPng(buf);
  if (lower.endsWith(".webp")) return isAnimatedWebp(buf);
  return false;
}
