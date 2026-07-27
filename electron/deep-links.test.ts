import { describe, it } from "node:test";
/**
 * [INPUT]: 依赖 node:test 与深链白名单解析器
 * [OUTPUT]: 验证主题、OAuth 成功/失败和支付深链的信任边界
 * [POS]: electron 深链入口回归门禁，覆盖外部不可信 URL 形态
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from "node:assert/strict";
import { parseOpenThemeUrl, parseAuthCallbackUrl, parsePaymentResultUrl } from "./deep-links";

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

  it("does not treat auth or payment URLs as theme URLs", () => {
    assert.equal(parseOpenThemeUrl("codexthemes://auth/callback?code=abc"), null);
    assert.equal(parseOpenThemeUrl("codexthemes://payment/result?orderId=123"), null);
  });
});

describe("parseAuthCallbackUrl", () => {
  it("accepts a valid auth callback", () => {
    assert.deepEqual(parseAuthCallbackUrl("codexthemes://auth/callback?code=abc123"), {
      type: "auth-callback",
      code: "abc123",
      error: null,
      state: null,
    });
  });

  it("preserves optional state", () => {
    assert.deepEqual(parseAuthCallbackUrl("codexthemes://auth/callback?code=abc&state=xyz"), {
      type: "auth-callback",
      code: "abc",
      error: null,
      state: "xyz",
    });
  });

  it("accepts an OAuth cancellation callback", () => {
    assert.deepEqual(parseAuthCallbackUrl("codexthemes://auth/callback?error=access_denied"), {
      type: "auth-callback",
      code: null,
      error: "access_denied",
      state: null,
    });
  });

  it("rejects missing code", () => {
    assert.equal(parseAuthCallbackUrl("codexthemes://auth/callback"), null);
  });

  it("rejects non-auth URLs", () => {
    assert.equal(parseAuthCallbackUrl("codexthemes://theme/blue-window-messenger"), null);
  });
});

describe("parsePaymentResultUrl", () => {
  it("accepts a valid payment result", () => {
    assert.deepEqual(parsePaymentResultUrl("codexthemes://payment/result?orderId=ord-123"), {
      type: "payment-result",
      orderId: "ord-123",
      orderKind: "theme",
    });
  });

  it("parses a point order payment result", () => {
    assert.deepEqual(parsePaymentResultUrl("codexthemes://payment/result?pointOrderId=points-123"), {
      type: "payment-result",
      orderId: "points-123",
      orderKind: "points",
    });
  });

  it("rejects missing orderId", () => {
    assert.equal(parsePaymentResultUrl("codexthemes://payment/result"), null);
  });

  it("rejects non-payment URLs", () => {
    assert.equal(parsePaymentResultUrl("codexthemes://theme/blue-window-messenger"), null);
  });
});
