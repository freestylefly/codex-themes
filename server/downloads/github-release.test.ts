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
  ],
};

test("download format only accepts supported package types", () => {
  assert.equal(parseDownloadFormat("dmg"), "dmg");
  assert.equal(parseDownloadFormat(["zip", "dmg"]), "zip");
  assert.equal(parseDownloadFormat("exe"), null);
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
