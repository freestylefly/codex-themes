/**
 * [INPUT]: 依赖临时文件系统、CLI locator 与纯命令规格生成器
 * [OUTPUT]: 验证平台优先级、Store CLI 排除、exe/cmd 白名单和 Windows cmd 包装
 * [POS]: electron/codex-cli 的发现与启动信任边界测试
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { codexCliPathSupported, locateCodexCli } from "./locator";
import { codexCliCommand } from "./runner";

const temporaryRoots: string[] = [];

async function fakeCli(filePath: string): Promise<string> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.copyFile(process.execPath, filePath);
  return filePath;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-cli-locator-"));
  temporaryRoots.push(root);
  return root;
}

describe("locateCodexCli", () => {
  it("uses the CLI bundled with the official desktop app on macOS", async () => {
    const root = await temporaryRoot();
    const bundle = path.join(root, "ChatGPT.app");
    const bundled = await fakeCli(path.join(bundle, "Contents", "Resources", "codex"));

    const located = await locateCodexCli(null, {
      platform: "darwin",
      desktopBundlePath: bundle,
      commonPaths: [],
      envPath: "",
      readVersion: async () => "0.146.0",
    });

    assert.deepEqual(located, { executablePath: bundled, version: "0.146.0" });
  });

  it("keeps an explicit user-selected CLI as the highest priority", async () => {
    const root = await temporaryRoot();
    const selected = await fakeCli(path.join(root, "selected", process.platform === "win32" ? "codex.exe" : "codex"));
    const bundle = path.join(root, "ChatGPT.app");
    await fakeCli(path.join(bundle, "Contents", "Resources", "codex"));

    const located = await locateCodexCli(selected, {
      platform: process.platform,
      desktopBundlePath: bundle,
      commonPaths: [],
      envPath: "",
      readVersion: async () => "0.150.0",
    });

    assert.deepEqual(located, { executablePath: selected, version: "0.150.0" });
  });

  it("finds a standalone CLI when no desktop bundle is available", async () => {
    const root = await temporaryRoot();
    const standalone = await fakeCli(path.join(root, "bin", process.platform === "win32" ? "codex.exe" : "codex"));

    const located = await locateCodexCli(null, {
      platform: process.platform,
      desktopBundlePath: null,
      commonPaths: [standalone],
      envPath: "",
      readVersion: async () => "0.144.5",
    });

    assert.deepEqual(located, { executablePath: standalone, version: "0.144.5" });
  });

  it("never selects the Store package resource on Windows and finds the Bun CLI", async () => {
    const root = await temporaryRoot();
    const storeBundle = path.join(root, "WindowsApps", "OpenAI.Codex_1.0.0.0_x64__2p2nqsd0c76g0");
    const bundled = await fakeCli(path.join(storeBundle, "resources", "codex.exe"));
    const standalone = await fakeCli(path.join(root, ".bun", "bin", "codex.exe"));

    const located = await locateCodexCli(null, {
      platform: "win32",
      desktopBundlePath: storeBundle,
      home: root,
      commonPaths: [standalone, bundled],
      envPath: "",
      readVersion: async () => "0.144.1",
    });

    assert.deepEqual(located, { executablePath: standalone, version: "0.144.1" });
    assert.notEqual(located?.executablePath, bundled);
  });

  it("checks Windows PATH entries using PATHEXT", async () => {
    const root = await temporaryRoot();
    const pathCli = await fakeCli(path.join(root, "path-bin", "codex.exe"));

    const located = await locateCodexCli(null, {
      platform: "win32",
      desktopBundlePath: null,
      commonPaths: [],
      envPath: path.win32.dirname(pathCli),
      pathExt: ".EXE;.CMD",
      readVersion: async () => "0.144.1",
    });

    assert.deepEqual(located, { executablePath: pathCli, version: "0.144.1" });
  });

  it("accepts exe/cmd and rejects bat on Windows", () => {
    assert.equal(codexCliPathSupported("C:\\bin\\codex.exe", "win32"), true);
    assert.equal(codexCliPathSupported("C:\\bin\\codex.cmd", "win32"), true);
    assert.equal(codexCliPathSupported("C:\\bin\\codex.bat", "win32"), false);
  });

  it("wraps npm cmd shims with ComSpec but executes exe directly", () => {
    const shim = codexCliCommand("C:\\Tools\\codex.cmd", ["--version"], "win32");
    assert.match(shim.file.toLowerCase(), /cmd\.exe$/);
    assert.deepEqual(shim.args.slice(0, 3), ["/d", "/s", "/c"]);
    assert.match(shim.args[3] ?? "", /codex\.cmd/);

    assert.deepEqual(
      codexCliCommand("C:\\Tools\\codex.exe", ["--version"], "win32"),
      { file: "C:\\Tools\\codex.exe", args: ["--version"] },
    );
  });
});
