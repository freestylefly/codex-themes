import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import { LAYOUT_KINDS } from "../../../electron/shared/types.js";
import {
  cleanText,
  isPointPrice,
  mapSubmission,
  requireUser,
} from "../../../server/commerce-api/marketplace.js";
import { supabase } from "../../../server/commerce-api/supabase.js";

async function withSignedPreview(item: Record<string, unknown>) {
  const mapped = mapSubmission(item);
  if (!item.preview_storage_path) return mapped;
  const { data } = await supabase.storage
    .from("theme-submissions")
    .createSignedUrl(String(item.preview_storage_path), 10 * 60);
  return { ...mapped, previewUrl: data?.signedUrl ?? null };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("theme_submissions")
      .select("*")
      .eq("author_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return res.status(500).json({ error: "Failed to load submissions" });
    return res.status(200).json(
      await Promise.all(
        (data ?? []).map((item) => withSignedPreview(item as Record<string, unknown>)),
      ),
    );
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { data: profile } = await supabase
    .from("profiles")
    .select("handle")
    .eq("id", user.id)
    .single();
  if (!profile?.handle) return res.status(409).json({ error: "Public profile required" });

  const sourceKind = req.body?.sourceKind === "ai" ? "ai" : "custom";
  const proposedPricePoints = req.body?.proposedPricePoints;
  const layout = cleanText(req.body?.layout, 40);
  if (
    req.body?.rightsAccepted !== true
    || !isPointPrice(proposedPricePoints)
    || !(LAYOUT_KINDS as readonly string[]).includes(layout)
  ) {
    return res.status(400).json({ error: "Invalid submission metadata" });
  }

  const existingThemeId =
    typeof req.body?.themeId === "string" && req.body.themeId.startsWith("community-")
      ? req.body.themeId
      : null;
  let themeId = existingThemeId ?? `community-${randomUUID()}`;
  let revision = 1;
  let createdProduct = false;

  if (existingThemeId) {
    const { data: product } = await supabase
      .from("theme_products")
      .select("id, author_id")
      .eq("id", existingThemeId)
      .eq("author_id", user.id)
      .single();
    if (!product) return res.status(404).json({ error: "Community theme not found" });
    const { data: latest } = await supabase
      .from("theme_submissions")
      .select("revision")
      .eq("theme_id", existingThemeId)
      .order("revision", { ascending: false })
      .limit(1)
      .maybeSingle();
    revision = (latest?.revision ?? 0) + 1;
  } else {
    const productInsert = await supabase.from("theme_products").insert({
      id: themeId,
      name: cleanText(req.body?.name, 80) || "未命名主题",
      tagline: cleanText(req.body?.tagline, 160),
      description: cleanText(req.body?.description, 160),
      version: "1.0.0",
      layout,
      preview_url: "",
      price_cents: 0,
      price_points: proposedPricePoints,
      min_engine_version: cleanText(req.body?.minEngineVersion, 30) || "1.0.0",
      published: false,
      origin: "community",
      author_id: user.id,
    });
    if (productInsert.error) {
      console.error("create community product error:", productInsert.error);
      return res.status(500).json({ error: "Failed to create community theme" });
    }
    createdProduct = true;
  }

  const submissionId = randomUUID();
  const version = `1.0.${revision - 1}`;
  const sourcePath = `${user.id}/${submissionId}/source.codextheme`;
  const { data: submission, error } = await supabase
    .from("theme_submissions")
    .insert({
      id: submissionId,
      theme_id: themeId,
      author_id: user.id,
      revision,
      version,
      source_kind: sourceKind,
      status: "uploading",
      proposed_price_points: proposedPricePoints,
      name: cleanText(req.body?.name, 80) || "未命名主题",
      tagline: cleanText(req.body?.tagline, 160),
      description: cleanText(req.body?.description, 160),
      layout,
      min_engine_version: cleanText(req.body?.minEngineVersion, 30) || "1.0.0",
      source_storage_path: sourcePath,
      rights_attested_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error || !submission) {
    if (createdProduct) {
      await supabase.from("theme_products").delete().eq("id", themeId);
    }
    return res.status(500).json({ error: "Failed to create submission" });
  }

  const signed = await supabase.storage
    .from("theme-submissions")
    .createSignedUploadUrl(sourcePath);
  if (signed.error || !signed.data?.token) {
    return res.status(500).json({ error: "Failed to create upload URL" });
  }
  return res.status(201).json({
    submission: mapSubmission(submission as Record<string, unknown>),
    upload: {
      bucket: "theme-submissions",
      path: sourcePath,
      token: signed.data.token,
    },
  });
}
