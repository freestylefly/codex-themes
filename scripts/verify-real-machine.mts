/**
 * Real-machine smoke test for the M1 core loop (DESIGN §11.2/§11.3):
 *   discover Codex → restart with CDP (consent assumed by running this) →
 *   apply the aurora-reef preset → soft DOM verify → screenshot →
 *   restore official → verify removal → relaunch Codex normally.
 *
 * It drives the production ThemeController against the live Codex app, so
 * Codex will quit and relaunch twice. Any leftover Codex-Dream-Skin watch
 * daemon is paused for the run and restarted afterwards, leaving the
 * machine exactly as it was found.
 *
 * Run via: npm run verify:machine
 */

import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ThemeController } from "../electron/controller";
import { ThemeStore } from "../electron/themes/store";
import { connectCodexTargets } from "../electron/engine/cdp";
import { captureScreenshot, verifyRemovedSession } from "../electron/engine/verify";
import type { AppPaths } from "../electron/paths";

const repoRoot = process.cwd();
const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-themes-verify-"));
const screenshotPath = path.join(repoRoot, "tmp", "codex-verify", "applied.png");

function step(message: string) {
  console.log(`\n=== ${message}`);
}

function findLegacyInjectors(): { pid: number; args: string[] }[] {
  try {
    const out = execSync("ps -eo pid,command", { encoding: "utf8" });
    return out
      .split("\n")
      .filter((line) => line.includes("injector.mjs") && line.includes("--watch"))
      .map((line) => {
        const trimmed = line.trim();
        const pid = Number.parseInt(trimmed.split(/\s+/, 1)[0], 10);
        const command = trimmed.slice(trimmed.indexOf(" ") + 1);
        // Split on spaces but keep quoted segments together.
        const args = command.match(/"[^"]*"|\S+/g)?.map((a) => a.replace(/^"|"$/g, "")) ?? [];
        return { pid, args };
      })
      .filter((entry) => Number.isInteger(entry.pid) && entry.args.length > 1);
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const failures: string[] = [];

  // 0) Pause any legacy dream-skin watch daemon so it cannot fight our
  //    injection on the same port. Restarted in the finally block.
  const legacy = findLegacyInjectors();
  for (const entry of legacy) {
    try {
      process.kill(entry.pid);
      console.log(`paused legacy injector pid=${entry.pid}`);
    } catch {
      console.log(`legacy injector pid=${entry.pid} already gone`);
    }
  }

  const paths: AppPaths = {
    assetsRoot: path.join(repoRoot, "assets"),
    injectDir: path.join(repoRoot, "assets", "inject"),
    presetsRoot: path.join(repoRoot, "assets", "presets"),
    trayIconPath: path.join(repoRoot, "assets", "tray", "iconTemplate.png"),
    userDataRoot: workRoot,
    userThemesRoot: path.join(workRoot, "themes"),
    downloadsDir: path.join(workRoot, "downloads"),
    settingsFile: path.join(workRoot, "settings.json"),
    stateFile: path.join(workRoot, "state.json"),
    configBackupFile: path.join(workRoot, "config-backup.json"),
    codexConfigPath: path.join(os.homedir(), ".codex", "config.toml"),
  };

  const store = new ThemeStore({
    presetsRoot: paths.presetsRoot,
    userThemesRoot: paths.userThemesRoot,
  });
  const controller = new ThemeController(paths, store);
  controller.on("log", (line) => console.log(`[${line.level}] ${line.message}`));

  let codexTouched = false;
  try {
    step("1/5 初始化:发现 Codex 安装与运行状态");
    await controller.init();
    const status = controller.getState();
    console.log(JSON.stringify(status.codex, null, 2));
    if (!status.codex.installed) {
      throw new Error("未找到 Codex 桌面端,无法继续真机验证。");
    }

    step("2/5 应用预设主题 cream-sage(授权重启 Codex 并开启调试端口)");
    codexTouched = true;
    const applied = await controller.applyTheme("cream-sage", { confirmRestart: true });
    console.log(JSON.stringify(applied, null, 2));
    if (!applied.ok) failures.push(`应用失败: ${applied.error ?? "unknown"}`);
    if (applied.status === "partial") {
      console.log(`note: 软验证部分通过 — ${applied.notes.join(" / ")}`);
    }

    const port = controller.getState().codex.cdpPort;
    if (applied.ok && port) {
      step("3/5 连接会话并截图取证");
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const connected = await connectCodexTargets(port, 10_000);
      if (connected.length === 0) {
        failures.push("截图:没有可连接的 Codex page 目标");
      } else {
        await captureScreenshot(connected[0].session, screenshotPath);
        console.log(`screenshot saved: ${screenshotPath}`);
        for (const { session } of connected) session.close();
      }
    }

    step("4/5 还原官方外观");
    const restored = await controller.restoreOfficial();
    console.log(JSON.stringify(restored));
    if (!restored.ok) failures.push(`还原失败: ${restored.error ?? "unknown"}`);

    if (restored.ok && port) {
      step("5/5 验证注入内容已完全移除");
      const connected = await connectCodexTargets(port, 10_000);
      let cleanCount = 0;
      for (const { session } of connected) {
        if (await verifyRemovedSession(session)) cleanCount += 1;
        session.close();
      }
      console.log(`clean sessions: ${cleanCount}/${connected.length}`);
      if (connected.length === 0 || cleanCount < connected.length) {
        failures.push(`移除验证未全部通过 (${cleanCount}/${connected.length})`);
      }
    }
  } catch (error) {
    failures.push((error as Error).message);
  } finally {
    await controller.shutdown({ cleanup: false }).catch(() => {});

    if (codexTouched) {
      step("收尾:将 Codex 以正常模式(无调试端口)重新启动");
      try {
        const { discoverCodexApp, launchCodexNormally, stopCodex } = await import(
          "../electron/platform/codex-macos"
        );
        const install = await discoverCodexApp();
        if (install) {
          await stopCodex(install.executable, { force: true });
          await launchCodexNormally(install.bundle);
          console.log("Codex 已恢复正常模式。");
        }
      } catch (error) {
        console.log(`恢复 Codex 正常模式失败,请手动重启 Codex: ${(error as Error).message}`);
      }
    }

    for (const entry of legacy) {
      try {
        const [nodeBin, ...rest] = entry.args;
        const child = spawn(nodeBin, rest, { detached: true, stdio: "ignore" });
        child.unref();
        console.log(`restarted legacy injector (pid was ${entry.pid})`);
      } catch {
        console.log("legacy injector 未能恢复,如仍在使用旧工具请手动重启。");
      }
    }

    fs.rmSync(workRoot, { recursive: true, force: true });
  }

  console.log("\n==================================================");
  if (failures.length === 0) {
    console.log("RESULT: PASS — 应用→验证→截图→还原→移除校验 全部通过");
  } else {
    console.log(`RESULT: FAIL — ${failures.join("; ")}`);
    process.exitCode = 1;
  }
}

await main();
