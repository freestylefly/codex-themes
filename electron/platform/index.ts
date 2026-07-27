/**
 * [INPUT]: 依赖 Node 平台/系统信息、AppPaths 与 macOS/Windows Codex Adapter
 * [OUTPUT]: 对外提供平台 Adapter 工厂、平台元数据和桌面宿主支持校验
 * [POS]: electron/platform 的唯一组合入口，阻止调用方感知具体平台实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import os from "node:os";
import type { AppPaths } from "../paths";
import {
  codexIsRunning,
  discoverCodexApp,
  launchCodexNormally,
  launchCodexWithCdp,
  openCodexMode,
  selectAvailablePort,
  stopCodex,
  verifiedCdpEndpoint,
  waitForCdp,
} from "./codex-macos";
import { createWindowsCodexPlatformAdapter } from "./codex-windows";
import type { CodexInstall, CodexPlatformAdapter } from "./types";

export type {
  CodexInstall,
  CodexPackageLaunchIdentity,
  CodexPlatformAdapter,
  CodexPlatformMetadata,
  DesktopPlatformId,
} from "./types";

function createMacosAdapter(): CodexPlatformAdapter {
  return {
    metadata: {
      os: "macos",
      displayLabel: "macOS",
      desktopInstallHint: "请安装包含 Codex 的官方 ChatGPT.app。",
      manualUpdatePackageLabel: "DMG",
    },
    async discover(configuredPath) {
      const install = await discoverCodexApp(configuredPath);
      if (!install) return null;
      return {
        displayIdentity: install.bundle,
        executablePath: install.executable,
        version: install.version,
      };
    },
    isRunning: (install) => codexIsRunning(install.executablePath),
    stop: (install, options) => stopCodex(install.executablePath, options),
    verifyCdpEndpoint: (port, install) => verifiedCdpEndpoint(port, install.executablePath),
    selectAvailablePort,
    async launchWithCdp(install, port) {
      await launchCodexWithCdp(
        {
          bundle: install.displayIdentity,
          executable: install.executablePath,
          version: install.version,
        },
        port,
      );
    },
    waitForCdp: (port, install, timeoutMs) => waitForCdp(port, install.executablePath, timeoutMs),
    openCodexMode: () => openCodexMode(),
    launchNormally: (install) => launchCodexNormally(install.displayIdentity),
  };
}

export function createCodexPlatformAdapter(paths: AppPaths): CodexPlatformAdapter {
  if (process.platform === "darwin") return createMacosAdapter();
  if (process.platform === "win32") {
    assertSupportedWindowsHost(os.release(), os.machine(), process.arch);
    return createWindowsCodexPlatformAdapter(paths);
  }
  throw new Error(`Codex Themes does not support desktop platform ${process.platform}.`);
}

export function assertSupportedWindowsHost(
  release: string,
  machine: string,
  processArch: string,
): void {
  const build = Number(release.split(".")[2]);
  if (!Number.isInteger(build) || build < 22_000) {
    throw new Error("Codex Themes 仅支持 Windows 11 x64（系统内部版本 22000 或更高）。");
  }
  if (machine.toLowerCase() !== "x86_64" || processArch !== "x64") {
    throw new Error("Codex Themes 仅支持原生 Windows x64，当前不支持 Windows ARM64 或仿真运行。");
  }
}

export function assertSupportedDesktopHost(): void {
  if (process.platform === "darwin") return;
  if (process.platform === "win32") {
    assertSupportedWindowsHost(os.release(), os.machine(), process.arch);
    return;
  }
  throw new Error(`Codex Themes does not support desktop platform ${process.platform}.`);
}

export function platformMetadataFor(platform: NodeJS.Platform): CodexPlatformAdapter["metadata"] {
  if (platform === "darwin") return createMacosAdapter().metadata;
  if (platform === "win32") {
    return {
      os: "windows",
      displayLabel: "Windows 11",
      desktopInstallHint: "请从 Microsoft Store 安装官方 Codex 应用。",
      manualUpdatePackageLabel: "Windows installer",
    };
  }
  throw new Error(`Codex Themes does not support desktop platform ${platform}.`);
}

export function installForMacosAdapter(install: {
  bundle: string;
  executable: string;
  version: string;
}): CodexInstall {
  return {
    displayIdentity: install.bundle,
    executablePath: install.executable,
    version: install.version,
  };
}
