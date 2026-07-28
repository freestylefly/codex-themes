import type { CodexDesktopAdapter } from "./codex-desktop";
import { macosCodexDesktopAdapter } from "./codex-macos";
import { windowsCodexDesktopAdapter } from "./codex-windows";

const unsupportedCodexDesktopAdapter: CodexDesktopAdapter = {
  platform: "unsupported",
  displayName: "Codex 桌面端",
  discover: async () => null,
  isRunning: async () => false,
  stop: async () => {},
  selectAvailablePort: async () => {
    throw new Error("当前系统尚未支持 Codex 桌面端主题应用。");
  },
  verifiedCdpEndpoint: async () => false,
  waitForCdp: async () => {
    throw new Error("当前系统尚未支持 Codex 桌面端主题应用。");
  },
  launchWithCdp: async () => {
    throw new Error("当前系统尚未支持 Codex 桌面端主题应用。");
  },
  openCodexMode: async () => {
    throw new Error("当前系统尚未支持 Codex 桌面端主题应用。");
  },
  launchNormally: async () => {
    throw new Error("当前系统尚未支持 Codex 桌面端主题应用。");
  },
};

export function createCodexDesktopAdapter(
  platform: NodeJS.Platform = process.platform,
): CodexDesktopAdapter {
  if (platform === "darwin") return macosCodexDesktopAdapter;
  if (platform === "win32") return windowsCodexDesktopAdapter;
  return unsupportedCodexDesktopAdapter;
}

export type {
  CodexDesktopAdapter,
  CodexDesktopPlatform,
  CodexInstall,
} from "./codex-desktop";
