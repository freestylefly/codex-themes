/**
 * [INPUT]: 依赖标准 URL 解析与共享 OpenThemeAction 类型
 * [OUTPUT]: 对外提供 codexthemes 协议常量及主题、OAuth、支付动作白名单解析
 * [POS]: 外部浏览器/操作系统进入主进程的深链信任边界，拒绝未声明形态与超长输入
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { OpenThemeAction } from "./shared/types";

export const CODEX_THEMES_PROTOCOL = "codexthemes:";

const THEME_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface AuthCallbackAction {
  type: "auth-callback";
  code: string | null;
  error: string | null;
  state: string | null;
}

export interface PaymentResultAction {
  type: "payment-result";
  orderId: string;
  orderKind: "theme" | "points";
}

export type DeepLinkAction = OpenThemeAction | AuthCallbackAction | PaymentResultAction;

/**
 * Parse the small, allow-listed set of actions exposed to the public website.
 *
 * Accepted forms:
 * - codexthemes://theme/<built-in-theme-id>
 * - codexthemes://create/custom
 * - codexthemes://create/ai
 *
 * Theme existence is checked separately by the main process.
 */
export function parseOpenThemeUrl(raw: string): OpenThemeAction | null {
  const parsed = parseDeepLink(raw);
  if (parsed?.type === "open-theme" || parsed?.type === "open-workspace") return parsed;
  return null;
}

export function parseAuthCallbackUrl(raw: string): AuthCallbackAction | null {
  const parsed = parseDeepLink(raw);
  return parsed?.type === "auth-callback" ? parsed : null;
}

export function parsePaymentResultUrl(raw: string): PaymentResultAction | null {
  const parsed = parseDeepLink(raw);
  return parsed?.type === "payment-result" ? parsed : null;
}

function parseDeepLink(raw: string): DeepLinkAction | null {
  if (typeof raw !== "string" || raw.length > 512) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== CODEX_THEMES_PROTOCOL) return null;
    if (url.username || url.password || url.port) return null;

    if (url.hostname === "auth") {
      if (url.pathname !== "/callback") return null;
      const code = url.searchParams.get("code");
      const oauthError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
      if (Boolean(code) === Boolean(oauthError)) return null;
      if (oauthError && oauthError.length > 240) return null;
      return {
        type: "auth-callback",
        code,
        error: oauthError,
        state: url.searchParams.get("state"),
      };
    }

    if (url.hostname === "payment") {
      if (url.pathname !== "/result") return null;
      const orderId = url.searchParams.get("orderId");
      const pointOrderId = url.searchParams.get("pointOrderId");
      if (Boolean(orderId) === Boolean(pointOrderId)) return null;
      return {
        type: "payment-result",
        orderId: pointOrderId ?? orderId!,
        orderKind: pointOrderId ? "points" : "theme",
      };
    }

    if (url.hostname === "create") {
      const encoded = url.pathname.replace(/^\/+/, "");
      if (!encoded || encoded.includes("/") || url.search || url.hash) return null;
      if (encoded === "custom") return { type: "open-workspace", workspace: "editor" };
      if (encoded === "ai") return { type: "open-workspace", workspace: "ai-studio" };
      return null;
    }

    if (url.hostname !== "theme") return null;

    const encoded = url.pathname.replace(/^\/+/, "");
    if (!encoded || encoded.includes("/") || url.search || url.hash) return null;

    const themeId = decodeURIComponent(encoded);
    if (!THEME_ID_RE.test(themeId)) return null;
    return { type: "open-theme", themeId };
  } catch {
    return null;
  }
}
