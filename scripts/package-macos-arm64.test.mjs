import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertAppleSilicon,
  assertArtifactsExist,
  assertReleaseTag,
  assertRequiredEnv,
  getArtifactPaths,
  readUpdateEntry,
  updateDmgMetadata,
} from "./package-macos-arm64.mjs";

test("Apple Silicon environment validation accepts only darwin arm64", () => {
  assert.doesNotThrow(() => assertAppleSilicon("darwin", "arm64"));
  assert.throws(() => assertAppleSilicon("darwin", "x64"), /darwin\/x64/);
  assert.throws(() => assertAppleSilicon("linux", "arm64"), /linux\/arm64/);
});

test("required credential validation reports names without exposing values", () => {
  const privateValue = "do-not-print-this-value";
  assert.throws(
    () =>
      assertRequiredEnv({
        APPLE_ID: privateValue,
        APPLE_TEAM_ID: "team",
      }),
    (error) => {
      assert.match(error.message, /APPLE_APP_PWD/);
      assert.match(error.message, /MACOS_SIGNING_IDENTITY/);
      assert.doesNotMatch(error.message, new RegExp(privateValue));
      return true;
    },
  );
});

test("release tag must match the package version", () => {
  assert.doesNotThrow(() => assertReleaseTag("", "0.2.13"));
  assert.doesNotThrow(() => assertReleaseTag("v0.2.13", "0.2.13"));
  assert.throws(
    () => assertReleaseTag("v0.2.12", "0.2.13"),
    /does not match package version v0\.2\.13/,
  );
});

test("artifact paths use the ARM64 release naming contract", () => {
  const artifacts = getArtifactPaths("/repo", "0.2.13");
  assert.equal(
    artifacts.dmg,
    path.join("/repo", "release", "Codex-Themes-0.2.13-mac-arm64.dmg"),
  );
  assert.equal(
    artifacts.zipBlockmap,
    path.join("/repo", "release", "Codex-Themes-0.2.13-mac-arm64.zip.blockmap"),
  );
  assert.equal(artifacts.updateMetadata, path.join("/repo", "release", "latest-mac.yml"));
});

test("DMG metadata refresh preserves the ZIP entry", () => {
  const input = `version: 0.2.13
files:
  - url: Codex-Themes-0.2.13-mac-arm64.zip
    sha512: zip-hash
    size: 100
  - url: Codex-Themes-0.2.13-mac-arm64.dmg
    sha512: old-dmg-hash
    size: 200
path: Codex-Themes-0.2.13-mac-arm64.zip
sha512: zip-hash
`;
  const output = updateDmgMetadata(
    input,
    "Codex-Themes-0.2.13-mac-arm64.dmg",
    "new-dmg-hash",
    300,
  );
  assert.deepEqual(
    readUpdateEntry(output, "Codex-Themes-0.2.13-mac-arm64.zip"),
    { sha512: "zip-hash", size: 100 },
  );
  assert.deepEqual(
    readUpdateEntry(output, "Codex-Themes-0.2.13-mac-arm64.dmg"),
    { sha512: "new-dmg-hash", size: 300 },
  );
});

test("artifact validation rejects a missing release file", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-themes-arm64-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const artifacts = getArtifactPaths(root, "0.2.13");
  fs.mkdirSync(artifacts.releaseDir);
  for (const file of [
    artifacts.dmg,
    artifacts.dmgBlockmap,
    artifacts.zip,
    artifacts.zipBlockmap,
    artifacts.updateMetadata,
  ]) {
    fs.writeFileSync(file, "fixture");
  }
  assert.doesNotThrow(() => assertArtifactsExist(artifacts));
  fs.unlinkSync(artifacts.dmgBlockmap);
  assert.throws(() => assertArtifactsExist(artifacts), /dmg\.blockmap/);
});
