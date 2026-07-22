import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseOpenThemeUrl } from "./deep-links";

describe("parseOpenThemeUrl", () => {
  it("accepts a canonical theme URL", () => {
    assert.deepEqual(parseOpenThemeUrl("codexthemes://theme/blue-window-messenger"), {
      type: "open-theme",
      themeId: "blue-window-messenger",
    });
  });

  it("accepts the two allow-listed workspace URLs", () => {
    assert.deepEqual(parseOpenThemeUrl("codexthemes://create/custom"), {
      type: "open-workspace",
      workspace: "editor",
    });
    assert.deepEqual(parseOpenThemeUrl("codexthemes://create/ai"), {
      type: "open-workspace",
      workspace: "ai-studio",
    });
  });

  it("rejects unsupported hosts and actions", () => {
    assert.equal(parseOpenThemeUrl("codexthemes://apply/blue-window-messenger"), null);
    assert.equal(parseOpenThemeUrl("codexthemes://create/settings"), null);
    assert.equal(parseOpenThemeUrl("https://theme/blue-window-messenger"), null);
  });

  it("rejects traversal, nested paths, query strings and invalid ids", () => {
    assert.equal(parseOpenThemeUrl("codexthemes://theme/%2E%2E"), null);
    assert.equal(parseOpenThemeUrl("codexthemes://theme/a/b"), null);
    assert.equal(parseOpenThemeUrl("codexthemes://theme/Blue_Window"), null);
    assert.equal(parseOpenThemeUrl("codexthemes://theme/soft-moss?apply=1"), null);
    assert.equal(parseOpenThemeUrl("codexthemes://create/ai/extra"), null);
  });

  it("rejects malformed and oversized input", () => {
    assert.equal(parseOpenThemeUrl("not a url"), null);
    assert.equal(parseOpenThemeUrl(`codexthemes://theme/${"a".repeat(600)}`), null);
  });
});
