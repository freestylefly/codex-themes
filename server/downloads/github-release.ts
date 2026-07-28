export type DownloadPlatform = "mac" | "win";
export type DownloadArch = "arm64" | "x64";
export type DownloadFormat = "dmg" | "zip" | "exe";

export interface DownloadTarget {
  platform: DownloadPlatform;
  arch: DownloadArch;
  format: DownloadFormat;
}

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

function firstQueryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseDownloadTarget(input: {
  platform?: string | string[];
  arch?: string | string[];
  format?: string | string[];
}): DownloadTarget | null {
  const format = parseDownloadFormat(input.format);
  if (!format) return null;
  const platformValue = firstQueryValue(input.platform);
  const archValue = firstQueryValue(input.arch);

  if (!platformValue && !archValue && (format === "dmg" || format === "zip")) {
    return { platform: "mac", arch: "arm64", format };
  }

  const platform = platformValue === "mac" || platformValue === "win"
    ? platformValue
    : format === "exe" && !platformValue
      ? "win"
      : null;
  const arch = archValue === "arm64" || archValue === "x64"
    ? archValue
    : platform === "win" && !archValue
      ? "x64"
      : null;
  if (!platform || !arch) return null;
  if (platform === "mac" && (format === "dmg" || format === "zip")) {
    return { platform, arch, format };
  }
  if (platform === "win" && arch === "x64" && format === "exe") {
    return { platform, arch, format };
  }
  return null;
}

export function selectReleaseDownload(
  payload: unknown,
  target: DownloadTarget,
): ReleaseDownload | null {
  if (!payload || typeof payload !== "object") return null;

  const release = payload as GitHubRelease;
  if (typeof release.tag_name !== "string" || !Array.isArray(release.assets)) return null;

  const version = release.tag_name.startsWith("v")
    ? release.tag_name.slice(1)
    : release.tag_name;
  const expectedName =
    `Codex-Themes-${version}-${target.platform}-${target.arch}.${target.format}`;
  const assets = release.assets.filter(
    (asset): asset is GitHubReleaseAsset => Boolean(asset && typeof asset === "object"),
  );
  const candidates = assets.filter(
    (asset) =>
      typeof asset.name === "string" &&
      typeof asset.browser_download_url === "string" &&
      asset.name.endsWith(
        `-${target.platform}-${target.arch}.${target.format}`,
      ) &&
      asset.browser_download_url.startsWith(RELEASE_DOWNLOAD_PREFIX),
  );
  const asset = candidates.find((candidate) => candidate.name === expectedName)
    ?? (candidates.length === 1 ? candidates[0] : undefined);

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
  target: DownloadTarget,
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

  const download = selectReleaseDownload(await response.json(), target);
  if (!download) {
    throw new Error(
      `GitHub latest release does not contain a ${target.platform} ${target.arch} ${target.format} asset`,
    );
  }
  return download;
}
