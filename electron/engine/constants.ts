/**
 * Engine-wide constants. DOM selectors that depend on Codex internals are
 * concentrated here so a Codex update means editing one module (DESIGN §10).
 */

/** Bumped whenever the injected payload format changes. */
export const SKIN_VERSION = "1.2.4";

export const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export const MAX_ART_BYTES = 16 * 1024 * 1024;
export const MAX_MOTION_BYTES = 12 * 1024 * 1024;

/** First port tried when launching Codex with CDP; scan upwards if busy. */
export const PREFERRED_CDP_PORT = 9341;

export const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
export const MOTION_EXTENSIONS = new Set([".mp4", ".webm"]);

/** Standard preview image dimensions generated on export (fit within). */
export const PREVIEW_WIDTH = 1200;
export const PREVIEW_HEIGHT = 675;

/** Selectors proving a CDP page target is the Codex shell. */
export const CODEX_SHELL_MARKERS = {
  /** Selectors proving a CDP page target is the Codex shell.
   *
   * These selectors support both the legacy Codex DOM (main.main-surface,
   * .composer-surface-chrome, [role="main"]) and the newer unified ChatGPT/Codex
   * shell that uses hashed CSS-module class names such as
   * _MainContentSurface_* and _ComposerLayoutRoot_*.
   */
  shell: "main.main-surface, main[class*=\"_MainContentSurface_\"], main",
  sidebar: "aside.app-shell-left-panel",
  composer: ".composer-surface-chrome, [class*=\"_ComposerLayoutRoot_\"], .ProseMirror",
  main: "[role=\"main\"], main, [class*=\"_MainContentSurface_\"]",
} as const;

export const PROBE_EXPRESSION = `(() => {
  const modeButton = [...document.querySelectorAll('button')].find((button) => {
    const rect = button.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.left > 360 || rect.top > 160) return false;
    const text = (button.textContent || '').trim();
    const label = button.getAttribute('aria-label') || '';
    return text === 'Codex' || text === 'ChatGPT' || /(?:current mode|当前模式).*(?:Codex|ChatGPT)/i.test(label);
  }) || null;
  const markers = {
    shell: Boolean(document.querySelector('${CODEX_SHELL_MARKERS.shell}')),
    sidebar: Boolean(document.querySelector('${CODEX_SHELL_MARKERS.sidebar}')),
    composer: Boolean(document.querySelector('${CODEX_SHELL_MARKERS.composer}')),
    main: Boolean(document.querySelector('${CODEX_SHELL_MARKERS.main}')),
  };
  return {
    title: document.title,
    href: location.href,
    markers,
    modeButtonText: (modeButton?.textContent || '').trim(),
    modeButtonLabel: modeButton?.getAttribute('aria-label') || '',
  };
})()`;
