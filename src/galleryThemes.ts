import type {
  CommerceThemeSummary,
  ThemeEntitlement,
  ThemeProduct,
  ThemeSummary,
} from "../electron/shared/types";

/**
 * Curated gallery order: presets with original character or scene artwork and
 * richer, high-resolution previews define the gallery. Palette-only bundled
 * presets are filtered by the main process using theme metadata.
 */
const FEATURED_PRESET_IDS = [
  "moonlit-immortal",
  "blue-window-messenger",
  "mirror-lake-ribbon",
  "shanhai-nexus",
  "starcap-teemo",
  "neon-star-hunter",
  "mecha-cat-studio",
  "potion-workshop",
  "focus-capybara",
  "hacker-zero",
] as const;

const FEATURED_PRESET_RANK = new Map<string, number>(
  FEATURED_PRESET_IDS.map((id, index) => [id, index]),
);

const SOURCE_PRIORITY: Record<ThemeSummary["source"], number> = {
  preset: 0,
  imported: 1,
  custom: 2,
  purchased: 3,
};

function rankFor(theme: ThemeSummary): number {
  return FEATURED_PRESET_RANK.get(theme.id) ?? Number.MAX_SAFE_INTEGER;
}

function galleryOrder(items: CommerceThemeSummary[]): CommerceThemeSummary[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftHasPreview = Boolean(left.item.previewUrl);
      const rightHasPreview = Boolean(right.item.previewUrl);
      if (leftHasPreview !== rightHasPreview) return rightHasPreview ? 1 : -1;

      const leftRank = rankFor(left.item);
      const rightRank = rankFor(right.item);
      if (leftRank !== rightRank) return leftRank - rightRank;

      return left.index - right.index;
    })
    .map(({ item }) => item);
}

function preferredLocal(current: ThemeSummary | undefined, candidate: ThemeSummary): ThemeSummary {
  if (!current) return candidate;
  if (current.valid !== candidate.valid) return candidate.valid ? candidate : current;
  return SOURCE_PRIORITY[candidate.source] > SOURCE_PRIORITY[current.source] ? candidate : current;
}

/**
 * Merge the async marketplace catalog with the local theme library.
 *
 * The local library intentionally exposes both a bundled preview and a
 * downloaded purchase when they share an id. The gallery must collapse those
 * records even before the remote catalog finishes loading, otherwise a theme
 * briefly appears twice and may jump when the catalog response arrives.
 */
export function mergeGalleryThemes(
  themes: ThemeSummary[],
  catalog: ThemeProduct[],
  entitlements: ThemeEntitlement[],
): CommerceThemeSummary[] {
  const entitlementMap = new Map(entitlements.map((entitlement) => [entitlement.themeId, entitlement]));
  const localMap = new Map<string, ThemeSummary>();
  for (const theme of themes) {
    localMap.set(theme.id, preferredLocal(localMap.get(theme.id), theme));
  }

  const productMap = new Map(catalog.map((product) => [product.id, product]));
  const fromProducts: CommerceThemeSummary[] = [...productMap.values()].map((product) => {
    const local = localMap.get(product.id);
    const entitlement = entitlementMap.get(product.id);
    return {
      ...product,
      id: product.id,
      uuid: local?.uuid ?? product.id,
      name: product.name,
      tagline: product.tagline,
      description: product.description,
      version: local?.version ?? product.version,
      layout: product.layout,
      source: local?.source ?? (entitlement ? "purchased" : "preset"),
      readOnly: true,
      valid: true,
      signed: false,
      minEngineVersion: product.minEngineVersion,
      dir: local?.dir ?? "",
      previewUrl: local?.previewUrl ?? product.previewUrl,
      colors: local?.colors ?? {
        background: "#141518",
        panel: "#1e1f23",
        panelAlt: "#25262b",
        surface: "#1e1f23",
        text: "#e8e8e8",
        muted: "#9ca3af",
        border: "#2f3036",
        accent: "#60a5fa",
        accentAlt: "#93c5fd",
        secondary: "#a78bfa",
        highlight: "#fbbf24",
      },
      product,
      entitlement,
      local,
    };
  });

  const fromLocals: CommerceThemeSummary[] = [...localMap.values()]
    .filter((theme) => !productMap.has(theme.id))
    .map((theme) => ({
      ...theme,
      product: undefined,
      entitlement: entitlementMap.get(theme.id),
      local: theme,
    }));

  return galleryOrder([...fromProducts, ...fromLocals]);
}
