import sharp from "sharp";

export const MAX_AVATAR_SOURCE_BYTES = 3 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;

export async function normalizeAvatar(source: Uint8Array): Promise<Buffer> {
  if (source.byteLength < 1 || source.byteLength > MAX_AVATAR_SOURCE_BYTES) {
    throw new Error("Avatar image must not exceed 3 MB");
  }

  const metadata = await sharp(source, {
    failOn: "warning",
    limitInputPixels: MAX_INPUT_PIXELS,
  }).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 96 || metadata.height < 96) {
    throw new Error("Avatar image must be at least 96 × 96");
  }

  return sharp(source, {
    failOn: "warning",
    limitInputPixels: MAX_INPUT_PIXELS,
  })
    .rotate()
    .resize(512, 512, { fit: "cover", position: "attention" })
    .webp({ quality: 86, effort: 4 })
    .toBuffer();
}
