import type { ImageMetadata } from "astro";

interface ThemeManifest {
  id: string;
  name: string;
  description: string;
  tagline: string;
  version: string;
  galleryVisible?: boolean;
  tags?: string[];
  layout: string;
  wallpaper?: string;
  wallpaperFocusX?: number;
  wallpaperFocusY?: number;
  priceCents?: number;
}

export interface WebTheme {
  id: string;
  name: string;
  description: string;
  tagline: string;
  version: string;
  galleryVisible: boolean;
  tags: string[];
  layout: string;
  preview: ImageMetadata;
  backdrop: ImageMetadata;
  backdropFocus: { x: number; y: number };
  hasBackdropArtwork: boolean;
  deepLink: string;
  priceCents?: number;
  isPaid: boolean;
}

const manifestModules = import.meta.glob<{ default: ThemeManifest }>(
  "../../../assets/presets/*/theme.json",
  { eager: true },
);

const previewModules = import.meta.glob<{ default: ImageMetadata }>(
  "../../../assets/presets/*/preview.png",
  { eager: true },
);

const heroModules = import.meta.glob<{ default: ImageMetadata }>(
  "../../../assets/presets/*/hero.png",
  { eager: true },
);

const wallpaperModules = import.meta.glob<{ default: ImageMetadata }>(
  "../../../assets/presets/*/wallpaper.png",
  { eager: true },
);

function themeIdFromPath(file: string): string | null {
  return file.match(/\/assets\/presets\/([^/]+)\//)?.[1] ?? null;
}

const previewById = new Map(
  Object.entries(previewModules)
    .map(([file, module]) => [themeIdFromPath(file), module.default] as const)
    .filter((entry): entry is [string, ImageMetadata] => Boolean(entry[0])),
);

const backdropByPath = new Map(
  Object.entries({ ...heroModules, ...wallpaperModules }).map(([file, module]) => {
    const id = themeIdFromPath(file);
    const filename = file.split("/").at(-1);
    return [`${id}/${filename}`, module.default] as const;
  }),
);

const allThemes: WebTheme[] = Object.entries(manifestModules)
  .map(([file, module]) => {
    const folderId = themeIdFromPath(file);
    const manifest = module.default;
    const preview = folderId ? previewById.get(folderId) : undefined;
    if (!folderId || manifest.id !== folderId || !preview) {
      throw new Error(`Invalid web theme source: ${file}`);
    }
    const backdropFilename = manifest.wallpaper ?? "hero.png";
    const backdropArtwork = backdropByPath.get(`${folderId}/${backdropFilename}`);
    return {
      id: manifest.id,
      name: manifest.name,
      description: manifest.description,
      tagline: manifest.tagline,
      version: manifest.version,
      galleryVisible: manifest.galleryVisible !== false,
      tags: manifest.tags ?? [],
      layout: manifest.layout,
      preview,
      backdrop: backdropArtwork ?? preview,
      backdropFocus: {
        x: manifest.wallpaperFocusX ?? 0.5,
        y: manifest.wallpaperFocusY ?? 0.5,
      },
      hasBackdropArtwork: Boolean(backdropArtwork),
      deepLink: `codexthemes://theme/${encodeURIComponent(manifest.id)}`,
      priceCents: manifest.priceCents,
      isPaid: typeof manifest.priceCents === "number" && manifest.priceCents > 0,
    };
  })
  .sort((a, b) => {
    const featuredOrder = [
      "moonlit-immortal",
      "blue-window-messenger",
      "mirror-lake-ribbon",
      "starcap-teemo",
      "shanhai-nexus",
      "neon-star-hunter",
      "mecha-cat-studio",
      "hacker-zero",
      "potion-workshop",
      "focus-capybara",
    ];
    const aFeatured = featuredOrder.indexOf(a.id);
    const bFeatured = featuredOrder.indexOf(b.id);
    if (aFeatured !== -1 || bFeatured !== -1) {
      if (aFeatured === -1) return 1;
      if (bFeatured === -1) return -1;
      return aFeatured - bFeatured;
    }
    return a.name.localeCompare(b.name, "zh-CN");
  });

if (allThemes.length !== 20 || new Set(allThemes.map((theme) => theme.id)).size !== allThemes.length) {
  throw new Error(`Expected 20 unique built-in themes, received ${allThemes.length}.`);
}

export const themes = allThemes.filter((theme) => theme.galleryVisible);

export function getTheme(id: string): WebTheme | undefined {
  return themes.find((theme) => theme.id === id);
}
