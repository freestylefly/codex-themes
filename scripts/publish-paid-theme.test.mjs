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
    "hero.png",
    "preview.png",
    "stamp.png",
    "theme.json",
    "wallpaper.png",
  ]);
  assert.equal(manifest.id, "blue-window-messenger");
  assert.equal(manifest.hero, "hero.png");
  assert.equal(manifest.wallpaper, "wallpaper.png");
  assert.equal(manifest.stamp, "stamp.png");
  assert.equal(manifest.preview, "preview.png");
  assert.equal(manifest.catalogOnly, undefined);
  assert.equal(manifest.priceCents, undefined);
  assert.match(sha256, /^[a-f0-9]{64}$/);
});
