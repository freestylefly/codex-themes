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

async function loadThemeJson(dir) {
  const raw = await fs.readFile(path.join(dir, "theme.json"), "utf8");
  return JSON.parse(raw);
}

async function buildPackage(dir, themeId) {
  const zip = new AdmZip();
  const entries = await fs.readdir(dir);
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const file = path.join(dir, entry);
    const stat = await fs.stat(file);
    if (stat.isFile()) zip.addLocalFile(file, "", entry);
  }
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
  const priceCents = Number.isFinite(args.price) ? args.price : theme.price_cents ?? 1;
  const published = args.published ?? theme.published ?? false;

  const { buffer, sha256 } = await buildPackage(dir, themeId);
  const storagePath = `paid-themes/${themeId}/${theme.version}/${sha256.slice(0, 16)}.codextheme`;

  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Upsert product row.
  const { error: productError } = await supabase.from("theme_products").upsert({
    id: themeId,
    name: theme.name,
    tagline: theme.tagline ?? "",
    description: theme.description ?? "",
    version: theme.version,
    layout: theme.layout,
    preview_url: theme.preview_url ?? `https://codex-themes.vercel.app/paid-themes/${themeId}/preview.png`,
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
  const { error: assetError } = await supabase.schema("private").from("theme_assets").upsert({
    theme_id: themeId,
    storage_path: storagePath,
    sha256,
  });
  if (assetError) throw new Error(`Failed to register asset: ${assetError.message}`);

  console.log(`Published ${themeId} v${theme.version} at ${storagePath}`);
  console.log(`SHA-256: ${sha256}`);
  console.log(`Price: ¥${(priceCents / 100).toFixed(2)}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
