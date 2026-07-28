import assert from "node:assert/strict";
import test from "node:test";
import { getUpdatePlatformInfo } from "./updater-platform";

test("macOS manual downloads follow the running architecture", () => {
  assert.deepEqual(getUpdatePlatformInfo("darwin", "arm64"), {
    platform: "mac",
    packageLabel: "DMG",
    manualDownloadUrl:
      "https://theme.codexguide.ai/api/v1/downloads/latest?platform=mac&arch=arm64&format=dmg",
  });
  assert.match(getUpdatePlatformInfo("darwin", "x64").manualDownloadUrl, /arch=x64/);
});

test("Windows manual downloads use the x64 preview installer", () => {
  assert.deepEqual(getUpdatePlatformInfo("win32", "x64"), {
    platform: "win",
    packageLabel: "EXE",
    manualDownloadUrl:
      "https://theme.codexguide.ai/api/v1/downloads/latest?platform=win&arch=x64&format=exe",
  });
});

test("unsupported systems fall back to the releases page", () => {
  const info = getUpdatePlatformInfo("linux", "x64");
  assert.equal(info.platform, "unsupported");
  assert.equal(info.packageLabel, "安装包");
  assert.match(info.manualDownloadUrl, /releases\/latest$/);
});
