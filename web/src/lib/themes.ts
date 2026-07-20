import type { ImageMetadata } from "astro";

interface ThemeManifest {
  id: string;
  name: string;
  description: string;
  tagline: string;
  version: string;
  tags?: string[];
  layout: string;
}

export interface WebTheme {
  id: string;
  name: string;
  description: string;
  tagline: string;
  version: string;
  tags: string[];
  layout: string;
  preview: ImageMetadata;
  deepLink: string;
}

const manifestModules = import.meta.glob<{ default: ThemeManifest }>(
  "../../../assets/presets/*/theme.json",
  { eager: true },
);

const previewModules = import.meta.glob<{ default: ImageMetadata }>(
  "../../../assets/presets/*/preview.png",
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

export const themes: WebTheme[] = Object.entries(manifestModules)
  .map(([file, module]) => {
    const folderId = themeIdFromPath(file);
    const manifest = module.default;
    const preview = folderId ? previewById.get(folderId) : undefined;
    if (!folderId || manifest.id !== folderId || !preview) {
      throw new Error(`Invalid web theme source: ${file}`);
    }
    return {
      id: manifest.id,
      name: manifest.name,
      description: manifest.description,
      tagline: manifest.tagline,
      version: manifest.version,
      tags: manifest.tags ?? [],
      layout: manifest.layout,
      preview,
      deepLink: `codexthemes://theme/${encodeURIComponent(manifest.id)}`,
    };
  })
  .sort((a, b) => {
    if (a.id === "blue-window-messenger") return -1;
    if (b.id === "blue-window-messenger") return 1;
    return a.name.localeCompare(b.name, "zh-CN");
  });

if (themes.length !== 11 || new Set(themes.map((theme) => theme.id)).size !== themes.length) {
  throw new Error(`Expected 11 unique built-in themes, received ${themes.length}.`);
}

export function getTheme(id: string): WebTheme | undefined {
  return themes.find((theme) => theme.id === id);
}
