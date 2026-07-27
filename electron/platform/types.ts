/**
 * [INPUT]: 依赖统一 AppPaths，不依赖任何平台实现细节
 * [OUTPUT]: 提供桌面 Adapter、Codex 安装身份、监听端点与启动停止结果契约
 * [POS]: electron/platform 的依赖倒置边界，控制器只通过这些窄接口协作
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { AppPaths } from "../paths";

export type DesktopPlatformId = "macos" | "windows";

export interface CodexPackageLaunchIdentity {
  packageFamilyName: string;
  applicationId: string;
  aumid: string;
}

export interface CodexInstall {
  displayIdentity: string;
  executablePath: string;
  version: string;
  packageLaunchIdentity?: CodexPackageLaunchIdentity;
}

export interface CodexPlatformMetadata {
  os: DesktopPlatformId;
  displayLabel: string;
  desktopInstallHint: string;
  manualUpdatePackageLabel: string;
}

export interface CodexPlatformAdapter {
  readonly metadata: CodexPlatformMetadata;
  discover(configuredPath?: string): Promise<CodexInstall | null>;
  isRunning(install: CodexInstall): Promise<boolean>;
  stop(install: CodexInstall, options: { force: boolean }): Promise<void>;
  verifyCdpEndpoint(port: number, install: CodexInstall): Promise<boolean>;
  selectAvailablePort(preferredPort: number): Promise<number>;
  launchWithCdp(install: CodexInstall, port: number): Promise<void>;
  waitForCdp(port: number, install: CodexInstall, timeoutMs?: number): Promise<void>;
  openCodexMode(install: CodexInstall): Promise<void>;
  launchNormally(install: CodexInstall): Promise<void>;
}

export type CodexPlatformAdapterFactory = (paths: AppPaths) => CodexPlatformAdapter;
