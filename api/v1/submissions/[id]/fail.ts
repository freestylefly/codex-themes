import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  firstQueryValue,
  mapSubmission,
  requireUser,
} from "../../../../server/commerce-api/marketplace.js";
import { supabase } from "../../../../server/commerce-api/supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const user = await requireUser(req, res);
  if (!user) return;
  const submissionId = firstQueryValue(req.query.id);
  if (!submissionId) return res.status(400).json({ error: "Submission id is required" });

  const { data, error } = await supabase
    .from("theme_submissions")
    .update({
      status: "failed",
      review_reason: "自动校验服务未完成处理，请重新校验。",
      updated_at: new Date().toISOString(),
    })
    .eq("id", submissionId)
    .eq("author_id", user.id)
    .eq("status", "uploading")
    .select("*")
    .maybeSingle();

  if (error) return res.status(500).json({ error: "Failed to record validation failure" });
  if (data) {
    return res.status(200).json(mapSubmission(data as Record<string, unknown>));
  }

  const { data: current } = await supabase
    .from("theme_submissions")
    .select("*")
    .eq("id", submissionId)
    .eq("author_id", user.id)
    .maybeSingle();
  if (!current) return res.status(404).json({ error: "Submission not found" });
  return res.status(200).json(mapSubmission(current as Record<string, unknown>));
}
