import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  cleanText,
  newIdempotencyKey,
  requireAdmin,
} from "../../../../server/commerce-api/marketplace.js";
import { supabase } from "../../../../server/commerce-api/supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const userId = typeof req.body?.userId === "string" ? req.body.userId : "";
  const delta = req.body?.delta;
  const reason = cleanText(req.body?.reason, 500);
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !Number.isInteger(delta) || delta === 0 || reason.length < 3) {
    return res.status(400).json({ error: "Invalid point adjustment" });
  }
  const { data, error } = await supabase.rpc("adjust_point_balance", {
    p_admin_id: admin.id,
    p_user_id: userId,
    p_delta: delta,
    p_reason: reason,
    p_idempotency_key: newIdempotencyKey("admin-adjustment"),
  });
  if (error || !data) {
    return res.status(409).json({ error: error?.message ?? "Adjustment failed" });
  }
  return res.status(200).json({
    userId: data.user_id,
    balance: data.balance,
    updatedAt: data.updated_at,
  });
}
