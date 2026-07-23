import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  cleanText,
  firstQueryValue,
  requireUser,
} from "../../../../../server/commerce-api/marketplace.js";
import { supabase } from "../../../../../server/commerce-api/supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const user = await requireUser(req, res);
  if (!user) return;
  const themeId = firstQueryValue(req.query.id);
  const reason = cleanText(req.body?.reason, 500);
  if (!themeId || req.body?.action !== "unpublish" || reason.length < 2) {
    return res.status(400).json({ error: "Invalid author state change" });
  }
  const { data: product } = await supabase
    .from("theme_products")
    .select("id, current_submission_id")
    .eq("id", themeId)
    .eq("author_id", user.id)
    .eq("origin", "community")
    .single();
  if (!product?.current_submission_id) {
    return res.status(404).json({ error: "Published community theme not found" });
  }
  const { error } = await supabase
    .from("theme_products")
    .update({ published: false, updated_at: new Date().toISOString() })
    .eq("id", themeId)
    .eq("author_id", user.id);
  if (error) return res.status(500).json({ error: "Failed to unpublish theme" });
  await supabase.from("theme_reviews").insert({
    submission_id: product.current_submission_id,
    reviewer_id: user.id,
    action: "unpublish",
    reason,
  });
  return res.status(200).json({ ok: true });
}
