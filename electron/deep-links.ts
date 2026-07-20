import type { OpenThemeAction } from "./shared/types";

export const CODEX_THEMES_PROTOCOL = "codexthemes:";

const THEME_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Parse the only external action Codex Themes exposes publicly.
 *
 * Accepted form: codexthemes://theme/<built-in-theme-id>
 * Theme existence is checked separately by the main process.
 */
export function parseOpenThemeUrl(raw: string): OpenThemeAction | null {
  if (typeof raw !== "string" || raw.length > 512) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== CODEX_THEMES_PROTOCOL || url.hostname !== "theme") return null;
    if (url.search || url.hash || url.username || url.password || url.port) return null;

    const encoded = url.pathname.replace(/^\/+/, "");
    if (!encoded || encoded.includes("/")) return null;

    const themeId = decodeURIComponent(encoded);
    if (!THEME_ID_RE.test(themeId)) return null;
    return { type: "open-theme", themeId };
  } catch {
    return null;
  }
}
