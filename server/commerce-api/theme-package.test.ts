import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import AdmZip from "adm-zip";
import { validateAndCanonicalizeThemePackage } from "./theme-package";

const FIXTURE_DIR = path.join(process.cwd(), "assets", "presets", "blue-window-messenger");

function validPackage(mutator?: (theme: Record<string, unknown>, zip: AdmZip) => void): Buffer {
  const theme = JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, "theme.json"), "utf8"),
  ) as Record<string, unknown>;
  theme.hero = "hero.png";
  theme.wallpaper = "wallpaper.png";
  theme.stamp = "stamp.png";
  theme.preview = "preview.png";
  delete theme.priceCents;
  delete theme.catalogOnly;

  const zip = new AdmZip();
  zip.addFile("hero.png", fs.readFileSync(path.join(FIXTURE_DIR, "mascot.png")));
  zip.addFile("wallpaper.png", fs.readFileSync(path.join(FIXTURE_DIR, "background-v2.png")));
  zip.addFile("stamp.png", fs.readFileSync(path.join(FIXTURE_DIR, "stamp.png")));
  zip.addFile("preview.png", fs.readFileSync(path.join(FIXTURE_DIR, "preview.png")));
  mutator?.(theme, zip);
  zip.addFile("theme.json", Buffer.from(JSON.stringify(theme)));
  return zip.toBuffer();
}

test("server canonicalizes a valid community theme package", async () => {
  const result = await validateAndCanonicalizeThemePackage(
    validPackage(),
    "community-123",
    "1.0.2",
  );
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.ok(result.previewBuffer.length > 0);
  const manifest = JSON.parse(
    new AdmZip(result.packageBuffer).readAsText("theme.json"),
  ) as Record<string, unknown>;
  assert.equal(manifest.id, "community-123");
  assert.equal(manifest.version, "1.0.2");
  assert.equal(manifest.preview, "preview.webp");
  assert.equal(manifest.catalogOnly, undefined);
});

test("server rejects a missing declared resource", async () => {
  await assert.rejects(
    validateAndCanonicalizeThemePackage(
      validPackage((theme, zip) => {
        theme.wallpaper = "wallpaper.webp";
        zip.deleteFile("wallpaper.png");
      }),
      "community-123",
      "1.0.0",
    ),
    /wallpaper/,
  );
});

test("server rejects path traversal before publishing", async () => {
  await assert.rejects(
    validateAndCanonicalizeThemePackage(
      validPackage((_theme, zip) => {
        zip.addFile("../payload.js", Buffer.from("alert(1)"));
      }),
      "community-123",
      "1.0.0",
    ),
    /不允许的文件/,
  );
});
