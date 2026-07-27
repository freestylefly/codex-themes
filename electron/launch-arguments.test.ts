/**
 * [INPUT]: 依赖 launch-arguments 分类器与跨平台路径规则
 * [OUTPUT]: 验证文件、协议参数、引号处理、白名单和去重行为
 * [POS]: Electron 启动参数信任边界的回归测试
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { classifyLaunchArgument, classifyLaunchArguments } from "./launch-arguments";

describe("desktop launch arguments", () => {
  it("classifies absolute theme files with Windows quote wrapping", () => {
    const filePath = path.resolve("fixtures", "night.codextheme");
    assert.deepEqual(classifyLaunchArgument(`\"${filePath}\"`), {
      type: "theme-file",
      filePath,
    });
  });

  it("classifies the allow-listed protocol actions", () => {
    assert.equal(classifyLaunchArgument("codexthemes://auth/callback?code=ok")?.type, "auth");
    assert.equal(
      classifyLaunchArgument("codexthemes://payment/result?orderId=ord-1")?.type,
      "payment",
    );
    assert.equal(
      classifyLaunchArgument("codexthemes://theme/blue-window-messenger")?.type,
      "theme-link",
    );
  });

  it("ignores executable switches, relative files, and unsupported links", () => {
    assert.equal(classifyLaunchArgument("--inspect=9229"), null);
    assert.equal(classifyLaunchArgument("night.codextheme"), null);
    assert.equal(classifyLaunchArgument("codexthemes://create/settings"), null);
  });

  it("deduplicates repeated cold and warm launch arguments", () => {
    const raw = "codexthemes://create/ai";
    assert.deepEqual(classifyLaunchArguments(["Codex Themes.exe", raw, raw]), [
      {
        type: "theme-link",
        rawUrl: raw,
        action: { type: "open-workspace", workspace: "ai-studio" },
      },
    ]);
  });
});
