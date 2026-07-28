export type CodexDesktopPlatform = "darwin" | "win32" | "unsupported";

export interface CodexInstall {
  platform: CodexDesktopPlatform;
  installPath: string;
  executable: string;
  version: string;
}

export interface CodexDesktopAdapter {
  platform: CodexDesktopPlatform;
  displayName: string;
  discover(configured?: string | null): Promise<CodexInstall | null>;
  isRunning(install: CodexInstall): Promise<boolean>;
  stop(install: CodexInstall, opts: { force: boolean }): Promise<void>;
  selectAvailablePort(preferred: number): Promise<number>;
  verifiedCdpEndpoint(port: number, install: CodexInstall): Promise<boolean>;
  waitForCdp(port: number, install: CodexInstall, timeoutMs?: number): Promise<void>;
  launchWithCdp(install: CodexInstall, port: number): Promise<void>;
  openCodexMode(): Promise<void>;
  launchNormally(install: CodexInstall): Promise<void>;
}
