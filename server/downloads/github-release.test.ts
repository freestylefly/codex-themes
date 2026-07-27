/**
 * [INPUT]: 依赖 github-release 的格式解析、制品选择与可注入 fetch
 * [OUTPUT]: 验证精确平台制品、官方仓库、版本绑定和缺失制品错误
 * [POS]: server/downloads 的 GitHub Release 信任边界回归测试
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchLatestReleaseDownload,
  parseDownloadFormat,
  selectReleaseDownload,
} from "./github-release";

const release = {
  tag_name: "v0.2.3",
  assets: [
    {
      name: "Codex-Themes-0.2.3-mac-arm64.dmg.blockmap",
      browser_download_url:
        "https://github.com/freestylefly/codex-themes/releases/download/v0.2.3/Codex-Themes-0.2.3-mac-arm64.dmg.blockmap",
    },
    {
      name: "Codex-Themes-0.2.3-mac-arm64.dmg",
      browser_download_url:
        "https://github.com/freestylefly/codex-themes/releases/download/v0.2.3/Codex-Themes-0.2.3-mac-arm64.dmg",
    },
    {
      name: "Codex-Themes-0.2.3-mac-arm64.zip",
      browser_download_url:
        "https://github.com/freestylefly/codex-themes/releases/download/v0.2.3/Codex-Themes-0.2.3-mac-arm64.zip",
    },
    {
      name: "Codex-Themes-0.2.3-win-x64.exe.blockmap",
      browser_download_url:
        "https://github.com/freestylefly/codex-themes/releases/download/v0.2.3/Codex-Themes-0.2.3-win-x64.exe.blockmap",
    },
    {
      name: "Codex-Themes-0.2.3-win-x64.exe",
      browser_download_url:
        "https://github.com/freestylefly/codex-themes/releases/download/v0.2.3/Codex-Themes-0.2.3-win-x64.exe",
    },
  ],
};

test("download format only accepts supported package types", () => {
  assert.equal(parseDownloadFormat("dmg"), "dmg");
  assert.equal(parseDownloadFormat(["zip", "dmg"]), "zip");
  assert.equal(parseDownloadFormat("exe"), "exe");
  assert.equal(parseDownloadFormat(undefined), null);
});

test("release resolver selects the package attached to the latest tag", () => {
  assert.deepEqual(selectReleaseDownload(release, "dmg"), {
    name: "Codex-Themes-0.2.3-mac-arm64.dmg",
    tagName: "v0.2.3",
    url: "https://github.com/freestylefly/codex-themes/releases/download/v0.2.3/Codex-Themes-0.2.3-mac-arm64.dmg",
  });
  assert.equal(selectReleaseDownload(release, "zip")?.name, "Codex-Themes-0.2.3-mac-arm64.zip");
});

test("release resolver selects the exact Windows installer and excludes its blockmap", () => {
  assert.deepEqual(selectReleaseDownload(release, "exe"), {
    name: "Codex-Themes-0.2.3-win-x64.exe",
    tagName: "v0.2.3",
    url: "https://github.com/freestylefly/codex-themes/releases/download/v0.2.3/Codex-Themes-0.2.3-win-x64.exe",
  });
});

test("release resolver refuses download URLs outside the official repository", () => {
  assert.equal(
    selectReleaseDownload({
      tag_name: "v0.2.3",
      assets: [{
        name: "Codex-Themes-0.2.3-mac-arm64.dmg",
        browser_download_url: "https://example.com/Codex-Themes-0.2.3-mac-arm64.dmg",
      }],
    }, "dmg"),
    null,
  );
});

test("release resolver refuses a matching filename attached to another tag", () => {
  assert.equal(
    selectReleaseDownload({
      tag_name: "v0.2.3",
      assets: [{
        name: "Codex-Themes-0.2.3-win-x64.exe",
        browser_download_url: "https://github.com/freestylefly/codex-themes/releases/download/v0.2.2/Codex-Themes-0.2.3-win-x64.exe",
      }],
    }, "exe"),
    null,
  );
});

test("latest release request returns the GitHub asset selected from the response", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(JSON.stringify(release), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  assert.equal(
    (await fetchLatestReleaseDownload("zip", fakeFetch)).name,
    "Codex-Themes-0.2.3-mac-arm64.zip",
  );
});

test("latest release request reports an absent Windows installer", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ ...release, assets: release.assets.filter((asset) => !asset.name.endsWith(".exe")) }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  await assert.rejects(
    fetchLatestReleaseDownload("exe", fakeFetch),
    /Windows x64 exe asset/,
  );
});
