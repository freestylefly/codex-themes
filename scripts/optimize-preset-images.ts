/**
 * [INPUT]: 依赖 assets/presets 中的 PNG 与 sharp 编码器
 * [OUTPUT]: 生成同名 WebP，并同步 theme.json 的资源引用
 * [POS]: 内置主题发布资源优化器，保留 PNG 源文件供设计迭代
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const presetsRoot = path.resolve(import.meta.dir, "..", "assets", "presets");

async function filesBelow(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(fullPath) : [fullPath];
  }));
  return nested.flat();
}

const files = await filesBelow(presetsRoot);
const pngFiles = files.filter((file) => file.toLowerCase().endsWith(".png"));
await Promise.all(pngFiles.map(async (file) => {
  await sharp(file).webp({ quality: 90, effort: 6 }).toFile(file.replace(/\.png$/i, ".webp"));
}));

const manifests = files.filter((file) => path.basename(file) === "theme.json");
await Promise.all(manifests.map(async (file) => {
  const source = await readFile(file, "utf8");
  await writeFile(file, source.replace(/\.png"/g, '.webp"'));
}));

console.log(`Optimized ${pngFiles.length} preset images.`);
