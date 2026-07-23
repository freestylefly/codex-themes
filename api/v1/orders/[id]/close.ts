import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../../../server/commerce-api/supabase.js";
import { getAuthToken, verifyUser } from "../../../../server/commerce-api/auth.js";
import { closeAlipayOrder } from "../../../../server/commerce-api/alipay.js";

function orderId(req: VercelRequest): string | null {
  const value = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  return value || null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = getAuthToken(req);
  const user = token ? await verifyUser(token) : null;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const id = orderId(req);
  if (!id) return res.status(400).json({ error: "Order id is required" });

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, user_id, status, out_trade_no")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (error || !order) return res.status(404).json({ error: "Order not found" });
  if (order.status === "closed") return res.status(200).json({ id: order.id, status: "closed" });
  if (order.status !== "pending") {
    return res.status(409).json({ error: "Only pending orders can be closed" });
  }

  try {
    const result = await closeAlipayOrder(order.out_trade_no);
    const missingAtAlipay = result.sub_code === "ACQ.TRADE_NOT_EXIST";
    if (result.code !== "10000" && !missingAtAlipay) {
      return res.status(502).json({
        error: "Alipay rejected the close request",
        code: result.sub_code ?? result.code,
      });
    }

    const { data: updated, error: updateError } = await supabase
      .from("orders")
      .update({
        status: "closed",
        checkout_token_hash: null,
        checkout_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("status", "pending")
      .select("id, status")
      .single();
    if (updateError || !updated) {
      return res.status(409).json({ error: "Order state changed; refresh and try again" });
    }
    return res.status(200).json(updated);
  } catch {
    return res.status(502).json({ error: "Unable to close the Alipay order" });
  }
}
