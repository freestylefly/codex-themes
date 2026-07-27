/**
 * [INPUT]: 依赖真实 macOS/Windows Codex、平台 Adapter、主题控制器与本机 CDP
 * [OUTPUT]: 执行需明确授权的应用/布局/恢复/普通重启验收并保存截图证据
 * [POS]: scripts 的跨平台破坏性真机门禁，由 npm run verify:machine 显式触发
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ThemeController } from "../electron/controller";
import { detectDesktopAppMode, connectCodexTargets, type CdpSession } from "../electron/engine/cdp";
import {
  captureScreenshot,
  verifyRemovedSession,
  verifySession,
  waitForVerifiedSession,
  type VerifyResult,
} from "../electron/engine/verify";
import type { AppPaths } from "../electron/paths";
import { createCodexPlatformAdapter, type CodexInstall, type CodexPlatformAdapter } from "../electron/platform";
import { SettingsStore } from "../electron/settings";
import { ThemeStore } from "../electron/themes/store";

const repoRoot = process.cwd();
const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-themes-verify-"));
const evidenceRoot = path.join(repoRoot, "tmp", "codex-verify");
const managedAppearanceKeys = ["appearanceTheme", "appearanceDarkCodeThemeId"] as const;
const smokeThemes = fs.readdirSync(path.join(repoRoot, "assets", "presets"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => {
    try {
      const manifest = JSON.parse(fs.readFileSync(
        path.join(repoRoot, "assets", "presets", entry.name, "theme.json"),
        "utf8",
      )) as { id?: unknown; layout?: unknown };
      return typeof manifest.id === "string" && typeof manifest.layout === "string"
        ? [{ id: manifest.id, layout: manifest.layout }]
        : [];
    } catch {
      return [];
    }
  });
const responsiveSizes = [
  { name: "small", width: 680, height: 480 },
  { name: "medium", width: 1120, height: 760 },
  { name: "large", width: 1440, height: 900 },
] as const;

interface LegacyInjector {
  pid: number;
  args: string[];
}

interface LayoutEvidence {
  theme: string | null;
  layout: string | null;
  composerHitInsideComposer: boolean;
  verification: VerifyResult;
}

function step(message: string): void {
  console.log(`\n=== ${message}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function splitCommandLine(command: string): string[] {
  return command.match(/"[^"]*"|\S+/g)?.map((value) => value.replace(/^"|"$/g, "")) ?? [];
}

function findLegacyInjectors(): LegacyInjector[] {
  try {
    if (process.platform === "win32") {
      const script = [
        "$ErrorActionPreference = 'Stop'",
        "$queryPid = $PID",
        "@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $queryPid -and $_.CommandLine -like '*injector.mjs*' -and $_.CommandLine -like '*--watch*' } | Select-Object ProcessId, CommandLine) | ConvertTo-Json -Depth 2 -Compress",
      ].join("\n");
      const output = execFileSync("powershell.exe", [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        script,
      ], { encoding: "utf8" }).trim();
      if (!output) return [];
      const parsed = JSON.parse(output) as Record<string, unknown> | Record<string, unknown>[];
      return (Array.isArray(parsed) ? parsed : [parsed]).flatMap((row) => {
        const pid = Number(row.ProcessId);
        const args = typeof row.CommandLine === "string" ? splitCommandLine(row.CommandLine) : [];
        return Number.isInteger(pid) && pid > 0 && args.length > 1 ? [{ pid, args }] : [];
      });
    }

    const output = execFileSync("ps", ["-eo", "pid=,command="], { encoding: "utf8" });
    return output.split("\n").flatMap((line) => {
      if (!line.includes("injector.mjs") || !line.includes("--watch")) return [];
      const trimmed = line.trim();
      const separator = trimmed.indexOf(" ");
      const pid = Number.parseInt(trimmed.slice(0, separator), 10);
      const args = splitCommandLine(trimmed.slice(separator + 1));
      return Number.isInteger(pid) && pid > 0 && args.length > 1 ? [{ pid, args }] : [];
    });
  } catch {
    return [];
  }
}

function readAppearanceLines(file: string): Record<(typeof managedAppearanceKeys)[number], string | null> {
  let content = "";
  try {
    content = fs.readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const header = /^\[desktop\]\s*\r?\n/m.exec(content);
  const body = header
    ? content.slice(header.index + header[0].length).split(/^\[/m, 1)[0]
    : "";
  return Object.fromEntries(managedAppearanceKeys.map((key) => [
    key,
    new RegExp(`^${key}\\s*=.*$`, "m").exec(body)?.[0] ?? null,
  ])) as Record<(typeof managedAppearanceKeys)[number], string | null>;
}

async function waitForRunning(
  platform: CodexPlatformAdapter,
  install: CodexInstall,
  expected: boolean,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await platform.isRunning(install)) === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Codex did not become ${expected ? "running" : "stopped"} before the deadline.`);
}

function readWindowsDebugArguments(port: number): string[] {
  if (process.platform !== "win32") return [];
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "@(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'ChatGPT.exe' } | Select-Object -ExpandProperty CommandLine) | ConvertTo-Json -Compress",
  ].join("\n");
  const output = execFileSync("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    script,
  ], { encoding: "utf8" }).trim();
  if (!output) return [];
  const parsed = JSON.parse(output) as string | string[];
  return (Array.isArray(parsed) ? parsed : [parsed]).filter((value) =>
    value.includes("--remote-debugging-address=127.0.0.1") &&
    value.includes(`--remote-debugging-port=${port}`),
  );
}

async function readVersionEndpoint(port: number): Promise<Record<string, unknown>> {
  const response = await fetch(`http://127.0.0.1:${port}/json/version`);
  if (!response.ok) throw new Error(`/json/version returned HTTP ${response.status}.`);
  const value = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("/json/version returned an invalid payload.");
  }
  return value as Record<string, unknown>;
}

async function inspectLayout(session: CdpSession): Promise<LayoutEvidence> {
  const verification = await waitForVerifiedSession(session, 15_000);
  const renderer = await session.evaluate<{
    theme: string | null;
    layout: string | null;
    composerHitInsideComposer: boolean;
  }>(`(() => {
    const root = document.documentElement;
    const composer = document.querySelector('.composer-surface-chrome');
    const rect = composer?.getBoundingClientRect();
    const hit = rect
      ? document.elementFromPoint(
          Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2)),
          Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2))
        )
      : null;
    return {
      theme: root.getAttribute('data-dream-theme'),
      layout: root.getAttribute('data-dream-layout'),
      composerHitInsideComposer: Boolean(composer && hit && (composer === hit || composer.contains(hit))),
    };
  })()`);
  return { ...renderer, verification };
}

async function inspectResponsiveLayouts(session: CdpSession): Promise<{
  size: (typeof responsiveSizes)[number]["name"];
  evidence: LayoutEvidence;
}[]> {
  const window = await session.send("Browser.getWindowForTarget") as {
    windowId: number;
    bounds: Record<string, unknown>;
  };
  const results = [];
  try {
    for (const size of responsiveSizes) {
      await session.send("Browser.setWindowBounds", {
        windowId: window.windowId,
        bounds: { width: size.width, height: size.height, windowState: "normal" },
      });
      await new Promise((resolve) => setTimeout(resolve, 350));
      results.push({ size: size.name, evidence: await inspectLayout(session) });
    }
  } finally {
    await session.send("Browser.setWindowBounds", { windowId: window.windowId, bounds: window.bounds }).catch(() => {});
  }
  return results;
}

async function main(): Promise<void> {
  if (process.platform !== "win32" && process.platform !== "darwin") {
    throw new Error(`Real-machine acceptance does not support ${process.platform}.`);
  }
  const platformLabel = process.platform === "win32" ? "Windows" : "macOS";

  const failures: string[] = [];
  const paths: AppPaths = {
    assetsRoot: path.join(repoRoot, "assets"),
    injectDir: path.join(repoRoot, "assets", "inject"),
    presetsRoot: path.join(repoRoot, "assets", "presets"),
    trayIconPath: path.join(repoRoot, "assets", "tray", "iconWindows.png"),
    skillsRoot: path.join(repoRoot, "assets", "skills", "generate-codex-theme"),
    windowsHelperPath: path.join(repoRoot, "assets", "windows", "codex-activator.exe"),
    userDataRoot: workRoot,
    userThemesRoot: path.join(workRoot, "themes"),
    purchasedThemesRoot: path.join(workRoot, "purchased-themes"),
    aiJobsRoot: path.join(workRoot, "ai-jobs"),
    downloadsDir: path.join(workRoot, "downloads"),
    settingsFile: path.join(workRoot, "settings.json"),
    stateFile: path.join(workRoot, "state.json"),
    configBackupFile: path.join(workRoot, "config-backup.json"),
    codexConfigPath: path.join(os.homedir(), ".codex", "config.toml"),
  };
  const platform = createCodexPlatformAdapter(paths);
  const settings = new SettingsStore(paths.settingsFile);
  await settings.load();
  const store = new ThemeStore({
    presetsRoot: paths.presetsRoot,
    userThemesRoot: paths.userThemesRoot,
    purchasedThemesRoot: paths.purchasedThemesRoot,
  });
  const controller = new ThemeController(paths, store, settings, platform);
  controller.on("log", (line) => console.log(`[${line.level}] ${line.message}`));

  const originalAppearance = readAppearanceLines(paths.codexConfigPath);
  const legacy = findLegacyInjectors();
  let install: CodexInstall | null = null;
  let debugPort: number | null = null;
  let codexTouched = false;
  let restored = false;

  for (const entry of legacy) {
    try {
      process.kill(entry.pid);
      console.log(`paused legacy injector pid=${entry.pid}`);
    } catch {
      console.log(`legacy injector pid=${entry.pid} already gone`);
    }
  }

  try {
    step(`1/7 Discover the verified ${platformLabel} Codex identity`);
    install = await platform.discover();
    if (!install || (process.platform === "win32" && !install.packageLaunchIdentity)) {
      throw new Error(`The verified ${platformLabel} Codex installation was not discovered.`);
    }
    console.log(JSON.stringify({
      version: install.version,
      packageFamilyName: install.packageLaunchIdentity?.packageFamilyName ?? null,
      aumid: install.packageLaunchIdentity?.aumid ?? null,
      executablePath: install.executablePath,
    }, null, 2));

    step("2/7 Normalize Codex to a non-debug launch and verify the consent guard");
    codexTouched = true;
    if (await platform.isRunning(install)) await platform.stop(install, { force: true });
    await platform.launchNormally(install);
    await waitForRunning(platform, install, true);
    await controller.init();
    const beforeGuard = await platform.isRunning(install);
    const guarded = await controller.applyTheme(smokeThemes[0].id);
    const afterGuard = await platform.isRunning(install);
    console.log(JSON.stringify({ guarded, beforeGuard, afterGuard }, null, 2));
    if (!beforeGuard || !afterGuard || !guarded.needsRestart || guarded.restarted || guarded.ok) {
      throw new Error("The no-consent apply guard did not preserve the running Codex process.");
    }

    step(`3/7 Apply cream-sage through the approved ${platformLabel} restart`);
    const applied = await controller.applyTheme(smokeThemes[0].id, { confirmRestart: true });
    console.log(JSON.stringify(applied, null, 2));
    if (!applied.ok || !applied.restarted) {
      throw new Error(`cream-sage apply failed: ${applied.error ?? applied.status}`);
    }
    debugPort = controller.getState().codexDesktop.cdpPort;
    if (!debugPort) throw new Error("The controller did not persist the Windows debug port.");
    if (!(await platform.verifyCdpEndpoint(debugPort, install))) {
      throw new Error("The debug listener is not healthy or is not owned by the verified Codex package.");
    }
    const versionEndpoint = await readVersionEndpoint(debugPort);
    const debugArguments = readWindowsDebugArguments(debugPort);
    const mode = await detectDesktopAppMode(debugPort);
    console.log(JSON.stringify({ debugPort, mode, debugArguments, versionEndpoint }, null, 2));
    if (process.platform === "win32" && debugArguments.length === 0) {
      throw new Error("No Codex process contains the requested loopback CDP arguments.");
    }
    if (mode !== "codex") throw new Error(`Expected Codex mode after activation, received ${mode}.`);

    step("4/7 Verify representative layouts, pointer routing, composer, sidebar, and screenshots");
    for (const theme of smokeThemes) {
      if (controller.getState().activeThemeId !== theme.id) {
        const switched = await controller.applyTheme(theme.id, { confirmRestart: true });
        console.log(JSON.stringify({ theme: theme.id, switched }, null, 2));
        if (!switched.ok || switched.restarted) {
          throw new Error(`${theme.id} did not switch on the existing verified listener.`);
        }
      }
      const connected = await connectCodexTargets(debugPort, 15_000);
      if (connected.length === 0) throw new Error(`${theme.id} has no verified Codex renderer session.`);
      try {
        const responsiveEvidence = await inspectResponsiveLayouts(connected[0].session);
        console.log(JSON.stringify({ theme: theme.id, responsiveEvidence }, null, 2));
        for (const { size, evidence } of responsiveEvidence) {
          if (
            evidence.theme !== theme.id ||
            evidence.layout !== theme.layout ||
            !evidence.verification.pass ||
            evidence.verification.chromePointerEvents !== "none" ||
            !evidence.verification.composerInViewport ||
            !evidence.verification.sidebar?.visible ||
            evidence.verification.documentOverflow.x ||
            !evidence.composerHitInsideComposer
          ) {
            throw new Error(`${theme.id} failed its ${size} live DOM/layout invariants.`);
          }
        }
        const screenshotPath = path.join(evidenceRoot, `${theme.id}-${process.platform === "win32" ? "windows" : "macos"}.png`);
        await captureScreenshot(connected[0].session, screenshotPath);
        console.log(`screenshot saved: ${screenshotPath}`);
      } finally {
        for (const { session } of connected) session.close();
      }
    }

    step("5/7 Restore official appearance and verify every renderer is clean");
    const restoreResult = await controller.restoreOfficial();
    console.log(JSON.stringify(restoreResult, null, 2));
    if (!restoreResult.ok) throw new Error(`Restore failed: ${restoreResult.error ?? "unknown"}`);
    restored = true;
    const connected = await connectCodexTargets(debugPort, 10_000);
    try {
      const clean = await Promise.all(connected.map(({ session }) => verifyRemovedSession(session)));
      console.log(JSON.stringify({ cleanSessions: clean.filter(Boolean).length, totalSessions: clean.length }, null, 2));
      if (clean.length === 0 || clean.some((value) => !value)) {
        throw new Error("One or more Codex renderer sessions still contain injected state.");
      }
    } finally {
      for (const { session } of connected) session.close();
    }
    const restoredAppearance = readAppearanceLines(paths.codexConfigPath);
    console.log(JSON.stringify({ originalAppearance, restoredAppearance }, null, 2));
    if (JSON.stringify(restoredAppearance) !== JSON.stringify(originalAppearance)) {
      throw new Error("Managed config.toml appearance keys were not restored exactly.");
    }

    step("6/7 Stop the debug instance and reactivate Codex without a debug listener");
    await platform.stop(install, { force: true });
    await waitForRunning(platform, install, false);
    await platform.launchNormally(install);
    await waitForRunning(platform, install, true);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    if (await platform.verifyCdpEndpoint(debugPort, install)) {
      throw new Error(`Debug listener ${debugPort} remained active after normal AUMID activation.`);
    }

    step(`7/7 ${platformLabel} real-machine acceptance completed`);
  } catch (error) {
    failures.push(errorMessage(error));
  } finally {
    if (!restored) {
      const result = await controller.restoreOfficial().catch((error) => ({ ok: false, error: errorMessage(error) }));
      if (!result.ok) failures.push(`cleanup restore failed: ${result.error ?? "unknown"}`);
    }
    await controller.shutdown({ cleanup: true }).catch((error) => {
      failures.push(`controller shutdown failed: ${errorMessage(error)}`);
    });

    if (codexTouched && install) {
      try {
        if (await platform.isRunning(install)) await platform.stop(install, { force: true });
        await platform.launchNormally(install);
        await waitForRunning(platform, install, true);
        if (debugPort && await platform.verifyCdpEndpoint(debugPort, install)) {
          failures.push(`cleanup left verified debug listener ${debugPort} active`);
        }
      } catch (error) {
        failures.push(`normal Codex relaunch failed: ${errorMessage(error)}`);
      }
    }

    for (const entry of legacy) {
      try {
        const [executable, ...args] = entry.args;
        const child = spawn(executable, args, { detached: true, stdio: "ignore" });
        child.unref();
        console.log(`restarted legacy injector (pid was ${entry.pid})`);
      } catch {
        failures.push(`legacy injector pid=${entry.pid} could not be restarted`);
      }
    }
    fs.rmSync(workRoot, { recursive: true, force: true });
  }

  console.log("\n==================================================");
  if (failures.length === 0) {
    console.log(`RESULT: PASS - ${platformLabel} apply, layout switching, restore, and normal relaunch verified`);
  } else {
    console.log(`RESULT: FAIL - ${failures.join("; ")}`);
    process.exitCode = 1;
  }
}

await main();
