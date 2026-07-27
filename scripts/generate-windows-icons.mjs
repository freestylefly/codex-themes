/**
 * [INPUT]: 依赖 assets/build/icon.png、Sharp 与 ICO 二进制格式
 * [OUTPUT]: 生成 Windows 多尺寸 icon.ico 和托盘 iconWindows.png
 * [POS]: scripts 的 Windows 品牌图标单一生成入口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const repoRoot = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(repoRoot, "assets", "build", "icon.png");
const icoPath = path.join(repoRoot, "assets", "build", "icon.ico");
const trayPath = path.join(repoRoot, "assets", "tray", "iconWindows.png");
const iconSizes = [16, 24, 32, 48, 64, 128, 256];

async function renderPng(size) {
  return sharp(sourcePath)
    .resize(size, size, { fit: "contain" })
    .ensureAlpha()
    .png()
    .toBuffer();
}

function encodeIco(images) {
  const headerSize = 6;
  const entrySize = 16;
  const directory = Buffer.alloc(headerSize + entrySize * images.length);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(images.length, 4);

  let imageOffset = directory.length;
  for (let index = 0; index < images.length; index += 1) {
    const { size, data } = images[index];
    const entryOffset = headerSize + entrySize * index;
    directory.writeUInt8(size === 256 ? 0 : size, entryOffset);
    directory.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
    directory.writeUInt8(0, entryOffset + 2);
    directory.writeUInt8(0, entryOffset + 3);
    directory.writeUInt16LE(1, entryOffset + 4);
    directory.writeUInt16LE(32, entryOffset + 6);
    directory.writeUInt32LE(data.length, entryOffset + 8);
    directory.writeUInt32LE(imageOffset, entryOffset + 12);
    imageOffset += data.length;
  }

  return Buffer.concat([directory, ...images.map((image) => image.data)]);
}

const images = await Promise.all(
  iconSizes.map(async (size) => ({ size, data: await renderPng(size) })),
);
await fs.writeFile(icoPath, encodeIco(images));
await fs.writeFile(trayPath, await renderPng(32));

console.log(`Generated ${icoPath}`);
console.log(`Generated ${trayPath}`);
