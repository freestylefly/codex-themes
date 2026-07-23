import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  cleanText,
  firstQueryValue,
  requireAdmin,
} from "../../../../../server/commerce-api/marketplace.js";
import { supabase } from "../../../../../server/commerce-api/supabase.js";

const ACTIONS = {
  unpublish: { published: false, reviewAction: "unpublish" },
  republish: { published: true, reviewAction: "republish" },
  suspend_downloads: { downloads_enabled: false, reviewAction: "suspend_downloads" },
  restore_downloads: { downloads_enabled: true, reviewAction: "restore_downloads" },
} as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const themeId = firstQueryValue(req.query.id);
  const action = typeof req.body?.action === "string" ? req.body.action : "";
  const reason = cleanText(req.body?.reason, 500);
  const change = ACTIONS[action as keyof typeof ACTIONS];
  if (!themeId || !change || reason.length < 2) {
    return res.status(400).json({ error: "Invalid theme state change" });
  }
  const { data: product } = await supabase
    .from("theme_products")
    .select("id, current_submission_id")
    .eq("id", themeId)
    .eq("origin", "community")
    .single();
  if (!product?.current_submission_id) {
    return res.status(404).json({ error: "Community theme not found" });
  }
  const patch =
    "published" in change
      ? { published: change.published, updated_at: new Date().toISOString() }
      : { downloads_enabled: change.downloads_enabled, updated_at: new Date().toISOString() };
  const update = await supabase.from("theme_products").update(patch).eq("id", themeId);
  if (update.error) return res.status(500).json({ error: "Failed to update theme" });
  await supabase.from("theme_reviews").insert({
    submission_id: product.current_submission_id,
    reviewer_id: admin.id,
    action: change.reviewAction,
    reason,
  });
  return res.status(200).json({ ok: true, themeId, action });
}
