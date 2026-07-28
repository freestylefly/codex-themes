import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchLatestReleaseDownload,
  parseDownloadFormat,
  parseDownloadTarget,
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
      name: "Codex-Themes-0.2.3-mac-x64.dmg",
      browser_download_url:
        "https://github.com/freestylefly/codex-themes/releases/download/v0.2.3/Codex-Themes-0.2.3-mac-x64.dmg",
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

test("download target parser keeps old Mac links and rejects invalid combinations", () => {
  assert.deepEqual(parseDownloadTarget({ format: "dmg" }), {
    platform: "mac",
    arch: "arm64",
    format: "dmg",
  });
  assert.deepEqual(
    parseDownloadTarget({ platform: "mac", arch: "x64", format: "zip" }),
    { platform: "mac", arch: "x64", format: "zip" },
  );
  assert.deepEqual(parseDownloadTarget({ format: "exe" }), {
    platform: "win",
    arch: "x64",
    format: "exe",
  });
  assert.equal(
    parseDownloadTarget({ platform: "win", arch: "arm64", format: "exe" }),
    null,
  );
  assert.equal(
    parseDownloadTarget({ platform: "win", arch: "x64", format: "dmg" }),
    null,
  );
});

test("release resolver selects the package attached to the latest tag", () => {
  assert.deepEqual(selectReleaseDownload(release, {
    platform: "mac",
    arch: "arm64",
    format: "dmg",
  }), {
    name: "Codex-Themes-0.2.3-mac-arm64.dmg",
    tagName: "v0.2.3",
    url: "https://github.com/freestylefly/codex-themes/releases/download/v0.2.3/Codex-Themes-0.2.3-mac-arm64.dmg",
  });
  assert.equal(selectReleaseDownload(release, {
    platform: "mac",
    arch: "arm64",
    format: "zip",
  })?.name, "Codex-Themes-0.2.3-mac-arm64.zip");
  assert.equal(selectReleaseDownload(release, {
    platform: "mac",
    arch: "x64",
    format: "dmg",
  })?.name, "Codex-Themes-0.2.3-mac-x64.dmg");
  assert.equal(selectReleaseDownload(release, {
    platform: "win",
    arch: "x64",
    format: "exe",
  })?.name, "Codex-Themes-0.2.3-win-x64.exe");
});

test("release resolver refuses download URLs outside the official repository", () => {
  assert.equal(
    selectReleaseDownload({
      tag_name: "v0.2.3",
      assets: [{
        name: "Codex-Themes-0.2.3-mac-arm64.dmg",
        browser_download_url: "https://example.com/Codex-Themes-0.2.3-mac-arm64.dmg",
      }],
    }, { platform: "mac", arch: "arm64", format: "dmg" }),
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
    (await fetchLatestReleaseDownload({
      platform: "mac",
      arch: "arm64",
      format: "zip",
    }, fakeFetch)).name,
    "Codex-Themes-0.2.3-mac-arm64.zip",
  );
});
