/**
 * Local theme library: bundled presets + user themes on disk.
 * Supports schema v1 (legacy) and schema v2 (structured); both are normalized
 * to NormalizedTheme before being used by the engine or renderer.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import AdmZip from "adm-zip";
import { nativeImage } from "electron";
import type {
  CustomThemeInput,
  InspectedThemePackage,
  ThemeConfigV2,
  ThemeDraftInput,
  ThemeSource,
  ThemeSummary,
} from "../shared/types";
import type { NormalizedTheme } from "../shared/types";
import { loadTheme } from "../engine/payload";
import { normalizeTheme, validateContrast, deriveDarkPalette } from "../engine/normalize";
import { compileTheme } from "../engine/compiler";
import { IMAGE_EXTENSIONS, MAX_ART_BYTES, SKIN_VERSION, PREVIEW_WIDTH, PREVIEW_HEIGHT } from "../engine/constants";
import {
  MAX_IMAGE_SIDE,
  MAX_PACKAGE_BYTES,
  MAX_PACKAGE_FILES,
  MAX_TOTAL_IMAGE_BYTES,
  MAX_UNPACKED_BYTES,
  isAllowedPackageEntry,
  isAnimatedImage,
  isImageEntry,
  isUnsafeEntryPath,
} from "../engine/package-safety";
import { deriveShellColors } from "../shared/tone";

const INSPECT_DIR_PREFIX = "codex-theme-inspect-";
/** Stale inspect dirs older than this are removed on the next scan. */
const INSPECT_DIR_TTL_MS = 24 * 60 * 60 * 1000;

export interface StorePaths {
  presetsRoot: string;
  userThemesRoot: string;
  purchasedThemesRoot?: string;
}

const HEX_RE = /^#[0-9a-f]{6}$/i;

function validateHex(value: string, name: string): string {
  if (!HEX_RE.test(value)) throw new Error(`${name} must be a six-digit hex color.`);
  return value.toLowerCase();
}

async function atomicWrite(file: string, value: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, value, { mode: 0o600 });
    await fs.rename(temporary, file);
    await fs.chmod(file, 0o600);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

function sanitizeId(id: string): string {
  return path.basename(id).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);
}

function newUuid(): string {
  return crypto.randomUUID();
}

function paletteFromV1Colors(colors: {
  accent: string;
  accentAlt: string;
  secondary: string;
  highlight: string;
}): {
  light: ThemeConfigV2["light"];
  dark: ThemeConfigV2["dark"];
} {
  const shell = deriveShellColors(colors.accent);
  const light: ThemeConfigV2["light"] = {
    background: shell.background,
    panel: shell.panel,
    panelAlt: shell.panelAlt,
    surface: shell.panel,
    text: shell.text,
    muted: shell.muted,
    border: shell.line,
    accent: colors.accent,
    accentAlt: colors.accentAlt,
    secondary: colors.secondary,
    highlight: colors.highlight,
  };
  const { theme } = normalizeTheme({
    schemaVersion: 2,
    uuid: "temp",
    id: "temp",
    version: "1.0.0",
    minEngineVersion: "1.0.0",
    name: "temp",
    description: "",
    tagline: "",
    tags: [],
    hero: "hero.png",
    light,
    layout: "dream-banner",
    heroFit: "cover",
    heroFocusX: 0.5,
    heroFocusY: 0.5,
    heroZoom: 1,
    heroHeight: 252,
    heroTextAlign: "left",
    heroScrim: 0.62,
    wallpaperEnabled: false,
    wallpaperFocusX: 0.5,
    wallpaperFocusY: 0.5,
    wallpaperOpacity: 0.15,
    wallpaperBlur: 0,
    radius: "lg",
    density: "normal",
    fontPreset: "system",
    glass: false,
    shadow: "lg",
    decoration: 0.8,
    effects: {},
    brandSubtitle: "CODEX THEMES",
    projectPrefix: "选择项目 · ",
    projectLabel: "◉  选择项目",
    statusText: "THEME ONLINE",
    quote: "MAKE SOMETHING WONDERFUL",
  } as ThemeConfigV2);
  return { light, dark: theme.dark };
}

export class ThemeStore {
  constructor(private paths: StorePaths) {}

  get userThemesRoot(): string {
    return this.paths.userThemesRoot;
  }

  /** Scan preset + user + purchased roots; invalid themes are skipped with a warning. */
  async listThemes(): Promise<ThemeSummary[]> {
    const out: ThemeSummary[] = [];
    const roots: [ThemeSource, string][] = [
      ["preset", this.paths.presetsRoot],
      ["custom", this.paths.userThemesRoot],
    ];
    if (this.paths.purchasedThemesRoot) {
      roots.push(["purchased", this.paths.purchasedThemesRoot]);
    }
    for (const [source, root] of roots) {
      let entries: string[] = [];
      try {
        entries = await fs.readdir(root);
      } catch {
        continue;
      }
      for (const entry of entries.sort()) {
        if (entry.startsWith(".")) continue; // staging/backup/inspect leftovers
        const dir = path.join(root, entry);
        try {
          const stat = await fs.stat(dir);
          if (!stat.isDirectory()) continue;
          if (source === "preset" && !(await isPresetGalleryVisible(dir))) continue;
          const loaded = await loadTheme(dir);
          const meta = await readSidecarMeta(dir);
          // Historical market themes are treated as imported; purchased roots stay purchased.
          const resolvedSource: ThemeSource =
            source === "purchased" ? "purchased" : meta?.author ? "imported" : source;
          out.push(themeSummaryFromLoaded(loaded, resolvedSource, dir, meta));
        } catch (error) {
          // skip invalid theme dirs silently
          console.warn(`Skipping invalid theme dir ${dir}:`, (error as Error).message);
        }
      }
    }
    return out;
  }

  /** Resolve a theme id to its directory (presets win on collision). */
  async resolveThemeDir(id: string): Promise<string | null> {
    const roots = [this.paths.presetsRoot, this.paths.userThemesRoot];
    if (this.paths.purchasedThemesRoot) roots.push(this.paths.purchasedThemesRoot);
    for (const root of roots) {
      let entries: string[] = [];
      try {
        entries = await fs.readdir(root);
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.startsWith(".")) continue;
        const dir = path.join(root, entry);
        try {
          const loaded = await loadTheme(dir);
          if (loaded.theme.id === id) return dir;
        } catch {
          // ignore invalid dirs
        }
      }
    }
    return null;
  }

  /** Resolve a theme-image:// URL path to a real file, confined to theme roots. */
  async resolveImageFile(id: string, filename: string): Promise<string | null> {
    if (path.basename(filename) !== filename) return null;
    const dir = await this.resolveThemeDir(id);
    if (!dir) return null;
    const file = path.join(dir, filename);
    const extension = path.extname(filename).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) return null;
    try {
      const stat = await fs.stat(file);
      return stat.isFile() ? file : null;
    } catch {
      return null;
    }
  }

  /** Legacy v1 save path: simple editor. Writes a v2 theme.json. */
  async saveCustomTheme(input: CustomThemeInput): Promise<ThemeSummary> {
    const imageExt = path.extname(input.imagePath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(imageExt)) {
      throw new Error("image must be a PNG, JPEG, or WebP file.");
    }
    const imageStat = await fs.stat(input.imagePath);
    if (!imageStat.isFile() || imageStat.size < 1 || imageStat.size > MAX_ART_BYTES) {
      throw new Error("The theme image must be non-empty and no larger than 16 MB.");
    }

    const accent = validateHex(input.colors.accent, "accent");
    const accentAlt = HEX_RE.test(input.colors.accentAlt ?? "")
      ? input.colors.accentAlt!.toLowerCase()
      : accent;
    const secondary = validateHex(input.colors.secondary, "secondary");
    const highlight = validateHex(input.colors.highlight, "highlight");

    const { light, dark } = paletteFromV1Colors({ accent, accentAlt, secondary, highlight });

    const id = `custom-${Date.now()}`;
    const heroName = `hero${imageExt}`;
    const theme: ThemeConfigV2 = {
      schemaVersion: 2,
      uuid: newUuid(),
      id,
      version: "1.0.0",
      minEngineVersion: SKIN_VERSION,
      name: (input.name || "").trim().slice(0, 80) || "我的 Codex 主题",
      description: (input.tagline || "").trim().slice(0, 160),
      tagline: (input.tagline || "").trim().slice(0, 160) || "把喜欢的画面变成可交互的 Codex 工作台。",
      tags: [],
      hero: heroName,
      light,
      dark,
      layout: "dream-banner",
      heroFit: "cover",
      heroFocusX: 0.62,
      heroFocusY: 0.24,
      heroZoom: 1,
      heroHeight: 252,
      heroTextAlign: "left",
      heroScrim: 0.62,
      wallpaperEnabled: false,
      wallpaperFocusX: 0.5,
      wallpaperFocusY: 0.5,
      wallpaperOpacity: 0.15,
      wallpaperBlur: 0,
      radius: "lg",
      density: "normal",
      fontPreset: "system",
      glass: false,
      shadow: "lg",
      decoration: 0.8,
      effects: {},
      brandSubtitle: "CODEX THEMES",
      projectPrefix: "选择项目 · ",
      projectLabel: "◉  选择项目",
      statusText: (input.statusText || "").trim().slice(0, 80) || "THEME ONLINE",
      quote: (input.quote || "").trim().slice(0, 80) || "MAKE SOMETHING WONDERFUL",
    };

    const dir = path.join(this.paths.userThemesRoot, id);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    await fs.copyFile(input.imagePath, path.join(dir, heroName));
    await atomicWrite(path.join(dir, "theme.json"), `${JSON.stringify(theme, null, 2)}\n`);

    const loaded = await loadTheme(dir);
    return themeSummaryFromLoaded(loaded, "custom", dir, null);
  }

  /** v2 studio: save a draft. */
  async saveThemeDraft(input: ThemeDraftInput): Promise<ThemeSummary> {
    return this.writeV2Theme(input, newUuid(), "custom");
  }

  /** v2 studio: update an existing custom theme. */
  async updateTheme(id: string, input: ThemeDraftInput): Promise<ThemeSummary> {
    const dir = await this.resolveThemeDir(id);
    if (!dir) throw new Error("Theme not found.");
    const existing = await loadTheme(dir);
    if (dir.startsWith(this.paths.presetsRoot)) throw new Error("Built-in presets are read-only.");
    return this.writeV2Theme(input, existing.theme.uuid, "custom", dir);
  }

  /**
   * Load a saved theme back into editor form. Image paths are absolute paths
   * into the theme directory; the caller keeps `editingId` so updateTheme()
   * writes back in place and the ID/UUID stay stable.
   */
  async loadThemeDraft(id: string): Promise<{
    editingId: string;
    source: ThemeSource;
    draft: ThemeDraftInput;
    heroImagePath: string;
    wallpaperImagePath: string | null;
    stampImagePath: string | null;
  }> {
    const dir = await this.resolveThemeDir(id);
    if (!dir) throw new Error("Theme not found.");
    const loaded = await loadTheme(dir);
    const theme = loaded.theme;
    const meta = await readSidecarMeta(dir);
    const source: ThemeSource = dir.startsWith(this.paths.presetsRoot)
      ? "preset"
      : meta?.author
        ? "imported"
        : "custom";

    let wallpaperImagePath: string | null = null;
    if (theme.resources.wallpaper) {
      const candidate = path.join(dir, path.basename(theme.resources.wallpaper));
      const stat = await fs.stat(candidate).catch(() => null);
      if (stat?.isFile()) wallpaperImagePath = candidate;
    }

    let stampImagePath: string | null = null;
    if (theme.resources.stamp) {
      const candidate = path.join(dir, path.basename(theme.resources.stamp));
      const stat = await fs.stat(candidate).catch(() => null);
      if (stat?.isFile()) stampImagePath = candidate;
    }

    const draft: ThemeDraftInput = {
      uuid: theme.uuid,
      name: theme.name,
      description: theme.description,
      tagline: theme.tagline,
      tags: theme.tags,
      layout: theme.layout,
      colors: {
        accent: theme.light.accent,
        accentAlt: theme.light.accentAlt,
        secondary: theme.light.secondary,
        highlight: theme.light.highlight,
      },
      heroFit: theme.hero.fit,
      heroFocusX: theme.hero.focusX,
      heroFocusY: theme.hero.focusY,
      heroZoom: theme.hero.zoom,
      heroHeight: theme.hero.height,
      heroTextAlign: theme.hero.textAlign,
      heroScrim: theme.hero.scrim,
      wallpaperEnabled: theme.wallpaper.enabled,
      wallpaperFocusX: theme.wallpaper.focusX,
      wallpaperFocusY: theme.wallpaper.focusY,
      wallpaperOpacity: theme.wallpaper.opacity,
      wallpaperBlur: theme.wallpaper.blur,
      radius: theme.appearance.radius,
      density: theme.appearance.density,
      fontPreset: theme.appearance.fontPreset,
      glass: theme.appearance.glass,
      shadow: theme.appearance.shadow,
      decoration: theme.appearance.decoration,
      effects: theme.effects,
      copy: theme.copy,
      heroImagePath: loaded.imagePath,
      wallpaperImagePath: wallpaperImagePath ?? undefined,
      stampImagePath: stampImagePath ?? undefined,
      palettes: { light: theme.light, dark: theme.dark },
    };

    return { editingId: theme.id, source, draft, heroImagePath: loaded.imagePath, wallpaperImagePath, stampImagePath };
  }

  /** Duplicate any theme, generating a new UUID and id. */
  async duplicateTheme(id: string): Promise<ThemeSummary> {
    const dir = await this.resolveThemeDir(id);
    if (!dir) throw new Error("Theme not found.");
    const loaded = await loadTheme(dir);
    const newId = `${loaded.theme.id}-copy-${Date.now()}`;
    const newTheme: NormalizedTheme = {
      ...loaded.theme,
      uuid: newUuid(),
      id: newId,
      version: loaded.theme.version,
      name: `${loaded.theme.name} (副本)`,
    };

    const targetDir = path.join(this.paths.userThemesRoot, sanitizeId(newId));
    await fs.mkdir(targetDir, { recursive: true, mode: 0o700 });

    // Copy all bare files from the source dir.
    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      if (entry === ".market-meta.json") continue;
      const src = path.join(dir, entry);
      const stat = await fs.stat(src);
      if (stat.isFile()) await fs.copyFile(src, path.join(targetDir, entry));
    }

    const config: ThemeConfigV2 = denormalizeToV2(newTheme);
    await atomicWrite(path.join(targetDir, "theme.json"), `${JSON.stringify(config, null, 2)}\n`);

    const reloaded = await loadTheme(targetDir);
    return themeSummaryFromLoaded(reloaded, "custom", targetDir, null);
  }

  /** Delete a user theme. Presets are read-only. */
  async deleteTheme(id: string): Promise<void> {
    const dir = path.join(this.paths.userThemesRoot, path.basename(id));
    const realRoot = await fs.realpath(this.paths.userThemesRoot).catch(() => null);
    const realDir = await fs.realpath(dir).catch(() => null);
    if (!realRoot || !realDir || !realDir.startsWith(realRoot + path.sep)) {
      throw new Error("Theme not found in the user library.");
    }
    await fs.rm(realDir, { recursive: true, force: true });
  }

  /**
   * Extract a .codextheme zip to a system-temp dir and inspect it (no
   * install). Enforces the §11.3 package limits before anything is written:
   * package/unpacked size, file count, root-only whitelist, no traversal or
   * symlinks, static images only.
   */
  async inspectThemePackage(zipPath: string): Promise<InspectedThemePackage> {
    await this.cleanupStaleInspectDirs().catch(() => {});

    const zipStat = await fs.stat(zipPath);
    if (!zipStat.isFile() || zipStat.size > MAX_PACKAGE_BYTES) {
      throw new Error("主题包超过 24MB 上限。");
    }

    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries().filter((e) => !e.isDirectory);
    if (entries.length > MAX_PACKAGE_FILES) {
      throw new Error(`主题包文件数超过 ${MAX_PACKAGE_FILES} 个上限。`);
    }

    let unpackedBytes = 0;
    let imageBytes = 0;
    for (const entry of entries) {
      const name = entry.entryName;
      if (isUnsafeEntryPath(name)) {
        throw new Error(`主题包包含非法路径:${name}`);
      }
      const unixMode = (entry.attr >>> 16) & 0o170000;
      if (unixMode === 0o120000) {
        throw new Error(`主题包包含符号链接:${name}`);
      }
      if (!isAllowedPackageEntry(name)) {
        throw new Error(`主题包包含不允许的文件:${name}`);
      }
      unpackedBytes += entry.header.size;
      if (isImageEntry(name)) imageBytes += entry.header.size;
      if (unpackedBytes > MAX_UNPACKED_BYTES) {
        throw new Error("主题包解压后超过 32MB 上限。");
      }
    }
    if (imageBytes > MAX_TOTAL_IMAGE_BYTES) {
      throw new Error("主题包图片合计超过 20MB 上限。");
    }

    const jsonEntry = zip.getEntry("theme.json");
    if (!jsonEntry) throw new Error("Package is missing theme.json");
    const raw = JSON.parse(jsonEntry.getData().toString("utf8"));

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), INSPECT_DIR_PREFIX));
    try {
      for (const entry of entries) {
        const data = entry.getData();
        // header.size is only a claim; re-check the real bytes (zip bombs).
        if (data.length > MAX_UNPACKED_BYTES) {
          throw new Error(`主题包文件过大:${entry.entryName}`);
        }
        if (isImageEntry(entry.entryName)) {
          if (data.length > MAX_ART_BYTES) {
            throw new Error(`图片超过 16MB 上限:${entry.entryName}`);
          }
          if (isAnimatedImage(entry.entryName, data)) {
            throw new Error(`不允许动画图片:${entry.entryName}`);
          }
        }
        await fs.writeFile(path.join(tempDir, entry.entryName), data, { mode: 0o600 });
      }

      // Decode + dimension check on the extracted images.
      for (const entry of entries) {
        if (!isImageEntry(entry.entryName)) continue;
        const image = nativeImage.createFromPath(path.join(tempDir, entry.entryName));
        if (image.isEmpty()) throw new Error(`无法解码图片:${entry.entryName}`);
        const { width, height } = image.getSize();
        if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) {
          throw new Error(`图片边长超过 ${MAX_IMAGE_SIDE}px:${entry.entryName}`);
        }
      }

      const { warnings } = normalizeTheme(raw, { local: true });
      let canImport = true;
      try {
        const loaded = await loadTheme(tempDir);
        validateContrast(loaded.theme, true);
      } catch (error) {
        warnings.push((error as Error).message);
        canImport = false;
      }

      // Compute SHA-256 of the zip file.
      const hash = crypto.createHash("sha256");
      hash.update(await fs.readFile(zipPath));
      const sha256 = hash.digest("hex");

      const loaded = await loadTheme(tempDir);
      const summary = themeSummaryFromLoaded(loaded, "imported", tempDir, null);
      return { tempDir, summary, sha256, signatureStatus: "missing", warnings, canImport };
    } catch (error) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }

  /** Drop the temp dir of a cancelled/abandoned inspection. */
  async discardInspection(tempDir: string): Promise<void> {
    const resolved = await this.assertInspectDir(tempDir);
    if (resolved) await fs.rm(resolved, { recursive: true, force: true });
  }

  /** Remove leftover inspect dirs (crash, forced quit) past their TTL. */
  async cleanupStaleInspectDirs(): Promise<void> {
    const tmpRoot = os.tmpdir();
    const entries = await fs.readdir(tmpRoot).catch(() => [] as string[]);
    const now = Date.now();
    for (const entry of entries) {
      if (!entry.startsWith(INSPECT_DIR_PREFIX)) continue;
      const dir = path.join(tmpRoot, entry);
      const stat = await fs.stat(dir).catch(() => null);
      if (stat?.isDirectory() && now - stat.mtimeMs > INSPECT_DIR_TTL_MS) {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  /** Startup sweep: stale inspect dirs plus orphaned staging/backup dirs. */
  async cleanupWorkDirs(): Promise<void> {
    await this.cleanupStaleInspectDirs();
    const entries = await fs.readdir(this.paths.userThemesRoot).catch(() => [] as string[]);
    for (const entry of entries) {
      const dir = path.join(this.paths.userThemesRoot, entry);
      if (entry.startsWith(".backup-")) {
        // A crash between the two swap renames can leave the backup as the
        // only copy of a theme; restore it instead of deleting it.
        const id = entry.replace(/^\.backup-/, "").replace(/-\d+$/, "");
        const target = path.join(this.paths.userThemesRoot, id);
        const targetExists = await fs
          .stat(target)
          .then((s) => s.isDirectory())
          .catch(() => false);
        if (!targetExists && id) {
          await fs.rename(dir, target).catch(() => {});
          continue;
        }
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
        continue;
      }
      if (entry.startsWith(".staging-") || entry.startsWith(".inspect-")) {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  /** The renderer echoes tempDir back; only accept our own inspect dirs. */
  private async assertInspectDir(tempDir: string): Promise<string | null> {
    if (typeof tempDir !== "string" || !path.isAbsolute(tempDir)) {
      throw new Error("无效的预检目录。");
    }
    if (!path.basename(tempDir).startsWith(INSPECT_DIR_PREFIX)) {
      throw new Error("无效的预检目录。");
    }
    const realTmp = await fs.realpath(os.tmpdir()).catch(() => null);
    const real = await fs.realpath(tempDir).catch(() => null);
    if (!real) return null;
    if (!realTmp || path.dirname(real) !== realTmp) {
      throw new Error("无效的预检目录。");
    }
    return real;
  }

  /**
   * Install a package that has already been inspected. The new content is
   * fully staged and validated first, then swapped in with renames so a
   * failed install can never destroy an existing theme.
   */
  async importInspectedTheme(
    inspection: InspectedThemePackage,
    opts: { newId?: string; targetSource?: "custom" | "purchased" } = {},
  ): Promise<ThemeSummary> {
    const { summary } = inspection;
    const tempDir = await this.assertInspectDir(inspection.tempDir);
    if (!tempDir) throw new Error("预检目录已失效,请重新选择主题包。");
    const safeId = sanitizeId(opts.newId ?? summary.id);

    const targetSource = opts.targetSource ?? "custom";
    const baseDir =
      targetSource === "purchased" && this.paths.purchasedThemesRoot
        ? this.paths.purchasedThemesRoot
        : this.paths.userThemesRoot;
    const targetDir = path.join(baseDir, safeId);
    const stagingDir = path.join(baseDir, `.staging-${safeId}-${Date.now()}`);
    const backupDir = path.join(baseDir, `.backup-${safeId}-${Date.now()}`);

    try {
      await fs.mkdir(stagingDir, { recursive: true, mode: 0o700 });
      const entries = await fs.readdir(tempDir);
      for (const entry of entries) {
        if (entry.startsWith(".")) continue;
        const src = path.join(tempDir, entry);
        const stat = await fs.stat(src);
        if (stat.isFile()) await fs.copyFile(src, path.join(stagingDir, entry));
      }

      // Rewrite theme.json id when installing as a copy.
      if (opts.newId) {
        const configPath = path.join(stagingDir, "theme.json");
        const raw = JSON.parse(await fs.readFile(configPath, "utf8"));
        raw.id = safeId;
        if (raw.schemaVersion === 2) {
          raw.uuid = newUuid();
          raw.name = `${raw.name} (副本)`;
        }
        await atomicWrite(configPath, `${JSON.stringify(raw, null, 2)}\n`);
      }

      // The staged theme must load before we touch the existing one.
      await loadTheme(stagingDir);

      const hadExisting = await fs
        .stat(targetDir)
        .then((s) => s.isDirectory())
        .catch(() => false);
      if (hadExisting) await fs.rename(targetDir, backupDir);
      try {
        await fs.rename(stagingDir, targetDir);
      } catch (error) {
        if (hadExisting) await fs.rename(backupDir, targetDir).catch(() => {});
        throw error;
      }
      await fs.rm(backupDir, { recursive: true, force: true }).catch(() => {});
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

      const loaded = await loadTheme(targetDir);
      return themeSummaryFromLoaded(loaded, targetSource, targetDir, null);
    } finally {
      await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Legacy direct import (inspect + install in one step). */
  async importThemePackage(zipPath: string): Promise<ThemeSummary> {
    const inspected = await this.inspectThemePackage(zipPath);
    return this.importInspectedTheme(inspected);
  }

  /** Export a theme directory as a .codextheme zip package. */
  async exportThemePackage(id: string, outPath: string): Promise<string> {
    const dir = await this.resolveThemeDir(id);
    if (!dir) throw new Error("Theme not found.");
    const loaded = await loadTheme(dir);
    const config: ThemeConfigV2 = denormalizeToV2(loaded.theme);
    const zip = new AdmZip();
    zip.addFile("theme.json", Buffer.from(JSON.stringify(config, null, 2) + "\n", "utf8"));

    let previewBuffer: Buffer | null = null;
    if (!loaded.theme.resources.preview) {
      previewBuffer = renderPreviewPng(loaded.imagePath);
    }

    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      if (entry === "theme.json" || entry.startsWith(".")) continue;
      const file = path.join(dir, entry);
      const stat = await fs.stat(file);
      if (stat.isFile()) zip.addLocalFile(file, "", entry);
    }

    if (previewBuffer) {
      zip.addFile("preview.png", previewBuffer);
    }

    await fs.mkdir(path.dirname(outPath), { recursive: true });
    zip.writeZip(outPath);
    return outPath;
  }

  // ---------------------------------------------------------------- internal

  private async writeV2Theme(
    input: ThemeDraftInput,
    uuid: string,
    source: ThemeSource,
    existingDir?: string,
  ): Promise<ThemeSummary> {
    const heroExt = path.extname(input.heroImagePath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(heroExt)) {
      throw new Error("Hero image must be a PNG, JPEG, or WebP file.");
    }
    const heroStat = await fs.stat(input.heroImagePath);
    if (!heroStat.isFile() || heroStat.size < 1 || heroStat.size > MAX_ART_BYTES) {
      throw new Error("Hero image must be non-empty and no larger than 16 MB.");
    }

    const heroName = `hero${heroExt}`;
    const resources: { hero: string; wallpaper?: string; stamp?: string } = { hero: heroName };

    let wallpaperName: string | undefined;
    if (input.wallpaperImagePath) {
      const wpExt = path.extname(input.wallpaperImagePath).toLowerCase();
      if (IMAGE_EXTENSIONS.has(wpExt)) {
        const wpStat = await fs.stat(input.wallpaperImagePath);
        if (wpStat.isFile() && wpStat.size > 0 && wpStat.size <= MAX_ART_BYTES) {
          wallpaperName = `wallpaper${wpExt}`;
          resources.wallpaper = wallpaperName;
        }
      }
    }

    let stampName: string | undefined;
    if (input.stampImagePath) {
      const stampExt = path.extname(input.stampImagePath).toLowerCase();
      if (IMAGE_EXTENSIONS.has(stampExt)) {
        const stampStat = await fs.stat(input.stampImagePath);
        if (stampStat.isFile() && stampStat.size > 0 && stampStat.size <= MAX_ART_BYTES) {
          stampName = `stamp${stampExt}`;
          resources.stamp = stampName;
        }
      }
    }

    const theme: ThemeConfigV2 = {
      schemaVersion: 2,
      uuid,
      id: existingDir ? path.basename(existingDir) : `custom-${Date.now()}`,
      version: "1.0.0",
      minEngineVersion: SKIN_VERSION,
      name: input.name.trim().slice(0, 80) || "我的 Codex 主题",
      description: input.description.trim().slice(0, 160),
      tagline: input.tagline.trim().slice(0, 160) || "把喜欢的画面变成可交互的 Codex 工作台。",
      tags: input.tags.slice(0, 16),
      ...resources,
      light: input.palettes?.light ?? buildPalette(input.colors, "light"),
      dark: input.palettes?.dark ?? buildPalette(input.colors, "dark"),
      layout: input.layout,
      heroFit: input.heroFit,
      heroFocusX: input.heroFocusX,
      heroFocusY: input.heroFocusY,
      heroZoom: input.heroZoom,
      heroHeight: input.heroHeight,
      heroTextAlign: input.heroTextAlign,
      heroScrim: input.heroScrim,
      wallpaperEnabled: input.wallpaperEnabled,
      wallpaperFocusX: input.wallpaperFocusX,
      wallpaperFocusY: input.wallpaperFocusY,
      wallpaperOpacity: input.wallpaperOpacity,
      wallpaperBlur: input.wallpaperBlur,
      radius: input.radius,
      density: input.density,
      fontPreset: input.fontPreset,
      glass: input.glass,
      shadow: input.shadow,
      decoration: input.decoration,
      effects: {
        particles: input.effects.particles,
        aurora: input.effects.aurora,
        glow: input.effects.glow,
        noise: input.effects.noise,
        grid: input.effects.grid,
        float: input.effects.float,
      },
      brandSubtitle: input.copy.brandSubtitle.trim().slice(0, 80),
      projectPrefix: input.copy.projectPrefix.trim().slice(0, 80),
      projectLabel: input.copy.projectLabel.trim().slice(0, 80),
      statusText: input.copy.statusText.trim().slice(0, 80),
      quote: input.copy.quote.trim().slice(0, 80),
    };

    const dir = existingDir ?? path.join(this.paths.userThemesRoot, theme.id);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    // When editing in place the source may already be the target file;
    // fs.copyFile onto itself would truncate it.
    const heroDest = path.join(dir, heroName);
    if (path.resolve(input.heroImagePath) !== path.resolve(heroDest)) {
      await fs.copyFile(input.heroImagePath, heroDest);
    }
    if (wallpaperName && input.wallpaperImagePath) {
      const wallpaperDest = path.join(dir, wallpaperName);
      if (path.resolve(input.wallpaperImagePath) !== path.resolve(wallpaperDest)) {
        await fs.copyFile(input.wallpaperImagePath, wallpaperDest);
      }
    }
    if (stampName && input.stampImagePath) {
      const stampDest = path.join(dir, stampName);
      if (path.resolve(input.stampImagePath) !== path.resolve(stampDest)) {
        await fs.copyFile(input.stampImagePath, stampDest);
      }
    }
    await atomicWrite(path.join(dir, "theme.json"), `${JSON.stringify(theme, null, 2)}\n`);

    const loaded = await loadTheme(dir);
    return themeSummaryFromLoaded(loaded, source, dir, null);
  }
}

async function isPresetGalleryVisible(dir: string): Promise<boolean> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(dir, "theme.json"), "utf8")) as {
      galleryVisible?: unknown;
    };
    return raw.galleryVisible !== false;
  } catch {
    // Invalid manifests are handled by loadTheme and skipped by listThemes.
    return true;
  }
}

async function readSidecarMeta(dir: string): Promise<{ author?: string; version?: string } | null> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(dir, ".market-meta.json"), "utf8"));
    return typeof raw === "object" && raw !== null ? raw : null;
  } catch {
    return null;
  }
}

function themeSummaryFromLoaded(
  loaded: { themeDir: string; imagePath: string; imageBytes: number; theme: NormalizedTheme },
  source: ThemeSource,
  dir: string,
  meta: { author?: string; version?: string } | null,
): ThemeSummary {
  const { theme } = loaded;
  const previewResource = theme.resources.preview ?? theme.resources.hero;
  return {
    id: theme.id,
    uuid: theme.uuid,
    name: theme.name,
    tagline: theme.tagline,
    description: theme.description,
    version: meta?.version ?? theme.version,
    layout: theme.layout,
    source,
    readOnly: source === "preset" || source === "imported",
    valid: true,
    signed: false,
    minEngineVersion: theme.minEngineVersion,
    dir,
    previewUrl: `theme-image://${encodeURIComponent(theme.id)}/${encodeURIComponent(previewResource)}`,
    colors: theme.light,
  };
}

function buildPalette(
  colors: { accent: string; accentAlt: string; secondary: string; highlight: string },
  mode: "light" | "dark",
): ThemeConfigV2["light"] {
  const shell = deriveShellColors(colors.accent);
  const light: ThemeConfigV2["light"] = {
    background: shell.background,
    panel: shell.panel,
    panelAlt: shell.panelAlt,
    surface: shell.panel,
    text: shell.text,
    muted: shell.muted,
    border: shell.line,
    accent: colors.accent,
    accentAlt: colors.accentAlt,
    secondary: colors.secondary,
    highlight: colors.highlight,
  };
  if (mode === "light") return light;
  return deriveDarkPalette(light);
}

function renderPreviewPng(heroPath: string): Buffer {
  const image = nativeImage.createFromPath(heroPath);
  if (image.isEmpty()) throw new Error("无法解码主图以生成预览。");
  const { width, height } = image.getSize();
  const scale = Math.min(PREVIEW_WIDTH / width, PREVIEW_HEIGHT / height, 1);
  if (scale < 1) {
    const resized = image.resize({ width: Math.round(width * scale), quality: "good" });
    return resized.toPNG();
  }
  return image.toPNG();
}

function denormalizeToV2(theme: NormalizedTheme): ThemeConfigV2 {
  return {
    schemaVersion: 2,
    uuid: theme.uuid,
    id: theme.id,
    version: theme.version,
    minEngineVersion: theme.minEngineVersion,
    name: theme.name,
    description: theme.description,
    tagline: theme.tagline,
    tags: theme.tags,
    hero: theme.resources.hero,
    wallpaper: theme.resources.wallpaper,
    stamp: theme.resources.stamp,
    preview: theme.resources.preview,
    light: theme.light,
    dark: theme.dark,
    layout: theme.layout,
    heroFit: theme.hero.fit,
    heroFocusX: theme.hero.focusX,
    heroFocusY: theme.hero.focusY,
    heroZoom: theme.hero.zoom,
    heroHeight: theme.hero.height,
    heroTextAlign: theme.hero.textAlign,
    heroScrim: theme.hero.scrim,
    wallpaperEnabled: theme.wallpaper.enabled,
    wallpaperFocusX: theme.wallpaper.focusX,
    wallpaperFocusY: theme.wallpaper.focusY,
    wallpaperOpacity: theme.wallpaper.opacity,
    wallpaperBlur: theme.wallpaper.blur,
    radius: theme.appearance.radius,
    density: theme.appearance.density,
    fontPreset: theme.appearance.fontPreset,
    glass: theme.appearance.glass,
    shadow: theme.appearance.shadow,
    decoration: theme.appearance.decoration,
    effects: {
      particles: theme.effects.particles,
      aurora: theme.effects.aurora,
      glow: theme.effects.glow,
      noise: theme.effects.noise,
      grid: theme.effects.grid,
      float: theme.effects.float,
    },
    brandSubtitle: theme.copy.brandSubtitle,
    projectPrefix: theme.copy.projectPrefix,
    projectLabel: theme.copy.projectLabel,
    statusText: theme.copy.statusText,
    quote: theme.copy.quote,
  };
}

export { compileTheme };
