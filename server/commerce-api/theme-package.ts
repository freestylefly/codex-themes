import AdmZip from "adm-zip";
import crypto from "node:crypto";
import sharp from "sharp";
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
} from "../../electron/engine/package-safety.js";
import { normalizeTheme, validateContrast } from "../../electron/engine/normalize.js";

export interface CanonicalThemePackage {
  packageBuffer: Buffer;
  previewBuffer: Buffer;
  sha256: string;
  theme: {
    name: string;
    tagline: string;
    description: string;
    layout: string;
    minEngineVersion: string;
  };
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function requireResource(
  raw: Record<string, unknown>,
  buffers: Map<string, Buffer>,
  key: "hero" | "wallpaper" | "stamp" | "preview",
  required: boolean,
): string | null {
  const value = raw[key];
  if (value == null && !required) return null;
  const name = requiredString(value, key);
  // Legacy schema-v1 themes are normalized to v2 before export, but retain
  // their original `background.*` artwork filename as the v2 hero reference.
  // It is already part of the package whitelist, so accept it only for hero.
  const slotName = key === "hero" ? "(?:hero|background)" : key;
  const expected = new RegExp(`^${slotName}\\.(?:png|jpe?g|webp)$`, "i");
  if (
    isUnsafeEntryPath(name)
    || !expected.test(name)
    || !isAllowedPackageEntry(name)
    || !isImageEntry(name)
    || !buffers.has(name)
  ) {
    throw new Error(`主题资源 ${key} 不存在或文件名不合法。`);
  }
  return name;
}

export async function validateAndCanonicalizeThemePackage(
  source: Buffer,
  canonicalId: string,
  version: string,
): Promise<CanonicalThemePackage> {
  if (source.length < 1 || source.length > MAX_PACKAGE_BYTES) {
    throw new Error("主题包超过 24MB 上限。");
  }

  const zip = new AdmZip(source);
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  if (entries.length < 2 || entries.length > MAX_PACKAGE_FILES) {
    throw new Error(`主题包文件数必须在 2-${MAX_PACKAGE_FILES} 个之间。`);
  }

  let unpackedBytes = 0;
  let imageBytes = 0;
  let declaredUnpackedBytes = 0;
  const buffers = new Map<string, Buffer>();

  for (const entry of entries) {
    const name = entry.entryName;
    if (isUnsafeEntryPath(name) || !isAllowedPackageEntry(name)) {
      throw new Error(`主题包包含不允许的文件:${name}`);
    }
    const unixMode = (entry.attr >>> 16) & 0o170000;
    if (unixMode === 0o120000) throw new Error(`主题包包含符号链接:${name}`);
    if (buffers.has(name)) throw new Error(`主题包包含重复文件:${name}`);

    const declaredSize = Number(entry.header.size);
    const compressedSize = Number(entry.header.compressedSize);
    declaredUnpackedBytes += declaredSize;
    if (
      !Number.isSafeInteger(declaredSize)
      || declaredSize < 0
      || declaredUnpackedBytes > MAX_UNPACKED_BYTES
      || (compressedSize > 0 && declaredSize / compressedSize > 200)
    ) {
      throw new Error("主题包疑似压缩炸弹。");
    }

    const data = entry.getData();
    unpackedBytes += data.length;
    if (unpackedBytes > MAX_UNPACKED_BYTES) {
      throw new Error("主题包解压后超过 32MB 上限。");
    }
    if (isImageEntry(name)) {
      imageBytes += data.length;
      if (imageBytes > MAX_TOTAL_IMAGE_BYTES) {
        throw new Error("主题包图片合计超过 20MB 上限。");
      }
      if (isAnimatedImage(name, data)) {
        throw new Error(`不允许动画图片:${name}`);
      }
      const metadata = await sharp(data, { animated: false }).metadata();
      if (!metadata.width || !metadata.height) {
        throw new Error(`无法解码图片:${name}`);
      }
      if (metadata.width > MAX_IMAGE_SIDE || metadata.height > MAX_IMAGE_SIDE) {
        throw new Error(`图片边长超过 ${MAX_IMAGE_SIDE}px:${name}`);
      }
    }
    buffers.set(name, data);
  }

  const manifestBuffer = buffers.get("theme.json");
  if (!manifestBuffer) throw new Error("Package is missing theme.json");
  const raw = JSON.parse(manifestBuffer.toString("utf8")) as Record<string, unknown>;
  if (raw.schemaVersion !== 2) {
    throw new Error("社区投稿只支持 schemaVersion 2。");
  }

  const normalized = normalizeTheme(raw, { local: false });
  validateContrast(normalized.theme, false);

  const heroName = requireResource(raw, buffers, "hero", true)!;
  const wallpaperName = requireResource(raw, buffers, "wallpaper", false);
  const stampName = requireResource(raw, buffers, "stamp", false);
  const declaredPreviewName = requireResource(raw, buffers, "preview", false);
  if (normalized.theme.wallpaper.enabled && !wallpaperName) {
    throw new Error("主题启用了壁纸但未包含 wallpaper 资源。");
  }
  const heroBuffer = buffers.get(heroName)!;

  const rewritten = {
    ...raw,
    id: canonicalId,
    version,
    signature: undefined,
    catalogOnly: undefined,
  };
  const rewrittenBuffer = Buffer.from(`${JSON.stringify(rewritten, null, 2)}\n`, "utf8");
  buffers.set("theme.json", rewrittenBuffer);

  const previewName = declaredPreviewName ?? heroName;
  const previewSource = buffers.get(previewName) ?? heroBuffer;
  const previewBuffer = await sharp(previewSource, { animated: false })
    .resize(1200, 675, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 84 })
    .toBuffer();

  const canonicalZip = new AdmZip();
  for (const [name, data] of [...buffers.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    canonicalZip.addFile(name, data);
  }
  const referencedResources = new Set(
    [heroName, wallpaperName, stampName].filter((name): name is string => Boolean(name)),
  );
  for (const oldPreview of ["preview.png", "preview.jpg", "preview.jpeg", "preview.webp"]) {
    if (!referencedResources.has(oldPreview)) canonicalZip.deleteFile(oldPreview);
  }
  canonicalZip.deleteFile("preview.webp");
  canonicalZip.addFile("preview.webp", previewBuffer);

  const finalManifest = {
    ...rewritten,
    preview: "preview.webp",
  };
  canonicalZip.updateFile(
    "theme.json",
    Buffer.from(`${JSON.stringify(finalManifest, null, 2)}\n`, "utf8"),
  );

  const packageBuffer = canonicalZip.toBuffer();
  if (packageBuffer.length > MAX_PACKAGE_BYTES) {
    throw new Error("规范化后的主题包超过 24MB 上限。");
  }

  return {
    packageBuffer,
    previewBuffer,
    sha256: crypto.createHash("sha256").update(packageBuffer).digest("hex"),
    theme: {
      name: normalized.theme.name,
      tagline: normalized.theme.tagline,
      description: normalized.theme.description,
      layout: normalized.theme.layout,
      minEngineVersion: normalized.theme.minEngineVersion,
    },
  };
}
