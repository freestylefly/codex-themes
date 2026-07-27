/**
 * [INPUT]: 依赖 DesktopPlatformId 与官网统一下载 API
 * [OUTPUT]: 提供平台更新格式、下载地址和手动回退文案
 * [POS]: electron/updater 的纯平台映射，隔离 Windows/macOS 制品差异
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { DesktopPlatformId } from "./platform/types";

export type ManualDownloadFormat = "dmg" | "exe";

export interface UpdaterPlatformInfo {
  platform: DesktopPlatformId;
  packageLabel: string;
  format: ManualDownloadFormat;
}

export function updaterPlatformInfo(platform: DesktopPlatformId): UpdaterPlatformInfo {
  return platform === "windows"
    ? { platform, packageLabel: "Windows installer", format: "exe" }
    : { platform, packageLabel: "DMG", format: "dmg" };
}

export function manualDownloadUrl(platform: DesktopPlatformId): string {
  return `https://theme.codexguide.ai/api/v1/downloads/latest?format=${updaterPlatformInfo(platform).format}`;
}

export function manualDownloadCopy(platform: DesktopPlatformId): string {
  return platform === "windows" ? "Windows 安装包" : "DMG 安装包";
}
