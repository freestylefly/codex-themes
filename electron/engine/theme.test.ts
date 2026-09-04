/**
 * Unit tests for the theme normalizer and compiler.
 * Run with: node --test dist/engine/theme.test.js (after build)
 * Or during dev via a tsx runner if available.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { normalizeTheme, contrastRatio, validateContrast, deriveDarkPalette } from "./normalize";
import { compileTheme } from "./compiler";
import { buildPayload, loadTheme } from "./payload";
import { isActiveHomeSurface } from "./home-detection";
import type { ThemeConfigV1, ThemeConfigV2, ThemePalette } from "../shared/types";

const minimalV1: ThemeConfigV1 = {
  schemaVersion: 1,
  id: "legacy",
  name: "Legacy Theme",
  brandSubtitle: "CODEX THEMES",
  tagline: "A legacy theme.",
  projectPrefix: "选择项目 · ",
  projectLabel: "◉  选择项目",
  statusText: "ONLINE",
  quote: "HELLO",
  image: "background.png",
  colors: {
    background: "#f7f4ef",
    panel: "#ffffff",
    panelAlt: "#faf7f2",
    accent: "#8a9a6d",
    accentAlt: "#a8b894",
    secondary: "#d4a5a5",
    highlight: "#c9b18a",
    text: "#3d3630",
    muted: "#7d756b",
    line: "rgba(138, 154, 109, 0.22)",
  },
};

const minimalV2: ThemeConfigV2 = {
  schemaVersion: 2,
  uuid: "550e8400-e29b-41d4-a716-446655440000",
  id: "modern",
  version: "1.0.0",
  minEngineVersion: "1.0.0",
  name: "Modern Theme",
  description: "A modern theme.",
  tagline: "Hello world.",
  tags: ["clean"],
  hero: "hero.png",
  light: {
    background: "#f7f4ef",
    panel: "#ffffff",
    panelAlt: "#faf7f2",
    surface: "#ffffff",
    text: "#3d3630",
    muted: "#7d756b",
    border: "rgba(138, 154, 109, 0.22)",
    accent: "#8a9a6d",
    accentAlt: "#a8b894",
    secondary: "#d4a5a5",
    highlight: "#c9b18a",
  },
  layout: "split-studio",
  heroFit: "cover",
  heroFocusX: 0.62,
  heroFocusY: 0.24,
  heroZoom: 1.2,
  heroHeight: 280,
  heroTextAlign: "center",
  heroScrim: 0.5,
  wallpaperEnabled: false,
  wallpaperFocusX: 0.5,
  wallpaperFocusY: 0.5,
  wallpaperOpacity: 0.15,
  wallpaperBlur: 0,
  radius: "xl",
  density: "spacious",
  fontPreset: "rounded",
  glass: true,
  shadow: "md",
  decoration: 0.6,
  effects: { particles: 0.2 },
  brandSubtitle: "CODEX THEMES",
  projectPrefix: "选择项目 · ",
  projectLabel: "◉  选择项目",
  statusText: "ONLINE",
  quote: "HELLO",
};

describe("normalizeTheme", () => {
  it("maps v1 to NormalizedTheme with dream-banner layout", () => {
    const { theme, warnings } = normalizeTheme(minimalV1);
    assert.equal(theme.schemaVersion, 2);
    assert.equal(theme.layout, "dream-banner");
    assert.equal(theme.name, "Legacy Theme");
    assert.equal(theme.hero.fit, "cover");
    assert.equal(theme.wallpaper.enabled, false);
    assert.ok(warnings.length === 0, `unexpected warnings: ${warnings.join(", ")}`);
  });

  it("preserves v2 structured fields", () => {
    const { theme } = normalizeTheme(minimalV2);
    assert.equal(theme.schemaVersion, 2);
    assert.equal(theme.uuid, "550e8400-e29b-41d4-a716-446655440000");
    assert.equal(theme.layout, "split-studio");
    assert.equal(theme.hero.height, 280);
    assert.equal(theme.hero.textAlign, "center");
    assert.equal(theme.appearance.radius, "xl");
    assert.equal(theme.effects.particles, 0.2);
  });

  it("preserves the retro messenger layout", () => {
    const { theme } = normalizeTheme({ ...minimalV2, layout: "retro-messenger" });
    const compiled = compileTheme(theme);
    assert.equal(theme.layout, "retro-messenger");
    assert.ok(compiled.classes.includes("codex-dream-skin--retro-messenger"));
    assert.equal(compiled.variables["--ds-retro-rail-width"], "184px");
    assert.equal(compiled.variables["--ds-retro-toolbar-height"], "52px");
  });

  it("preserves the silk scroll layout", () => {
    const { theme } = normalizeTheme({ ...minimalV2, layout: "silk-scroll" });
    const compiled = compileTheme(theme);
    assert.equal(theme.layout, "silk-scroll");
    assert.ok(compiled.classes.includes("codex-dream-skin--silk-scroll"));
    assert.equal(compiled.variables["--ds-layout"], "silk-scroll");
  });

  it("preserves cinematic motion resources", () => {
    const { theme } = normalizeTheme({
      ...minimalV2,
      layout: "cinematic-live",
      motionBackground: "motion.mp4",
      motionPoster: "motion-poster.webp",
    });
    const compiled = compileTheme(theme);
    assert.equal(theme.layout, "cinematic-live");
    assert.equal(theme.resources.motionBackground, "motion.mp4");
    assert.equal(theme.resources.motionPoster, "motion-poster.webp");
    assert.ok(compiled.classes.includes("codex-dream-skin--cinematic-live"));
  });

  it("auto-derives a dark palette when missing", () => {
    const v2 = { ...minimalV2, dark: undefined };
    const { theme } = normalizeTheme(v2);
    assert.ok(theme.dark);
    assert.notEqual(theme.dark.background, theme.light.background);
  });

  it("throws on unsupported schemas", () => {
    assert.throws(() => normalizeTheme({ foo: "bar" }), /Unrecognized theme schema/);
  });

  it("clamps hero parameters to valid ranges", () => {
    const v2 = {
      ...minimalV2,
      heroHeight: 500,
      heroScrim: 1.2,
      heroZoom: 5,
      heroFocusX: -0.5,
    };
    const { theme } = normalizeTheme(v2);
    assert.equal(theme.hero.height, 360);
    assert.equal(theme.hero.scrim, 0.85);
    assert.equal(theme.hero.zoom, 2);
    assert.equal(theme.hero.focusX, 0);
  });
});

describe("deriveDarkPalette", () => {
  it("darkens the light palette", () => {
    const dark = deriveDarkPalette(minimalV2.light);
    assert.ok(dark.background.startsWith("#"));
    assert.ok(dark.text === "#f2eee8");
  });
});

describe("contrastRatio", () => {
  it("returns high contrast for black on white", () => {
    const ratio = contrastRatio("#000000", "#ffffff");
    assert.ok(ratio && ratio > 20);
  });

  it("returns low contrast for similar colors", () => {
    const ratio = contrastRatio("#eeeeee", "#ffffff");
    assert.ok(ratio && ratio < 2);
  });
});

describe("validateContrast", () => {
  it("accepts readable palettes", () => {
    const v2 = {
      ...minimalV2,
      dark: {
        ...minimalV2.light,
        background: "#1a1814",
        panel: "#24221e",
        panelAlt: "#1f1d19",
        surface: "#2a2722",
        text: "#f2eee8",
        muted: "#a8a095",
        border: "rgba(255,255,255,0.12)",
      } as ThemePalette,
    };
    const { theme } = normalizeTheme(v2);
    const warnings = validateContrast(theme, true);
    assert.ok(!warnings.some((w) => w.includes("body text contrast")));
  });

  it("warns on low-contrast local themes", () => {
    const lowContrast: ThemePalette = {
      ...minimalV2.light,
      text: "#dddddd",
      background: "#eeeeee",
    };
    const v2 = { ...minimalV2, light: lowContrast };
    const { theme } = normalizeTheme(v2);
    const warnings = validateContrast(theme, true);
    assert.ok(warnings.some((w) => w.includes("body text contrast")));
  });
});

describe("compileTheme", () => {
  it("produces CSS variables for light and dark modes", () => {
    const { theme } = normalizeTheme(minimalV2);
    const light = compileTheme(theme, { mode: "light" });
    const dark = compileTheme(theme, { mode: "dark" });
    assert.equal(light.variables["--ds-layout"], "split-studio");
    assert.equal(dark.variables["--ds-bg"], theme.dark.background);
    assert.ok(light.classes.includes("codex-dream-skin--split-studio"));
    assert.equal(light.attrs["data-dream-theme"], theme.id);
  });

  it("includes compact mode class", () => {
    const { theme } = normalizeTheme(minimalV2);
    const compiled = compileTheme(theme, { compact: true });
    assert.ok(compiled.classes.includes("codex-dream-skin--compact"));
  });
});

describe("isActiveHomeSurface", () => {
  const activeHome = {
    withinShell: true,
    connected: true,
    rendered: true,
    visibleGameSource: true,
    visibleSuggestions: true,
    visibleTaskContent: false,
  };

  it("accepts a rendered home surface inside the active Codex shell", () => {
    assert.equal(isActiveHomeSurface(activeHome), true);
  });

  it("rejects hidden retained home DOM and active task content", () => {
    assert.equal(isActiveHomeSurface({ ...activeHome, rendered: false }), false);
    assert.equal(
      isActiveHomeSurface({ ...activeHome, visibleTaskContent: true }),
      false,
    );
  });

  it("does not classify a surface from a home icon alone", () => {
    assert.equal(
      isActiveHomeSurface({
        ...activeHome,
        visibleGameSource: false,
        visibleSuggestions: false,
      }),
      false,
    );
  });

  it("accepts the current new-conversation surface when only its welcome prompt is visible", () => {
    assert.equal(
      isActiveHomeSurface({
        ...activeHome,
        visibleGameSource: false,
        visibleSuggestions: false,
        visibleWelcome: true,
      }),
      true,
    );
  });

  it("keeps a visible theme-owned home active while native home content is hidden", () => {
    assert.equal(
      isActiveHomeSurface({
        ...activeHome,
        visibleThemeHome: true,
        visibleGameSource: false,
        visibleSuggestions: false,
      }),
      true,
    );
  });

  it("removes a theme-owned home when task content becomes visible", () => {
    assert.equal(
      isActiveHomeSurface({
        ...activeHome,
        visibleThemeHome: true,
        visibleGameSource: false,
        visibleSuggestions: false,
        visibleTaskContent: true,
      }),
      false,
    );
  });
});

describe("loadTheme", () => {
  it("loads a bundled v1 preset as NormalizedTheme", async () => {
    const loaded = await loadTheme("./assets/presets/cream-sage");
    assert.equal(loaded.theme.schemaVersion, 2);
    assert.equal(loaded.theme.layout, "dream-banner");
    assert.equal(loaded.theme.resources.hero, "background.png");
    assert.ok(loaded.imageBytes > 0);
  });

  it("embeds the retro theme stamp asset in the renderer payload", async () => {
    const built = await buildPayload(
      "./assets/inject",
      "./assets/presets/blue-window-messenger",
    );
    assert.equal(built.theme.catalogOnly, true);
    assert.equal(built.theme.resources.stamp, "stamp.png");
    assert.ok(!built.payload.includes("__DREAM_SKIN_STAMP_JSON__"));
    assert.ok(built.payload.includes("dream-skin-retro-friend-avatar"));
    assert.ok(built.payload.includes('const CUSTOM_HOME_THEME_IDS = new Set([\n    "blue-window-messenger"'));
    assert.ok(built.payload.includes("const PRESERVE_NATIVE_LAYOUT = !CUSTOM_HOME_THEME_IDS.has(THEME.id)"));
  });

  it("loads the Shanhai Nexus preset with its hero, wallpaper, and stamp", async () => {
    const built = await buildPayload(
      "./assets/inject",
      "./assets/presets/shanhai-nexus",
    );
    assert.equal(built.theme.id, "shanhai-nexus");
    assert.equal(built.theme.version, "1.1.0");
    assert.equal(built.theme.layout, "full-canvas");
    assert.equal(built.theme.resources.hero, "hero.png");
    assert.equal(built.theme.resources.wallpaper, "wallpaper-v2.png");
    assert.equal(built.theme.resources.stamp, "stamp.png");
    assert.ok(!built.payload.includes("__DREAM_SKIN_ART_JSON__"));
    assert.ok(!built.payload.includes("__DREAM_SKIN_WALLPAPER_JSON__"));
    assert.ok(!built.payload.includes("__DREAM_SKIN_STAMP_JSON__"));
  });

  it("loads the Moonlit Immortal catalog-only placeholder", async () => {
    const built = await buildPayload(
      "./assets/inject",
      "./assets/presets/moonlit-immortal",
    );
    assert.equal(built.theme.id, "moonlit-immortal");
    assert.equal(built.theme.layout, "full-canvas");
    assert.equal(built.theme.catalogOnly, true);
    assert.equal(built.theme.version, "1.3.1");
    assert.equal(built.theme.light.background, "#dcecff");
    assert.equal(built.theme.dark.background, "#061a3d");
    assert.ok(built.payload.includes("data-dream-theme"));
    assert.ok(built.payload.includes('"moonlit-immortal"'));
    assert.ok(built.payload.includes("!CUSTOM_HOME_THEME_IDS.has(THEME.id)"));
    assert.ok(built.payload.includes('data-dream-native-layout'));
    assert.ok(!built.payload.includes("__DREAM_SKIN_HOME_CLASSIFIER__"));
    assert.doesNotThrow(() => new Function(built.payload));
    assert.ok(!built.payload.includes("__DREAM_SKIN_ART_JSON__"));
  });

  it("loads the Starcap Teemo preset with its light and dark forest palettes", async () => {
    const built = await buildPayload(
      "./assets/inject",
      "./assets/presets/starcap-teemo",
    );
    assert.equal(built.theme.id, "starcap-teemo");
    assert.equal(built.theme.layout, "full-canvas");
    assert.equal(built.theme.resources.hero, "hero.png");
    assert.equal(built.theme.resources.wallpaper, "hero.png");
    assert.equal(built.theme.resources.stamp, "stamp.png");
    assert.equal(built.theme.light.background, "#f4faef");
    assert.equal(built.theme.dark.background, "#172a26");
    assert.ok(!built.payload.includes("__DREAM_SKIN_ART_JSON__"));
    assert.ok(!built.payload.includes("__DREAM_SKIN_WALLPAPER_JSON__"));
    assert.ok(!built.payload.includes("__DREAM_SKIN_STAMP_JSON__"));
  });

  it("loads the Mirror Lake Ribbon preset with its silk-scroll assets", async () => {
    const built = await buildPayload(
      "./assets/inject",
      "./assets/presets/mirror-lake-ribbon",
    );
    assert.equal(built.theme.id, "mirror-lake-ribbon");
    assert.equal(built.theme.layout, "silk-scroll");
    assert.equal(built.theme.resources.hero, "hero.png");
    assert.equal(built.theme.resources.wallpaper, "wallpaper.png");
    assert.equal(built.theme.resources.stamp, "stamp.png");
    assert.equal(built.theme.light.background, "#f6eee8");
    assert.equal(built.theme.dark.background, "#261c22");
    assert.ok(built.payload.includes('"mirror-lake-ribbon"'));
    assert.ok(built.payload.includes("!CUSTOM_HOME_THEME_IDS.has(THEME.id)"));
    assert.ok(built.payload.includes('data-dream-native-layout'));
    assert.ok(!built.payload.includes("__DREAM_SKIN_ART_JSON__"));
    assert.ok(!built.payload.includes("__DREAM_SKIN_WALLPAPER_JSON__"));
    assert.ok(!built.payload.includes("__DREAM_SKIN_STAMP_JSON__"));
  });

  it("loads every concept preset with the approved layout and WebP hero", async () => {
    const expected = new Map([
      ["neon-star-hunter", "dream-banner"],
      ["mecha-cat-studio", "split-studio"],
      ["hacker-zero", "terminal-grid"],
      ["potion-workshop", "paper-board"],
      ["focus-capybara", "minimal-focus"],
    ]);

    for (const [id, layout] of expected) {
      const built = await buildPayload("./assets/inject", `./assets/presets/${id}`);
      assert.equal(built.theme.id, id);
      assert.equal(built.theme.layout, layout);
      assert.equal(built.theme.resources.hero, "hero.webp");
      assert.equal(built.theme.resources.preview, "preview.png");
      assert.ok(built.payload.includes(`data-dream-theme=\"${id}\"`) || built.payload.includes("data-dream-theme"));
      assert.ok(built.payload.includes("const PRESERVE_NATIVE_LAYOUT = !CUSTOM_HOME_THEME_IDS.has(THEME.id)"));
      assert.doesNotThrow(() => new Function(built.payload));
      assert.ok(!built.payload.includes("__DREAM_SKIN_ART_JSON__"));
    }
  });

  it("embeds cinematic-live video backgrounds and fallback posters", async () => {
    for (const id of ["nightbound-companion", "yan-companion"]) {
      const built = await buildPayload(
        "./assets/inject",
        `./assets/presets/${id}`,
      );
      assert.equal(built.theme.id, id);
      assert.equal(built.theme.layout, "cinematic-live");
      assert.equal(built.theme.resources.motionBackground, "motion.mp4");
      assert.equal(built.theme.resources.motionPoster, "motion-poster.webp");
      assert.ok(built.payload.includes("data:video/mp4;base64,"));
      assert.ok(built.payload.includes("dream-skin-cinematic-video"));
      assert.ok(built.payload.includes("visibleCinematicHome"));
      assert.ok(built.payload.includes(".thread-scroll-container"));
      assert.ok(built.payload.includes("prefers-reduced-motion: reduce"));
      assert.ok(!built.payload.includes("__DREAM_SKIN_MOTION_JSON__"));
      assert.ok(!built.payload.includes("__DREAM_SKIN_MOTION_POSTER_JSON__"));
      assert.doesNotThrow(() => new Function(built.payload));
    }
  });
});

describe("Happy Coding Dog injected skin", () => {
  it("pauses the mutation observer while refreshing the injected theme", async () => {
    const built = await buildPayload(
      "./assets/inject",
      "./assets/presets/happy-coding-dog",
    );

    assert.match(
      built.payload,
      /const runEnsure = \(\) => \{[\s\S]*observer\.disconnect\(\)[\s\S]*ensure\(\)[\s\S]*observer\.observe\(document\.documentElement, observerOptions\)/,
      "theme-owned class and style mutations must not schedule another refresh",
    );
    assert.match(built.payload, /setInterval\(runEnsure, 4000\)/);
    assert.match(built.payload, /\n  runEnsure\(\);\n  return \{ installed:/);
  });

  it("ignores cosmetic attribute churn when deciding whether to refresh the theme", async () => {
    const built = await buildPayload(
      "./assets/inject",
      "./assets/presets/happy-coding-dog",
    );

    assert.match(
      built.payload,
      /const shouldScheduleEnsure = \(mutations\) => mutations\.some\([\s\S]*mutation\.target === document\.documentElement[\s\S]*mutation\.target === document\.body/,
    );
    assert.match(
      built.payload,
      /new MutationObserver\(\(mutations\) => \{[\s\S]*shouldScheduleEnsure\(mutations\)[\s\S]*scheduleEnsure\(\)/,
    );
    assert.doesNotMatch(
      built.payload,
      /attributeFilter: \[[^\]]*(?:"aria-label"|"style")/,
      "tooltip animation and accessibility-label churn must not refresh the whole skin",
    );
  });

  it("ignores timer text and transient portal nodes outside the themed shell", async () => {
    const built = await buildPayload(
      "./assets/inject",
      "./assets/presets/happy-coding-dog",
    );

    assert.match(
      built.payload,
      /if \(mutation\.type === "characterData"\) return false;/,
    );
    assert.match(
      built.payload,
      /if \(mutation\.type === "childList"\) return mutationTouchesThemeStructure\(mutation\);/,
    );
    assert.match(
      built.payload,
      /const THEME_STRUCTURE_SELECTOR = "main, aside\.app-shell-left-panel,[^"]+_ComposerLayout/,
    );
  });

  it("turns native sidebar navigation glyphs into color-coded hand-drawn stickers", async () => {
    const built = await buildPayload(
      "./assets/inject",
      "./assets/presets/happy-coding-dog",
    );
    const css = fs.readFileSync(path.resolve("assets/inject/dream-skin.css"), "utf8");

    for (const kind of ["new-chat", "pull-requests", "sites", "scheduled", "plugins", "security"]) {
      assert.ok(
        built.payload.includes(`["${kind}",`),
        `the injected sidebar annotator must classify ${kind}`,
      );
      assert.ok(
        css.includes(`[data-dream-dog-icon="${kind}"]`),
        `missing Happy Coding Dog sticker treatment for ${kind}`,
      );
    }
    assert.match(
      css,
      /data-dream-dog-icon[^{}]*svg[^{}]*\{[^}]*stroke-width:\s*2\.35[^}]*filter:\s*drop-shadow/s,
      "sidebar glyphs should use a heavier hand-drawn line and offset ink shadow",
    );
    assert.match(
      css,
      /data-dream-dog-project[^{}]*svg[^{}]*\{[^}]*background:\s*var\(--dog-yellow\)/s,
      "project folders should share the cream-yellow sticker language",
    );
  });

  it("styles the sidebar utility actions and keeps icon labels comfortably spaced", async () => {
    const built = await buildPayload(
      "./assets/inject",
      "./assets/presets/happy-coding-dog",
    );
    const css = fs.readFileSync(path.resolve("assets/inject/dream-skin.css"), "utf8");

    for (const kind of ["search", "activity", "quick-chat", "profile", "voice", "help"]) {
      assert.ok(built.payload.includes(`["${kind}",`), `missing utility action mapping for ${kind}`);
      assert.ok(css.includes(`[data-dream-dog-action="${kind}"]`), `missing utility sticker for ${kind}`);
    }
    assert.match(
      css,
      /happy-coding-dog[^{}]*aside\.app-shell-left-panel[^{}]*data-dream-dog-icon[^{}]*data-dream-dog-project[^{}]*\{[^}]*column-gap:\s*8px\s*!important/s,
      "navigation and project rows should keep an 8px gap between icon and label",
    );
    assert.match(
      css,
      /data-dream-dog-action="voice"[^{}]*\{[^}]*column-gap:\s*8px\s*!important/s,
      "the bottom voice action should keep its icon away from the label",
    );
  });

  it("turns the output and sources popover into a compact hand-drawn resource note", async () => {
    const built = await buildPayload(
      "./assets/inject",
      "./assets/presets/happy-coding-dog",
    );
    const css = fs.readFileSync(path.resolve("assets/inject/dream-skin.css"), "utf8");

    for (const hook of [
      "data-dream-dog-resource-panel",
      "data-dream-dog-resource-header",
      "data-dream-dog-resource-add",
      "data-dream-dog-resource-row",
      "data-dream-dog-resource-view-all",
    ]) {
      assert.ok(built.payload.includes(hook), `missing resource popover DOM hook ${hook}`);
      assert.ok(css.includes(`[${hook}]`), `missing resource popover styling for ${hook}`);
    }
    assert.match(
      css,
      /data-dream-dog-resource-panel[^{}]*\{[^}]*border:\s*(?:2|3)px solid var\(--dog-ink\)[^}]*box-shadow:/s,
      "the resource popover should read as a bordered paper note",
    );
    assert.match(
      css,
      /data-dream-dog-resource-row[^{}]*\{[^}]*column-gap:\s*8px\s*!important/s,
      "resource icons need an 8px gap from their labels",
    );
    assert.ok(css.includes('[data-dream-dog-resource-header="output"]'));
    assert.ok(css.includes('[data-dream-dog-resource-header="sources"]'));
  });

  it("keeps resource popover colors above the generic elevated-panel treatment", () => {
    const css = fs.readFileSync(path.resolve("assets/inject/dream-skin.css"), "utf8");
    const genericPanelRule = css.lastIndexOf('body div[class~="rounded-3xl"][class~="bg-surface-elevated-secondary"]');
    const outputHeaderRule = css.lastIndexOf('[data-dream-dog-resource-header="output"]');
    const sourcesHeaderRule = css.lastIndexOf('[data-dream-dog-resource-header="sources"]');
    const addButtonRule = css.lastIndexOf("[data-dream-dog-resource-add]");

    assert.ok(outputHeaderRule > genericPanelRule, "the yellow output label must win the cascade");
    assert.ok(sourcesHeaderRule > genericPanelRule, "the coral sources label must win the cascade");
    assert.ok(addButtonRule > genericPanelRule, "the round add stickers must win the cascade");
    assert.match(
      css,
      /data-dream-dog-resource-panel\]\[class~="rounded-3xl"\][^{}]*data-dream-dog-resource-header[^{}]*class~="sticky"/s,
      "resource headers need enough specificity to beat the generic sticky panel header",
    );
  });

  it("recognizes the resource add controls even when they expose an expanded state", async () => {
    const built = await buildPayload(
      "./assets/inject",
      "./assets/presets/happy-coding-dog",
    );

    assert.match(
      built.payload,
      /filter\(\(button\) => !button\.classList\.contains\("group\/section-toggle"\)\)/,
      "only the section toggle should be excluded from add-button styling",
    );
  });

  it("maps the hand-painted treatment to every major Codex shell region", () => {
    const css = fs.readFileSync(path.resolve("assets/inject/dream-skin.css"), "utf8");
    const scope = 'html.codex-dream-skin[data-dream-theme="happy-coding-dog"]';
    const requiredSelectors = [
      `${scope} body`,
      `${scope} aside.app-shell-left-panel`,
      `${scope} main.dream-skin-main-surface`,
      `${scope} header.app-header-tint`,
      `${scope} [data-message-author-role]`,
      `${scope} article`,
      `${scope} .dream-skin-composer`,
      `${scope} pre`,
      `${scope} [class*="_ArtifactPanel_"]`,
    ];

    for (const selector of requiredSelectors) {
      assert.ok(css.includes(selector), `missing scoped Happy Coding Dog treatment for ${selector}`);
    }
  });

  it("keeps the painted title bar and composer decoration anchored against generic rules", () => {
    const css = fs.readFileSync(path.resolve("assets/inject/dream-skin.css"), "utf8");
    const scope = 'html.codex-dream-skin[data-dream-theme="happy-coding-dog"]';
    assert.ok(
      css.includes(`${scope} main.dream-skin-main-surface > header.app-header-tint`),
      "title bar override must outrank the generic main/header selector",
    );
    assert.match(
      css,
      /data-dream-theme="happy-coding-dog"\][^{}]*\.dream-skin-composer[^{}]*\{[^}]*position:\s*relative\s*!important;/s,
      "composer must anchor its painted star decoration",
    );
  });

  it("keeps scrolled conversation content behind the cream thread header and ribbon", () => {
    const css = fs.readFileSync(path.resolve("assets/inject/dream-skin.css"), "utf8");

    assert.match(
      css,
      /happy-coding-dog[^{}]*main\.dream-skin-main-surface:not\(\.dream-skin-home-shell\)\s*>\s*header\[class~="fixed"\]\[class~="z-30"\][^{}]*\{[^}]*background:[^}]*100% 6px no-repeat[^}]*var\(--dog-cream\)\s*!important[^}]*border-bottom:\s*3px solid var\(--dog-ink\)/s,
      "the fixed thread header must use opaque cream paper with a narrow painted ribbon",
    );
  });

  it("does not place a paper fade over the top of populated conversations", () => {
    const css = fs.readFileSync(path.resolve("assets/inject/dream-skin.css"), "utf8");

    assert.doesNotMatch(
      css,
      /main\.dream-skin-main-surface:not\(\.dream-skin-home-shell\)::after\s*\{[^}]*content:\s*""[^}]*top:\s*46px[^}]*height:\s*44px/s,
      "the conversation background must remain visible immediately below the fixed toolbar",
    );
  });

  it("keeps only the upper titlebar rule on populated task conversations", () => {
    const css = fs.readFileSync(path.resolve("assets/inject/dream-skin.css"), "utf8");

    assert.match(
      css,
      /#codex-dream-skin-chrome:not\(\.dream-skin-home-shell\)::before[^{}]*\{[^}]*background:\s*var\(--dog-dopamine-header\)\s*!important[^}]*border-bottom:\s*0\s*!important[^}]*box-shadow:\s*none\s*!important/s,
    );
    assert.match(
      css,
      /main:not\(\.dream-skin-home-shell\)\s*\[class\*="_MainContentViewport_"\]::after[^{}]*\{[^}]*background:\s*var\(--dog-dopamine-header\)\s*!important/s,
    );
  });

  it("keeps only the upper titlebar rule on the new-conversation home", () => {
    const css = fs.readFileSync(path.resolve("assets/inject/dream-skin.css"), "utf8");

    assert.match(
      css,
      /#codex-dream-skin-chrome\.dream-skin-home-shell::before[^{}]*\{[^}]*background:\s*transparent\s*!important[^}]*border-bottom:\s*0\s*!important[^}]*box-shadow:\s*none\s*!important/s,
    );
    assert.match(
      css,
      /main\.dream-skin-home-shell\s*\[class\*="_MainContentViewport_"\]::after[^{}]*\{[^}]*background:\s*transparent\s*!important[^}]*border-bottom:\s*0\s*!important/s,
    );
  });

  it("covers the complete live Codex workspace instead of only the home preview", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "assets/inject/dream-skin.css"), "utf8");
    const requiredWorkspaceHooks = [
      "[class*=_Thread]",
      "[class*=_Conversation]",
      "[class*=_Output]",
      "[class*=_Sources]",
      "[class*=_ComposerLayoutRoot_]",
      "[data-radix-scroll-area-viewport]",
      "--dog-stroke-texture",
    ];

    for (const hook of requiredWorkspaceHooks) {
      assert.match(css, new RegExp(hook.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("does not clip the painted composer outline, stamp, or hard shadow", () => {
    const css = fs.readFileSync(path.resolve("assets/inject/dream-skin.css"), "utf8");
    assert.match(
      css,
      /happy-coding-dog[^}]*\}[\s\S]*\[class\*=_ComposerLayoutRoot_\]\.dream-skin-composer-dock\s*\{[^}]*overflow:\s*visible\s*!important/,
    );
    assert.match(
      css,
      /happy-coding-dog[^}]*\}[\s\S]*\.dream-skin-composer-stamp\s*\{[^}]*border:\s*3px solid var\(--dog-ink\)/,
    );
  });

  it("keeps native suggestion glyphs intact while painting their icon container", () => {
    const css = fs.readFileSync(path.resolve("assets/inject/dream-skin.css"), "utf8");

    assert.match(
      css,
      /happy-coding-dog[^}]*home-suggestions[^}]*span:has\(> svg\)[^{]*\{[^}]*border:\s*2px solid var\(--dog-ink\)/s,
      "the painted circle belongs on the icon container",
    );
    assert.match(
      css,
      /happy-coding-dog[^}]*home-suggestions[^}]*button svg[^}]*\{[^}]*width:\s*20px[^}]*height:\s*20px[^}]*padding:\s*0/s,
      "the SVG viewport must remain unpadded so native glyphs are not clipped",
    );
  });

  it("aligns the home title and suggestion cards to one centered content rail", () => {
    const css = fs.readFileSync(path.resolve("assets/inject/dream-skin.css"), "utf8");

    assert.match(
      css,
      /happy-coding-dog[^}]*dream-skin-happy-home-title[^}]*group\\\/home-suggestions[^}]*\{[^}]*width:\s*min\(720px, calc\(100% - 48px\)\)[^}]*margin-inline:\s*auto[^}]*transform:\s*none\s*!important/s,
      "the title and cards must share a centered rail without a viewport-relative offset",
    );
  });

  it("renders aligned fallback suggestions when Codex leaves the native host empty", async () => {
    const built = await buildPayload(
      "./assets/inject",
      "./assets/presets/happy-coding-dog",
    );

    assert.ok(
      built.payload.includes("dream-skin-happy-fallback-suggestions"),
      "the live skin must provide cards when the native suggestion host is empty",
    );
    assert.ok(
      built.payload.includes('data-happy-suggestion="understand"'),
      "the fallback must expose actionable suggestion buttons",
    );
    assert.ok(
      built.payload.includes('querySelector(\':scope > [class*="top-full"]\')'),
      "the fallback must reuse Codex's title-owned suggestion host",
    );
    assert.match(
      built.payload,
      /dream-skin-happy-fallback-suggestions[^{}]*\{[^}]*position:\s*absolute\s*!important/s,
      "the fallback must preserve the native absolute-positioned host",
    );
  });

  it("does not decorate the full home wrapper as the voice card", async () => {
    const built = await buildPayload(
      "./assets/inject",
      "./assets/presets/happy-coding-dog",
    );

    assert.match(
      built.payload,
      /if \(voiceCard && isHappyVoiceCardCandidate\(voiceCard\)\)\s*\{\s*voiceCard\.classList\.add\("dream-skin-happy-home-voice"\)/,
      "the initial voice-label candidate must satisfy the compact-card bounds before decoration",
    );
  });

  it("removes the native white top fade from the animal home canvas", () => {
    const css = fs.readFileSync(path.resolve("assets/inject/dream-skin.css"), "utf8");

    assert.match(
      css,
      /happy-coding-dog[^{}]*dream-skin-home-shell[^{}]*\[class\*="_MainContentTopFade_"\][^{}]*\{[^}]*display:\s*none\s*!important/s,
      "the native white-to-transparent top fade must not sit above the painted background",
    );
  });

  it("paints the home titlebar while leaving the removed cover layers transparent", () => {
    const css = fs.readFileSync(path.resolve("assets/inject/dream-skin.css"), "utf8");

    assert.match(
      css,
      /happy-coding-dog[^{}]*main\.dream-skin-home-shell\s*>\s*header\[class~="fixed"\]\[class~="z-30"\][^{}]*\{[^}]*linear-gradient\(100deg[^}]*#ffd84a[^}]*#ff5b49[^}]*#23b7c9[^}]*#78c64b[^}]*#a86be8[^}]*border-bottom:\s*3px solid var\(--dog-ink\)/s,
      "the fixed home titlebar must keep the hand-painted multicolor treatment",
    );
    assert.match(
      css,
      /--dog-dopamine-header:\s*linear-gradient\([^;]*#ffd84a[^;]*#ff8a3d[^;]*#ff5b49[^;]*#a86be8[^;]*\);/s,
      "the header palette must progress from yellow through orange and coral to purple",
    );
    assert.doesNotMatch(
      css,
      /--dog-dopamine-header:[^;]*(?:#2ab1c5|#67d1df|#8eddea|var\(--dog-blue\)|var\(--dog-cyan\))/s,
      "the dopamine header must not contain cyan paint",
    );
    assert.match(
      css,
      /happy-coding-dog[^{}]*dream-skin-home-shell[^{}]*\.dream-skin-brand[^{}]*\{[^}]*background:\s*var\(--dog-cream\)[^}]*border:\s*3px solid var\(--dog-coral\)/s,
      "the home brand must read as a warm cream-and-coral sticker",
    );
    assert.match(
      css,
      /happy-coding-dog[^{}]*dream-skin-home-shell[^{}]*\.dream-skin-status[^{}]*\{[^}]*background:\s*var\(--dog-yellow\)[^}]*box-shadow:\s*3px 3px 0 var\(--dog-purple\)/s,
      "the online status must use yellow paint with a purple sticker shadow",
    );
    assert.match(
      css,
      /#codex-dream-skin-chrome\.dream-skin-home-shell::before[^{}]*\{[^}]*background:\s*transparent\s*!important/s,
      "the removed home cover must stay transparent",
    );
  });

  it("uses the edge-blended animal team artwork without canvas gutters", () => {
    const css = fs.readFileSync(path.resolve("assets/inject/dream-skin.css"), "utf8");
    const theme = JSON.parse(
      fs.readFileSync(path.resolve("assets/presets/happy-coding-dog/theme.json"), "utf8"),
    );

    assert.equal(theme.hero, "hero-workspace-blended.png");
    assert.match(
      css,
      /happy-coding-dog[^{}]*dream-skin-native-home-dog[^{}]*\{[^}]*object-fit:\s*cover\s*!important[^}]*object-position:\s*center\s*!important/s,
      "the workspace-specific artwork must fill the canvas without a side color block",
    );
    assert.match(
      css,
      /happy-coding-dog[^{}]*dream-skin-happy-home-canvas[^{}]*\{[^}]*scrollbar-gutter:\s*auto\s*!important/s,
      "the home canvas must not reserve side gutters around the artwork",
    );
  });
});
