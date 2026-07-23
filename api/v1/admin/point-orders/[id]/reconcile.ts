import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  formatYuan,
  normalizeYuan,
  queryAlipayOrder,
} from "../../../../../server/commerce-api/alipay.js";
import {
  firstQueryValue,
  mapPointOrder,
  requireAdmin,
} from "../../../../../server/commerce-api/marketplace.js";
import { supabase } from "../../../../../server/commerce-api/supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await requireAdmin(req, res))) return;
  const orderId = firstQueryValue(req.query.id);
  if (!orderId) return res.status(400).json({ error: "Order id is required" });
  const { data: order } = await supabase
    .from("point_orders")
    .select("id, user_id, pack_id, price_cents, base_points, bonus_points, status, out_trade_no, created_at, paid_at, refunded_at, point_packs(name)")
    .eq("id", orderId)
    .single();
  if (!order) return res.status(404).json({ error: "Point order not found" });
  if (order.status !== "pending" && order.status !== "failed") {
    return res.status(200).json(mapPointOrder(order as unknown as Record<string, unknown>));
  }
  const { tradeStatus, tradeNo, result } = await queryAlipayOrder(order.out_trade_no);
  if ((tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED") && tradeNo) {
    if (normalizeYuan(result.total_amount) !== formatYuan(order.price_cents)) {
      return res.status(409).json({ error: "Alipay amount does not match the order snapshot" });
    }
    const fulfilled = await supabase.rpc("fulfill_point_order_payment", {
      p_order_id: order.id,
      p_paid_at: new Date().toISOString(),
      p_alipay_trade_no: tradeNo,
    });
    if (fulfilled.error || !fulfilled.data) {
      return res.status(500).json({ error: "Failed to fulfill point order" });
    }
    return res.status(200).json(mapPointOrder({
      ...(fulfilled.data as Record<string, unknown>),
      point_packs: order.point_packs,
    }));
  }
  return res.status(200).json(mapPointOrder(order as unknown as Record<string, unknown>));
}
