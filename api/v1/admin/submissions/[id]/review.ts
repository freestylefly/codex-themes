import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  cleanText,
  firstQueryValue,
  isPointPrice,
  mapSubmission,
  requireAdmin,
} from "../../../../../server/commerce-api/marketplace.js";
import { supabase } from "../../../../../server/commerce-api/supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const submissionId = firstQueryValue(req.query.id);
  const action = req.body?.action === "approve" ? "approve" : req.body?.action === "reject" ? "reject" : "";
  const reason = cleanText(req.body?.reason, 500);
  const pricePoints = req.body?.pricePoints;
  if (!submissionId || !action || reason.length < 2) {
    return res.status(400).json({ error: "Invalid review request" });
  }
  if (action === "approve" && !isPointPrice(pricePoints)) {
    return res.status(400).json({ error: "Invalid point price" });
  }

  const { data: submission } = await supabase
    .from("theme_submissions")
    .select("*")
    .eq("id", submissionId)
    .eq("status", "pending")
    .single();
  if (!submission) return res.status(404).json({ error: "Pending submission not found" });

  if (action === "approve") {
    if (!submission.preview_storage_path) {
      return res.status(409).json({ error: "Submission preview is missing" });
    }
    const preview = await supabase.storage
      .from("theme-submissions")
      .download(submission.preview_storage_path);
    if (preview.error || !preview.data) {
      return res.status(500).json({ error: "Failed to read submission preview" });
    }
    const publicPreviewPath =
      `community/${submission.theme_id}/${submission.version}/preview.webp`;
    const upload = await supabase.storage
      .from("theme-previews")
      .upload(publicPreviewPath, Buffer.from(await preview.data.arrayBuffer()), {
        contentType: "image/webp",
        cacheControl: "31536000",
        upsert: true,
      });
    if (upload.error) return res.status(500).json({ error: "Failed to publish preview" });
    const previewUrl = supabase.storage
      .from("theme-previews")
      .getPublicUrl(publicPreviewPath).data.publicUrl;
    const update = await supabase
      .from("theme_submissions")
      .update({ preview_url: previewUrl, updated_at: new Date().toISOString() })
      .eq("id", submission.id);
    if (update.error) return res.status(500).json({ error: "Failed to register preview" });
  }

  const { data, error } = await supabase.rpc("review_theme_submission", {
    p_submission_id: submission.id,
    p_admin_id: admin.id,
    p_action: action,
    p_price_points: action === "approve" ? pricePoints : 0,
    p_reason: reason,
  });
  if (error || !data) {
    console.error("review submission error:", error);
    return res.status(500).json({ error: "Failed to review submission" });
  }
  return res.status(200).json(mapSubmission(data as Record<string, unknown>));
}
