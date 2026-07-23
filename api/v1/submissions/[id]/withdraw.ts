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
    .update({ status: "withdrawn", updated_at: new Date().toISOString() })
    .eq("id", submissionId)
    .eq("author_id", user.id)
    .in("status", ["uploading", "pending"])
    .select("*")
    .single();
  if (error || !data) return res.status(409).json({ error: "Submission cannot be withdrawn" });
  return res.status(200).json(mapSubmission(data as Record<string, unknown>));
}
