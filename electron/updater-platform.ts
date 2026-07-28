export interface UpdatePlatformInfo {
  platform: "mac" | "win" | "unsupported";
  packageLabel: "DMG" | "EXE" | "安装包";
  manualDownloadUrl: string;
}

const DOWNLOAD_ENDPOINT = "https://theme.codexguide.ai/api/v1/downloads/latest";
const RELEASES_URL = "https://github.com/freestylefly/codex-themes/releases/latest";

export function getUpdatePlatformInfo(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): UpdatePlatformInfo {
  if (platform === "darwin") {
    const targetArch = arch === "x64" ? "x64" : "arm64";
    return {
      platform: "mac",
      packageLabel: "DMG",
      manualDownloadUrl:
        `${DOWNLOAD_ENDPOINT}?platform=mac&arch=${targetArch}&format=dmg`,
    };
  }
  if (platform === "win32") {
    return {
      platform: "win",
      packageLabel: "EXE",
      manualDownloadUrl:
        `${DOWNLOAD_ENDPOINT}?platform=win&arch=x64&format=exe`,
    };
  }
  return {
    platform: "unsupported",
    packageLabel: "安装包",
    manualDownloadUrl: RELEASES_URL,
  };
}
