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

interface CreatorThemeMetrics {
  uniqueUsers: number;
  totalRewardPoints: number;
  recentUnlocks: number;
  recentRewardPoints: number;
  dailyUnlocks: Array<{ date: string; count: number }>;
}

const STALE_VALIDATION_MS = 10 * 60 * 1000;

async function withSignedPreview(
  item: Record<string, unknown>,
  metrics: CreatorThemeMetrics,
) {
  const mapped = mapSubmission(item);
  const product = item.product as
    | {
        version?: string;
        published?: boolean;
        downloads_enabled?: boolean;
        unlock_count?: number;
        price_points?: number;
        price_cents?: number;
        published_at?: string | null;
        preview_url?: string | null;
      }
    | null
    | undefined;
  let previewUrl = mapped.previewUrl;
  if (item.preview_storage_path) {
    const { data } = await supabase.storage
      .from("theme-submissions")
      .createSignedUrl(String(item.preview_storage_path), 10 * 60);
    previewUrl = data?.signedUrl ?? previewUrl;
  }
  return {
    ...mapped,
    previewUrl,
    product: product
      ? {
          version: product.version ?? mapped.version,
          published: product.published === true,
          downloadsEnabled: product.downloads_enabled !== false,
          unlockCount: Number(product.unlock_count ?? 0),
          pricePoints: Number(product.price_points ?? 0),
          priceCents: Number(product.price_cents ?? 0),
          publishedAt: product.published_at ?? null,
          previewUrl: product.preview_url ?? null,
        }
      : null,
    metrics,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === "GET") {
    const staleBefore = new Date(Date.now() - STALE_VALIDATION_MS).toISOString();
    const { error: staleError } = await supabase
      .from("theme_submissions")
      .update({
        status: "failed",
        review_reason: "上传或自动校验已超时，请重新校验。",
        updated_at: new Date().toISOString(),
      })
      .eq("author_id", user.id)
      .eq("status", "uploading")
      .lt("updated_at", staleBefore);
    if (staleError) {
      console.error("stale submission recovery failed:", staleError);
    }

    const { data, error } = await supabase
      .from("theme_submissions")
      .select(`
        *,
        product:theme_products!theme_submissions_theme_id_fkey (
          version,
          published,
          downloads_enabled,
          unlock_count,
          price_points,
          price_cents,
          published_at,
          preview_url
        )
      `)
      .eq("author_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return res.status(500).json({ error: "Failed to load submissions" });

    const submissions = data ?? [];
    const themeIds = [...new Set(submissions.map((item) => item.theme_id))];
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [rewardsResult, unlocksResult] = themeIds.length > 0
      ? await Promise.all([
          supabase
            .from("point_ledger_entries")
            .select("theme_id, delta, entry_type, created_at")
            .eq("user_id", user.id)
            .in("entry_type", ["creator_reward", "refund_hold", "refund_reversal"])
            .in("theme_id", themeIds)
            .limit(10000),
          supabase
            .from("entitlements")
            .select("theme_id, created_at, status, acquisition_type")
            .in("theme_id", themeIds)
            .neq("user_id", user.id)
            .limit(10000),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];

    if (rewardsResult.error || unlocksResult.error) {
      console.error(
        "creator metrics query failed:",
        rewardsResult.error ?? unlocksResult.error,
      );
      return res.status(500).json({ error: "Failed to load creator metrics" });
    }

    const metricsByTheme = new Map<string, CreatorThemeMetrics>();
    const recentDateKeys = Array.from({ length: 30 }, (_, index) => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() - (29 - index));
      return date.toISOString().slice(0, 10);
    });
    for (const item of submissions) {
      const product = item.product as { unlock_count?: number } | null;
      metricsByTheme.set(item.theme_id, {
        uniqueUsers: Number(product?.unlock_count ?? 0),
        totalRewardPoints: 0,
        recentUnlocks: 0,
        recentRewardPoints: 0,
        dailyUnlocks: recentDateKeys.map((date) => ({ date, count: 0 })),
      });
    }
    for (const entry of rewardsResult.data ?? []) {
      if (!entry.theme_id) continue;
      const metrics = metricsByTheme.get(entry.theme_id);
      if (!metrics) continue;
      const delta = Number(entry.delta ?? 0);
      metrics.totalRewardPoints += delta;
      if (entry.created_at >= since) metrics.recentRewardPoints += delta;
    }
    for (const entitlement of unlocksResult.data ?? []) {
      if (
        entitlement.status !== "active"
        || entitlement.created_at < since
        || ["author", "admin"].includes(entitlement.acquisition_type)
      ) {
        continue;
      }
      const metrics = metricsByTheme.get(entitlement.theme_id);
      if (metrics) {
        metrics.recentUnlocks += 1;
        const day = metrics.dailyUnlocks.find(
          (entry) => entry.date === entitlement.created_at.slice(0, 10),
        );
        if (day) day.count += 1;
      }
    }

    return res.status(200).json(
      await Promise.all(
        submissions.map((item) =>
          withSignedPreview(
            item as unknown as Record<string, unknown>,
            metricsByTheme.get(item.theme_id) ?? {
              uniqueUsers: 0,
              totalRewardPoints: 0,
              recentUnlocks: 0,
              recentRewardPoints: 0,
              dailyUnlocks: recentDateKeys.map((date) => ({ date, count: 0 })),
            },
          )),
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
