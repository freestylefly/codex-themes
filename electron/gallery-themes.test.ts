import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  ThemeEntitlement,
  ThemeProduct,
  ThemeSource,
  ThemeSummary,
} from "../electron/shared/types";
import { mergeGalleryThemes } from "../src/galleryThemes";

function localTheme(id: string, source: ThemeSource): ThemeSummary {
  return {
    id,
    uuid: `${source}-${id}`,
    name: "蓝窗信使 Blue Window",
    tagline: "蓝窗主题",
    description: "测试主题",
    version: "2.4.0",
    layout: "retro-messenger",
    source,
    readOnly: true,
    valid: true,
    signed: false,
    minEngineVersion: "2.0.0",
    dir: `/themes/${source}/${id}`,
    previewUrl: `theme-image://${source}/${id}/preview.png`,
    colors: {
      background: "#eaf6ff",
      panel: "#ffffff",
      panelAlt: "#e4f2fc",
      surface: "#ffffff",
      text: "#173b61",
      muted: "#607e98",
      border: "#2876c8",
      accent: "#2876c8",
      accentAlt: "#73b9ed",
      secondary: "#4e9be0",
      highlight: "#f3b735",
    },
  };
}

function catalogProduct(id: string): ThemeProduct {
  return {
    id,
    name: "蓝窗信使 Blue Window",
    tagline: "蓝窗主题",
    description: "测试主题",
    version: "2.4.0",
    layout: "retro-messenger",
    previewUrl: `https://example.com/${id}.png`,
    priceCents: 990,
    pricePoints: 99,
    minEngineVersion: "2.0.0",
    published: true,
    origin: "official",
    authorId: null,
    author: null,
    unlockCount: 1,
    downloadsEnabled: true,
    publishedAt: "2026-07-24T00:00:00.000Z",
  };
}

function entitlement(themeId: string): ThemeEntitlement {
  return {
    themeId,
    themeName: "蓝窗信使 Blue Window",
    version: "2.4.0",
    status: "active",
    createdAt: "2026-07-24T00:00:00.000Z",
    acquisitionType: "points",
  };
}

describe("mergeGalleryThemes", () => {
  it("collapses bundled and purchased copies before the catalog loads", () => {
    const merged = mergeGalleryThemes(
      [
        localTheme("blue-window-messenger", "preset"),
        localTheme("blue-window-messenger", "purchased"),
      ],
      [],
      [entitlement("blue-window-messenger")],
    );

    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.id, "blue-window-messenger");
    assert.equal(merged[0]?.source, "purchased");
    assert.equal(merged[0]?.local?.source, "purchased");
    assert.ok(merged[0]?.entitlement);
  });

  it("keeps one purchased card after the catalog loads", () => {
    const merged = mergeGalleryThemes(
      [
        localTheme("blue-window-messenger", "purchased"),
        localTheme("blue-window-messenger", "preset"),
      ],
      [catalogProduct("blue-window-messenger")],
      [entitlement("blue-window-messenger")],
    );

    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.source, "purchased");
    assert.equal(merged[0]?.product?.id, "blue-window-messenger");
    assert.equal(merged[0]?.local?.source, "purchased");
  });

  it("retains unrelated local themes", () => {
    const merged = mergeGalleryThemes(
      [
        localTheme("blue-window-messenger", "preset"),
        localTheme("my-theme", "custom"),
      ],
      [catalogProduct("blue-window-messenger")],
      [],
    );

    assert.deepEqual(merged.map((theme) => theme.id), [
      "blue-window-messenger",
      "my-theme",
    ]);
  });
});
