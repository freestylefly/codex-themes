import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  firstQueryValue,
  mapPointOrder,
  requireUser,
} from "../../../server/commerce-api/marketplace.js";
import { supabase } from "../../../server/commerce-api/supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const user = await requireUser(req, res);
  if (!user) return;
  const orderId = firstQueryValue(req.query.id);
  if (!orderId) return res.status(400).json({ error: "Order id is required" });
  const { data, error } = await supabase
    .from("point_orders")
    .select("id, pack_id, price_cents, base_points, bonus_points, status, out_trade_no, created_at, paid_at, refunded_at, point_packs(name)")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .single();
  if (error || !data) return res.status(404).json({ error: "Point order not found" });
  return res.status(200).json(mapPointOrder(data as unknown as Record<string, unknown>));
}
