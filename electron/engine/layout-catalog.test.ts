import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { LAYOUT_KINDS, type ThemeSummary } from "../shared/types";
import {
  findLayoutPreviewTheme,
  getLayoutCatalogItem,
  LAYOUT_CATALOG,
} from "../../src/layoutCatalog";

function summary(
  id: string,
  layout: ThemeSummary["layout"],
  valid = true,
  previewUrl = `theme-image://${id}/preview.png`,
): ThemeSummary {
  return {
    id,
    uuid: `${id}-uuid`,
    name: id,
    tagline: "",
    description: "",
    version: "1.0.0",
    layout,
    source: "preset",
    readOnly: true,
    valid,
    signed: false,
    minEngineVersion: "1.0.0",
    dir: `/themes/${id}`,
    previewUrl,
    colors: {
      background: "#000000",
      panel: "#111111",
      panelAlt: "#222222",
      surface: "#111111",
      text: "#ffffff",
      muted: "#aaaaaa",
      border: "#333333",
      accent: "#e8b04b",
      accentAlt: "#f3c471",
      secondary: "#888888",
      highlight: "#ffffff",
    },
  };
}

describe("layout catalog", () => {
  it("marks every palette-only bundled preset as hidden from galleries", () => {
    const presetsRoot = path.resolve("assets", "presets");
    for (const id of fs.readdirSync(presetsRoot)) {
      const manifestPath = path.join(presetsRoot, id, "theme.json");
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
        hero?: string;
        galleryVisible?: boolean;
      };
      const isPaletteOnly = manifest.hero === "background.png";
      assert.equal(
        manifest.galleryVisible !== false,
        !isPaletteOnly,
        `${id} gallery visibility should match whether it has real artwork`,
      );
    }
  });

  it("covers every LayoutKind exactly once and in canonical order", () => {
    const ids = LAYOUT_CATALOG.map((item) => item.id);
    assert.deepEqual(ids, [...LAYOUT_KINDS]);
    assert.equal(new Set(ids).size, LAYOUT_KINDS.length);
  });

  it("uses a unique representative preset with a real preview", () => {
    const representativeIds = LAYOUT_CATALOG.map((item) => item.representativeThemeId);
    assert.equal(new Set(representativeIds).size, representativeIds.length);

    for (const item of LAYOUT_CATALOG) {
      const previewPath = path.resolve("assets", "presets", item.representativeThemeId, "preview.png");
      assert.ok(fs.existsSync(previewPath), `${item.id} is missing ${previewPath}`);

      const themeJson = JSON.parse(
        fs.readFileSync(path.resolve("assets", "presets", item.representativeThemeId, "theme.json"), "utf8"),
      ) as { layout?: string };
      assert.equal(themeJson.layout, item.id, `${item.representativeThemeId} should represent ${item.id}`);
    }
  });

  it("falls back to the first valid theme with the same layout", () => {
    const item = getLayoutCatalogItem("full-canvas");
    const invalidRepresentative = summary(item.representativeThemeId, item.id, false);
    const wrongLayout = summary("wrong-layout", "paper-board");
    const fallback = summary("full-canvas-fallback", item.id);

    assert.equal(
      findLayoutPreviewTheme(item, [invalidRepresentative, wrongLayout, fallback]),
      fallback,
    );
    assert.equal(findLayoutPreviewTheme(item, [invalidRepresentative, wrongLayout]), undefined);
  });
});
