import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../../server/commerce-api/supabase.js";
import { getAuthToken, verifyUser } from "../../../server/commerce-api/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
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
    .select("id, theme_id, price_cents, status, out_trade_no, created_at, paid_at, theme_products(name)")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .single();

  if (error || !order) {
    return res.status(404).json({ error: "Order not found" });
  }

  const themeName = (order.theme_products as unknown as { name: string } | null)?.name ?? "";

  return res.status(200).json({
    id: order.id,
    themeId: order.theme_id,
    themeName,
    priceCents: order.price_cents,
    status: order.status,
    outTradeNo: order.out_trade_no,
    createdAt: order.created_at,
    paidAt: order.paid_at,
  });
}
