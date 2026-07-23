import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  formatYuan,
  normalizeYuan,
  queryAlipayOrder,
} from "../../../../../server/commerce-api/alipay.js";
import {
  firstQueryValue,
  requireAdmin,
} from "../../../../../server/commerce-api/marketplace.js";
import { supabase } from "../../../../../server/commerce-api/supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await requireAdmin(req, res))) return;
  const orderId = firstQueryValue(req.query.id);
  if (!orderId) return res.status(400).json({ error: "Order id is required" });
  const { data: order } = await supabase
    .from("orders")
    .select("id, user_id, theme_id, price_cents, status, out_trade_no, created_at, paid_at, theme_products(name, version)")
    .eq("id", orderId)
    .single();
  if (!order) return res.status(404).json({ error: "Order not found" });

  let current = order as unknown as Record<string, unknown>;
  if (order.status === "pending" || order.status === "failed") {
    const { tradeStatus, tradeNo, result } = await queryAlipayOrder(order.out_trade_no);
    if ((tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED") && tradeNo) {
      if (normalizeYuan(result.total_amount) !== formatYuan(order.price_cents)) {
        return res.status(409).json({ error: "Alipay amount does not match the order snapshot" });
      }
      const product = order.theme_products as unknown as { version?: string } | null;
      const fulfilled = await supabase.rpc("fulfill_order_payment", {
        p_order_id: order.id,
        p_user_id: order.user_id,
        p_theme_id: order.theme_id,
        p_version: product?.version ?? "1.0.0",
        p_paid_at: new Date().toISOString(),
        p_alipay_trade_no: tradeNo,
      });
      if (fulfilled.error || !fulfilled.data) {
        return res.status(500).json({ error: "Failed to fulfill theme order" });
      }
      current = fulfilled.data as Record<string, unknown>;
    }
  }
  const product = order.theme_products as unknown as { name?: string } | null;
  return res.status(200).json({
    id: current.id,
    userId: current.user_id,
    themeId: current.theme_id,
    themeName: product?.name ?? order.theme_id,
    priceCents: current.price_cents,
    status: current.status,
    outTradeNo: current.out_trade_no,
    createdAt: current.created_at,
    paidAt: current.paid_at,
  });
}
