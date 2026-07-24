import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeReleaseNotes,
  releaseUrlForVersion,
} from "./updater-state";

test("normalizes GitHub HTML release notes into readable text", () => {
  assert.equal(
    normalizeReleaseNotes(
      "<h2>本次更新</h2><ul><li>修复下载</li><li>增加更新提示</li></ul>",
    ),
    "本次更新\n- 修复下载\n- 增加更新提示",
  );
});

test("joins full changelog entries with their versions", () => {
  assert.equal(
    normalizeReleaseNotes([
      { version: "0.2.3", note: "<p>新版本</p>" },
      { version: "0.2.2", note: "上一版本" },
    ]),
    "v0.2.3\n新版本\n\nv0.2.2\n上一版本",
  );
});

test("returns null for missing release notes", () => {
  assert.equal(normalizeReleaseNotes(null), null);
  assert.equal(normalizeReleaseNotes([]), null);
});

test("keeps invalid numeric entities instead of crashing", () => {
  assert.equal(normalizeReleaseNotes("版本 &#999999999;"), "版本 &#999999999;");
});

test("builds the official release URL for a version", () => {
  assert.equal(
    releaseUrlForVersion("0.2.3-beta.1"),
    "https://github.com/freestylefly/codex-themes/releases/tag/v0.2.3-beta.1",
  );
});
