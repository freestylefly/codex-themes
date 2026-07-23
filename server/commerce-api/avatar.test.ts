import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { normalizeAvatar } from "./avatar";

test("normalizeAvatar creates a square 512px WebP", async () => {
  const source = await sharp({
    create: {
      width: 900,
      height: 600,
      channels: 3,
      background: { r: 50, g: 35, b: 90 },
    },
  }).png().toBuffer();

  const normalized = await normalizeAvatar(source);
  const metadata = await sharp(normalized).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 512);
  assert.equal(metadata.height, 512);
});

test("normalizeAvatar rejects images smaller than the avatar minimum", async () => {
  const source = await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  }).png().toBuffer();

  await assert.rejects(normalizeAvatar(source), /at least 96/);
});

test("normalizeAvatar rejects invalid image bytes", async () => {
  await assert.rejects(normalizeAvatar(Buffer.from("not-an-image")));
});
