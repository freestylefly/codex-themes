/**
 * Unit tests for the theme normalizer and compiler.
 * Run with: node --test dist/engine/theme.test.js (after build)
 * Or during dev via a tsx runner if available.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
});
