/**
 * Engine-wide constants. DOM selectors that depend on Codex internals are
 * concentrated here so a Codex update means editing one module (DESIGN §10).
 */

/** Bumped whenever the injected payload format changes. */
export const SKIN_VERSION = "1.0.1";

export const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export const MAX_ART_BYTES = 16 * 1024 * 1024;

/** First port tried when launching Codex with CDP; scan upwards if busy. */
export const PREFERRED_CDP_PORT = 9341;

export const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

/** Standard preview image dimensions generated on export (fit within). */
export const PREVIEW_WIDTH = 1200;
export const PREVIEW_HEIGHT = 675;

/** Selectors proving a CDP page target is the Codex shell. */
export const CODEX_SHELL_MARKERS = {
  shell: "main.main-surface",
  sidebar: "aside.app-shell-left-panel",
  composer: ".composer-surface-chrome",
  main: '[role="main"]',
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
