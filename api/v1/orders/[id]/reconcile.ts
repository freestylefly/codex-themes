import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../../../server/commerce-api/supabase.js";
import { getAuthToken, verifyUser } from "../../../../server/commerce-api/auth.js";
import {
  formatYuan,
  normalizeYuan,
  queryAlipayOrder,
} from "../../../../server/commerce-api/alipay.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = getAuthToken(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const user = await verifyUser(token);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.query;
  const orderId = Array.isArray(id) ? id[0] : id;
  if (!orderId) return res.status(400).json({ error: "Order id is required" });

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, user_id, theme_id, price_cents, status, out_trade_no, created_at, paid_at, theme_products(name, version)")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .single();

  if (error || !order) {
    return res.status(404).json({ error: "Order not found" });
  }

  if (order.status === "paid") {
    return res.status(200).json(formatOrder(order));
  }

  const { tradeStatus, tradeNo, result } = await queryAlipayOrder(order.out_trade_no);
  if (tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED") {
    if (!tradeNo) {
      return res.status(502).json({ error: "Alipay response is missing trade number" });
    }
    if (normalizeYuan(result.total_amount) !== formatYuan(order.price_cents)) {
      return res.status(409).json({ error: "Alipay amount does not match the order snapshot" });
    }
    const updated = await fulfillOrder(order, tradeNo);
    return res.status(200).json(formatOrder(updated));
  }

  return res.status(200).json(formatOrder(order));
}

function formatOrder(order: Record<string, unknown>) {
  const themeName = (order.theme_products as unknown as { name: string } | null)?.name ?? "";
  return {
    id: order.id,
    themeId: order.theme_id,
    themeName,
    priceCents: order.price_cents,
    status: order.status,
    outTradeNo: order.out_trade_no,
    createdAt: order.created_at,
    paidAt: order.paid_at,
  };
}

async function fulfillOrder(order: Record<string, unknown>, tradeNo: string): Promise<Record<string, unknown>> {
  const product = order.theme_products as unknown as { name: string; version: string } | null;
  const now = new Date().toISOString();
  const { data, error } = await supabase.rpc("fulfill_order_payment", {
    p_order_id: order.id,
    p_user_id: order.user_id,
    p_theme_id: order.theme_id,
    p_version: product?.version ?? "1.0.0",
    p_paid_at: now,
    p_alipay_trade_no: tradeNo,
  });
  if (error) {
    console.error("fulfill order error:", error);
    throw new Error("Failed to fulfill order");
  }
  return data as Record<string, unknown>;
}
