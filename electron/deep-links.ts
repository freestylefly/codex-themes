import type { OpenThemeAction } from "./shared/types";

export const CODEX_THEMES_PROTOCOL = "codexthemes:";

const THEME_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface AuthCallbackAction {
  type: "auth-callback";
  code: string;
  state: string | null;
}

export interface PaymentResultAction {
  type: "payment-result";
  orderId: string;
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
      if (!code) return null;
      return { type: "auth-callback", code, state: url.searchParams.get("state") };
    }

    if (url.hostname === "payment") {
      if (url.pathname !== "/result") return null;
      const orderId = url.searchParams.get("orderId");
      if (!orderId) return null;
      return { type: "payment-result", orderId };
    }

    if (url.hostname === "create") {
      const encoded = url.pathname.replace(/^\/+/, "");
      if (!encoded || encoded.includes("/")) return null;
      if (encoded === "custom") return { type: "open-workspace", workspace: "editor" };
      if (encoded === "ai") return { type: "open-workspace", workspace: "ai-studio" };
      return null;
    }

    if (url.hostname !== "theme") return null;

    const encoded = url.pathname.replace(/^\/+/, "");
    if (!encoded || encoded.includes("/")) return null;

    const themeId = decodeURIComponent(encoded);
    if (!THEME_ID_RE.test(themeId)) return null;
    return { type: "open-theme", themeId };
  } catch {
    return null;
  }
}
