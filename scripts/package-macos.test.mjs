import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertArtifactsExist,
  assertMacPackagingEnvironment,
  assertReleaseTag,
  assertRequiredEnv,
  getMacArtifactPaths,
  parseMacArch,
  readUpdateEntry,
  updateArtifactMetadata,
} from "./package-macos.mjs";

test("macOS target parsing accepts the two supported architectures", () => {
  assert.equal(parseMacArch(["--arch", "arm64"]), "arm64");
  assert.equal(parseMacArch(["--arch", "x64"]), "x64");
  assert.throws(() => parseMacArch([]), /--arch arm64 or --arch x64/);
});

test("macOS environment validation requires a native matching runner", () => {
  assert.doesNotThrow(() => assertMacPackagingEnvironment("arm64", "darwin", "arm64"));
  assert.doesNotThrow(() => assertMacPackagingEnvironment("x64", "darwin", "x64"));
  assert.throws(
    () => assertMacPackagingEnvironment("x64", "darwin", "arm64"),
    /requires darwin\/x64/,
  );
  assert.throws(
    () => assertMacPackagingEnvironment("arm64", "linux", "arm64"),
    /received linux\/arm64/,
  );
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
  assert.doesNotThrow(() => assertReleaseTag("", "0.2.14"));
  assert.doesNotThrow(() => assertReleaseTag("v0.2.14", "0.2.14"));
  assert.throws(
    () => assertReleaseTag("v0.2.13", "0.2.14"),
    /does not match package version v0\.2\.14/,
  );
});

test("macOS artifact paths include the selected architecture", () => {
  const artifacts = getMacArtifactPaths("/repo", "0.2.14", "x64");
  assert.equal(
    artifacts.dmg,
    path.join("/repo", "release", "Codex-Themes-0.2.14-mac-x64.dmg"),
  );
  assert.equal(
    artifacts.zipBlockmap,
    path.join("/repo", "release", "Codex-Themes-0.2.14-mac-x64.zip.blockmap"),
  );
  assert.equal(
    artifacts.updateMetadata,
    path.join("/repo", "release", "latest-mac-x64.yml"),
  );
});

test("DMG metadata refresh preserves the ZIP entry", () => {
  const input = `version: 0.2.14
files:
  - url: Codex-Themes-0.2.14-mac-arm64.zip
    sha512: zip-hash
    size: 100
  - url: Codex-Themes-0.2.14-mac-arm64.dmg
    sha512: old-dmg-hash
    size: 200
path: Codex-Themes-0.2.14-mac-arm64.zip
sha512: zip-hash
`;
  const output = updateArtifactMetadata(
    input,
    "Codex-Themes-0.2.14-mac-arm64.dmg",
    "new-dmg-hash",
    300,
  );
  assert.deepEqual(
    readUpdateEntry(output, "Codex-Themes-0.2.14-mac-arm64.zip"),
    { sha512: "zip-hash", size: 100 },
  );
  assert.deepEqual(
    readUpdateEntry(output, "Codex-Themes-0.2.14-mac-arm64.dmg"),
    { sha512: "new-dmg-hash", size: 300 },
  );
});

test("artifact validation rejects a missing release file", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-themes-mac-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const artifacts = getMacArtifactPaths(root, "0.2.14", "arm64");
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
