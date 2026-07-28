import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertWindowsArtifactsExist,
  assertWindowsPackagingEnvironment,
  getWindowsArtifactPaths,
  parseWindowsArch,
  verifyWindowsUpdateMetadata,
} from "./package-windows.mjs";
import { sha512File } from "./package-macos.mjs";

test("Windows target parsing and runner validation accept x64 only", () => {
  assert.equal(parseWindowsArch(["--arch", "x64"]), "x64");
  assert.throws(() => parseWindowsArch(["--arch", "arm64"]), /requires --arch x64/);
  assert.doesNotThrow(() => assertWindowsPackagingEnvironment("x64", "win32", "x64"));
  assert.throws(
    () => assertWindowsPackagingEnvironment("x64", "darwin", "x64"),
    /received darwin\/x64/,
  );
  assert.throws(
    () => assertWindowsPackagingEnvironment("x64", "win32", "arm64"),
    /received win32\/arm64/,
  );
});

test("Windows artifact validation and metadata cover the NSIS installer", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-themes-win-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const artifacts = getWindowsArtifactPaths(root, "0.2.14");
  fs.mkdirSync(artifacts.releaseDir);
  fs.writeFileSync(artifacts.installer, "installer");
  fs.writeFileSync(artifacts.installerBlockmap, "blockmap");
  const metadata = `version: 0.2.14
files:
  - url: Codex-Themes-0.2.14-win-x64.exe
    sha512: ${sha512File(artifacts.installer)}
    size: ${fs.statSync(artifacts.installer).size}
path: Codex-Themes-0.2.14-win-x64.exe
sha512: ${sha512File(artifacts.installer)}
`;
  fs.writeFileSync(artifacts.updateMetadata, metadata);

  assert.doesNotThrow(() => assertWindowsArtifactsExist(artifacts));
  assert.doesNotThrow(() => verifyWindowsUpdateMetadata(metadata, artifacts));
  assert.throws(
    () => verifyWindowsUpdateMetadata(metadata.replace("size: 9", "size: 99"), artifacts),
    /does not match/,
  );
  fs.unlinkSync(artifacts.installerBlockmap);
  assert.throws(() => assertWindowsArtifactsExist(artifacts), /exe\.blockmap/);
});
