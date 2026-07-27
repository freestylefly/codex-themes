/**
 * [INPUT]: 依赖可替换 CodexPlatformAdapter、临时 ThemeStore 与 SettingsStore
 * [OUTPUT]: 验证控制器的平台身份传递、初始化单飞、周期单飞与调试启动事务回滚
 * [POS]: electron 顶层业务编排的跨平台回归测试，不启动真实桌面应用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ThemeController } from "./controller";
import type { AppPaths } from "./paths";
import { assertSupportedWindowsHost, type CodexInstall, type CodexPlatformAdapter } from "./platform";
import { SettingsStore } from "./settings";
import { ThemeStore } from "./themes/store";

const install: CodexInstall = {
  displayIdentity: "verified-install",
  executablePath: "verified-executable",
  version: "1.2.3",
};

test("Windows support gate accepts only Win11 native x64", () => {
  assert.doesNotThrow(() => assertSupportedWindowsHost("10.0.22631", "x86_64", "x64"));
  assert.throws(() => assertSupportedWindowsHost("10.0.19045", "x86_64", "x64"), /Windows 11 x64/);
  assert.throws(() => assertSupportedWindowsHost("10.0.22631", "arm64", "x64"), /ARM64/);
});

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-themes-platform-"));
  const paths: AppPaths = {
    assetsRoot: path.resolve("assets"),
    injectDir: path.resolve("assets/inject"),
    presetsRoot: path.resolve("assets/presets"),
    trayIconPath: path.resolve("assets/tray/iconTemplate.png"),
    skillsRoot: path.resolve("assets/skills/generate-codex-theme"),
    windowsHelperPath: path.resolve("assets/windows/codex-activator.exe"),
    userDataRoot: root,
    userThemesRoot: path.join(root, "themes"),
    purchasedThemesRoot: path.join(root, "purchased-themes"),
    aiJobsRoot: path.join(root, "ai-jobs"),
    downloadsDir: path.join(root, "downloads"),
    settingsFile: path.join(root, "settings.json"),
    stateFile: path.join(root, "state.json"),
    configBackupFile: path.join(root, "config-backup.json"),
    codexConfigPath: path.join(root, "config.toml"),
  };
  const calls: string[] = [];
  const adapter: CodexPlatformAdapter = {
    metadata: {
      os: "windows",
      displayLabel: "Windows 11",
      desktopInstallHint: "Install verified Codex",
      manualUpdatePackageLabel: "Windows installer",
    },
    async discover() {
      calls.push("discover");
      return install;
    },
    async isRunning(received) {
      assert.strictEqual(received, install);
      calls.push("isRunning");
      return true;
    },
    async stop(received) {
      assert.strictEqual(received, install);
      calls.push("stop");
    },
    async verifyCdpEndpoint(_port, received) {
      assert.strictEqual(received, install);
      calls.push("verifyCdpEndpoint");
      return false;
    },
    async selectAvailablePort() {
      calls.push("selectAvailablePort");
      return 9222;
    },
    async launchWithCdp(received) {
      assert.strictEqual(received, install);
      calls.push("launchWithCdp");
    },
    async waitForCdp(_port, received) {
      assert.strictEqual(received, install);
      calls.push("waitForCdp");
    },
    async openCodexMode(received) {
      assert.strictEqual(received, install);
      calls.push("openCodexMode");
    },
    async launchNormally(received) {
      assert.strictEqual(received, install);
      calls.push("launchNormally");
    },
  };
  const store = new ThemeStore({
    presetsRoot: paths.presetsRoot,
    userThemesRoot: paths.userThemesRoot,
    purchasedThemesRoot: paths.purchasedThemesRoot,
  });
  const settings = new SettingsStore(paths.settingsFile);
  const controller = new ThemeController(paths, store, settings, adapter);
  return { adapter, calls, controller, root };
}

test("controller exposes adapter metadata and passes the full install identity", async (t) => {
  const fixture = await createFixture();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));

  const state = await fixture.controller.refreshStatus();
  assert.deepEqual(state.platform, fixture.adapter.metadata);
  assert.equal(state.codexDesktop.bundlePath, install.displayIdentity);
  assert.equal(state.codexDesktop.version, install.version);
  assert.equal(state.codexDesktop.running, true);
  assert.deepEqual(fixture.calls, ["discover", "isRunning"]);

  const result = await fixture.controller.applyTheme("cream-sage");
  assert.equal(result.needsRestart, true);
  assert.equal(result.restarted, false);
  assert.equal(fixture.calls.includes("stop"), false);
  assert.equal(fixture.calls.includes("launchWithCdp"), false);

  assert.deepEqual(await fixture.controller.openCodex(), { ok: true });
  assert.equal(fixture.calls.at(-1), "launchNormally");
});

test("controller initialization shares one platform discovery across concurrent callers", async (t) => {
  const fixture = await createFixture();
  t.after(async () => {
    await fixture.controller.shutdown({ cleanup: false });
    await fs.rm(fixture.root, { recursive: true, force: true });
  });

  await Promise.all([
    fixture.controller.init(),
    fixture.controller.init(),
    fixture.controller.init(),
  ]);

  assert.deepEqual(fixture.calls, ["discover", "isRunning"]);
  assert.equal(fixture.controller.getState().codexDesktop.installed, true);
});

test("controller skips overlapping periodic ticks", async (t) => {
  const fixture = await createFixture();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));

  let releaseDiscovery!: () => void;
  const gate = new Promise<void>((resolve) => { releaseDiscovery = resolve; });
  fixture.adapter.discover = async () => {
    fixture.calls.push("discover-blocked");
    await gate;
    return install;
  };

  const first = fixture.controller.tick();
  const second = fixture.controller.tick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(fixture.calls, ["discover-blocked"]);
  releaseDiscovery();
  await Promise.all([first, second]);
  assert.equal(fixture.calls.filter((call) => call === "discover-blocked").length, 1);
});

test("failed debug startup relaunches ordinary Codex", async (t) => {
  const fixture = await createFixture();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  fixture.adapter.waitForCdp = async () => {
    fixture.calls.push("waitForCdp-failed");
    throw new Error("debug endpoint unavailable");
  };

  const result = await fixture.controller.applyTheme("cream-sage", { confirmRestart: true });
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /debug endpoint unavailable/);
  assert.deepEqual(
    fixture.calls.filter((call) => ["launchWithCdp", "waitForCdp-failed", "stop", "launchNormally"].includes(call)),
    ["stop", "launchWithCdp", "waitForCdp-failed", "stop", "launchNormally"],
  );
  assert.match(result.notes.join(" "), /未保留调试端口/);
});
