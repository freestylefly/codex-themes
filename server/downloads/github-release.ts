/**
 * [INPUT]: 依赖 GitHub Releases REST 响应与允许的桌面安装包格式
 * [OUTPUT]: 提供最新版官方制品解析、来源校验与下载元数据
 * [POS]: server/downloads 的下载解析核心，拒绝跨仓库和跨标签制品
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export type DownloadFormat = "dmg" | "zip" | "exe";

export interface ReleaseDownload {
  name: string;
  tagName: string;
  url: string;
}

interface GitHubReleaseAsset {
  browser_download_url?: unknown;
  name?: unknown;
}

interface GitHubRelease {
  assets?: unknown;
  tag_name?: unknown;
}

const REPOSITORY = "freestylefly/codex-themes";
const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const RELEASE_DOWNLOAD_PREFIX = `https://github.com/${REPOSITORY}/releases/download/`;

export function parseDownloadFormat(value: string | string[] | undefined): DownloadFormat | null {
  const format = Array.isArray(value) ? value[0] : value;
  return format === "dmg" || format === "zip" || format === "exe" ? format : null;
}

export function selectReleaseDownload(
  payload: unknown,
  format: DownloadFormat,
): ReleaseDownload | null {
  if (!payload || typeof payload !== "object") return null;

  const release = payload as GitHubRelease;
  if (typeof release.tag_name !== "string" || !Array.isArray(release.assets)) return null;

  const version = release.tag_name.startsWith("v")
    ? release.tag_name.slice(1)
    : release.tag_name;
  const platformSuffix = format === "exe" ? "win-x64.exe" : `mac-arm64.${format}`;
  const expectedName = `Codex-Themes-${version}-${platformSuffix}`;
  const assets = release.assets.filter(
    (asset): asset is GitHubReleaseAsset => Boolean(asset && typeof asset === "object"),
  );
  const expectedUrl = `${RELEASE_DOWNLOAD_PREFIX}${release.tag_name}/${expectedName}`;
  const asset = assets.find(
    (candidate) =>
      candidate.name === expectedName &&
      candidate.browser_download_url === expectedUrl,
  );
  if (
    !asset ||
    typeof asset.name !== "string" ||
    typeof asset.browser_download_url !== "string"
  ) {
    return null;
  }

  return {
    name: asset.name,
    tagName: release.tag_name,
    url: asset.browser_download_url,
  };
}

export async function fetchLatestReleaseDownload(
  format: DownloadFormat,
  fetchImplementation: typeof fetch = fetch,
): Promise<ReleaseDownload> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "codex-themes-download-redirect",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetchImplementation(LATEST_RELEASE_API_URL, { headers });
  if (!response.ok) {
    throw new Error(`GitHub latest release request failed with ${response.status}`);
  }
  const download = selectReleaseDownload(await response.json(), format);

  if (!download) {
    const platformLabel = format === "exe" ? "Windows x64" : "macOS arm64";
    throw new Error(`GitHub latest release does not contain a ${platformLabel} ${format} asset`);
  }
  return download;
}
