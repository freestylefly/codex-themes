interface ReleaseNoteLike {
  note?: unknown;
  version?: unknown;
}

function decodeCodePoint(value: string, radix: number, fallback: string): string {
  const codePoint = Number.parseInt(value, radix);
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return fallback;
  }
  return String.fromCodePoint(codePoint);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (match, code: string) =>
      decodeCodePoint(code, 10, match),
    )
    .replace(/&#x([0-9a-f]+);/gi, (match, code: string) =>
      decodeCodePoint(code, 16, match),
    );
}

function htmlToPlainText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li(?:\s[^>]*)?>/gi, "- ")
      .replace(/<\/(?:p|div|h[1-6]|li|ul|ol|pre|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeReleaseNotes(value: unknown): string | null {
  if (typeof value === "string") {
    return htmlToPlainText(value) || null;
  }
  if (!Array.isArray(value)) return null;

  const sections = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const note = entry as ReleaseNoteLike;
    if (typeof note.note !== "string" || !note.note.trim()) return [];
    const body = htmlToPlainText(note.note);
    if (!body) return [];
    return [
      typeof note.version === "string" && note.version
        ? `v${note.version}\n${body}`
        : body,
    ];
  });
  return sections.length > 0 ? sections.join("\n\n") : null;
}

export function releaseUrlForVersion(version: string): string {
  return `https://github.com/freestylefly/codex-themes/releases/tag/v${encodeURIComponent(version)}`;
}
