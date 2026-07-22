import { defaultNormalizedTheme } from "../electron/engine/normalize";
import type { LoadedThemeDraft, NormalizedTheme } from "../electron/shared/types";

/** Convert an editor/load draft into the normalized shape used by previews. */
export function previewThemeFromLoadedDraft(loaded: LoadedThemeDraft): NormalizedTheme {
  const base = defaultNormalizedTheme();
  const draft = loaded.draft;
  return {
    ...base,
    id: loaded.editingId,
    uuid: draft.uuid ?? base.uuid,
    name: draft.name || base.name,
    description: draft.description,
    tagline: draft.tagline || base.tagline,
    tags: draft.tags,
    layout: draft.layout,
    light: draft.palettes?.light ?? base.light,
    dark: draft.palettes?.dark ?? base.dark,
    hero: {
      fit: draft.heroFit,
      focusX: draft.heroFocusX,
      focusY: draft.heroFocusY,
      zoom: draft.heroZoom,
      height: draft.heroHeight,
      textAlign: draft.heroTextAlign,
      scrim: draft.heroScrim,
    },
    wallpaper: {
      enabled: draft.wallpaperEnabled,
      focusX: draft.wallpaperFocusX,
      focusY: draft.wallpaperFocusY,
      opacity: draft.wallpaperOpacity,
      blur: draft.wallpaperBlur,
    },
    appearance: {
      radius: draft.radius,
      density: draft.density,
      fontPreset: draft.fontPreset,
      glass: draft.glass,
      shadow: draft.shadow,
      decoration: draft.decoration,
    },
    effects: draft.effects,
    copy: draft.copy,
  };
}
