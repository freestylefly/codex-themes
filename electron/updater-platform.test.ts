/**
 * [INPUT]: 依赖 updater-platform 的平台下载映射
 * [OUTPUT]: 验证 Windows 安装器和 macOS DMG 的下载地址与用户文案
 * [POS]: Electron 更新平台分发规则的回归测试
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import { manualDownloadCopy, manualDownloadUrl, updaterPlatformInfo } from "./updater-platform";

test("uses the Windows installer for Windows updates", () => {
  assert.deepEqual(updaterPlatformInfo("windows"), {
    platform: "windows",
    packageLabel: "Windows installer",
    format: "exe",
  });
  assert.equal(manualDownloadUrl("windows"), "https://theme.codexguide.ai/api/v1/downloads/latest?format=exe");
  assert.equal(manualDownloadCopy("windows"), "Windows 安装包");
});

test("keeps the macOS DMG fallback", () => {
  assert.equal(manualDownloadUrl("macos"), "https://theme.codexguide.ai/api/v1/downloads/latest?format=dmg");
  assert.equal(manualDownloadCopy("macos"), "DMG 安装包");
});
