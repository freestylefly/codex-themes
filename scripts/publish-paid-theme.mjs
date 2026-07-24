#!/usr/bin/env node
/**
 * Publish a paid theme package to Supabase Storage and register it in the
 * commerce catalog. Run from the repo root:
 *
 *   node scripts/publish-paid-theme.mjs --dir ./path/to/theme --price 100 --published
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import AdmZip from "adm-zip";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dir") args.dir = argv[++i];
    else if (arg === "--price") args.price = Number(argv[++i]);
    else if (arg === "--published") args.published = true;
    else if (arg === "--id") args.id = argv[++i];
  }
  return args;
}

function imageContentType(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".png") return "image/png";
  throw new Error(`Unsupported preview image type: ${extension || "none"}`);
}

function packageImageName(slot, sourceName) {
  const extension = path.extname(sourceName).toLowerCase();
  imageContentType(sourceName);
  return `${slot}${extension}`;
}

function resolveThemeResource(dir, sourceName, slot) {
  if (typeof sourceName !== "string" || !sourceName.trim()) {
    throw new Error(`Missing required theme resource: ${slot}`);
  }
  if (sourceName !== path.basename(sourceName)) {
    throw new Error(`Theme resource must be a root-level file: ${sourceName}`);
  }
  const resolved = path.resolve(dir, sourceName);
  if (path.dirname(resolved) !== dir) {
    throw new Error(`Theme resource escapes the theme directory: ${sourceName}`);
  }
  return resolved;
}

async function loadThemeJson(dir) {
  const raw = await fs.readFile(path.join(dir, "theme.json"), "utf8");
  return JSON.parse(raw);
}

export async function buildPackage(dir, themeId) {
  const sourceTheme = await loadThemeJson(dir);
  const theme = {
    ...sourceTheme,
    id: themeId,
  };
  delete theme.catalogOnly;
  delete theme.priceCents;
  delete theme.price_cents;
  delete theme.preview_url;
  delete theme.published;
  delete theme.signature;

  const zip = new AdmZip();
  for (const { key, slot, required } of [
    { key: "hero", slot: "hero", required: true },
    { key: "wallpaper", slot: "wallpaper", required: false },
    { key: "stamp", slot: "stamp", required: false },
    { key: "preview", slot: "preview", required: false },
  ]) {
    const sourceName = theme[key];
    if (sourceName == null && !required) continue;
    const sourcePath = resolveThemeResource(dir, sourceName, slot);
    const packageName = packageImageName(slot, sourceName);
    zip.addFile(packageName, await fs.readFile(sourcePath));
    theme[key] = packageName;
  }

  zip.addFile("theme.json", Buffer.from(`${JSON.stringify(theme, null, 2)}\n`, "utf8"));
  const buffer = zip.toBuffer();
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  return { buffer, sha256 };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.dir) throw new Error("Usage: --dir <theme-dir> [--price cents] [--published] [--id theme-id]");

  const dir = path.resolve(args.dir);
  const theme = await loadThemeJson(dir);
  const themeId = args.id ?? theme.id;
  const priceCents = Number.isFinite(args.price) ? args.price : theme.priceCents ?? theme.price_cents ?? 1;
  const published = args.published ?? theme.published ?? false;

  const { buffer, sha256 } = await buildPackage(dir, themeId);
  const storagePath = `paid-themes/${themeId}/${theme.version}/${sha256.slice(0, 16)}.codextheme`;

  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let previewUrl = theme.preview_url;
  if (!previewUrl) {
    const previewFile = theme.preview ?? "preview.png";
    const previewBytes = await fs.readFile(path.join(dir, previewFile));
    const previewExtension = path.extname(previewFile).toLowerCase();
    const previewPath = `${themeId}/preview${previewExtension}`;

    const { error: bucketError } = await supabase.storage.getBucket("theme-previews");
    if (bucketError) {
      const { error: createBucketError } = await supabase.storage.createBucket("theme-previews", {
        public: true,
        fileSizeLimit: 10 * 1024 * 1024,
        allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
      });
      if (createBucketError && !/already exists/i.test(createBucketError.message)) {
        throw new Error(`Failed to create preview bucket: ${createBucketError.message}`);
      }
    }

    const { error: previewError } = await supabase.storage
      .from("theme-previews")
      .upload(previewPath, previewBytes, {
        contentType: imageContentType(previewFile),
        cacheControl: "3600",
        upsert: true,
      });
    if (previewError) throw new Error(`Failed to upload preview: ${previewError.message}`);
    previewUrl = supabase.storage.from("theme-previews").getPublicUrl(previewPath).data.publicUrl;
  }

  // Upsert product row.
  const { error: productError } = await supabase.from("theme_products").upsert({
    id: themeId,
    name: theme.name,
    tagline: theme.tagline ?? "",
    description: theme.description ?? "",
    version: theme.version,
    layout: theme.layout,
    preview_url: previewUrl,
    price_cents: priceCents,
    min_engine_version: theme.minEngineVersion ?? "1.0.0",
    published,
  });
  if (productError) throw new Error(`Failed to upsert product: ${productError.message}`);

  // Upload package to Storage.
  const { error: uploadError } = await supabase.storage.from("paid-themes").upload(storagePath, buffer, {
    contentType: "application/zip",
    upsert: true,
  });
  if (uploadError) throw new Error(`Failed to upload package: ${uploadError.message}`);

  // Register private asset record.
  const { error: assetError } = await supabase.rpc("upsert_theme_asset", {
    p_theme_id: themeId,
    p_storage_path: storagePath,
    p_sha256: sha256,
  });
  if (assetError) throw new Error(`Failed to register asset: ${assetError.message}`);

  console.log(`Published ${themeId} v${theme.version} at ${storagePath}`);
  console.log(`SHA-256: ${sha256}`);
  console.log(`Price: ¥${(priceCents / 100).toFixed(2)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
