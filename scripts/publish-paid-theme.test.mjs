/**
 * [INPUT]: 依赖可安装的内置付费主题与发布打包器
 * [OUTPUT]: 验证付费主题包包含真实 WebP 资源且清除目录占位字段
 * [POS]: scripts 的付费主题制品门禁，阻止不可安装目录包发布
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import AdmZip from "adm-zip";
import { buildPackage } from "./publish-paid-theme.mjs";

test("paid theme packages contain installable resources instead of catalog placeholders", async () => {
  const themeDir = path.join(
    process.cwd(),
    "assets",
    "presets",
    "blue-window-messenger",
  );
  const { buffer, sha256 } = await buildPackage(themeDir, "blue-window-messenger");
  const zip = new AdmZip(buffer);
  const entries = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory)
    .map((entry) => entry.entryName)
    .sort();
  const manifest = JSON.parse(zip.readAsText("theme.json"));

  assert.deepEqual(entries, [
    "hero.webp",
    "preview.webp",
    "stamp.webp",
    "theme.json",
    "wallpaper.webp",
  ]);
  assert.equal(manifest.id, "blue-window-messenger");
  assert.equal(manifest.hero, "hero.webp");
  assert.equal(manifest.wallpaper, "wallpaper.webp");
  assert.equal(manifest.stamp, "stamp.webp");
  assert.equal(manifest.preview, "preview.webp");
  assert.equal(manifest.catalogOnly, undefined);
  assert.equal(manifest.priceCents, undefined);
  assert.match(sha256, /^[a-f0-9]{64}$/);
});
