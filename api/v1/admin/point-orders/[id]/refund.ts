import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import {
  formatYuan,
  refundAlipayOrder,
} from "../../../../../server/commerce-api/alipay.js";
import {
  cleanText,
  firstQueryValue,
  mapPointOrder,
  requireAdmin,
} from "../../../../../server/commerce-api/marketplace.js";
import { supabase } from "../../../../../server/commerce-api/supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const orderId = firstQueryValue(req.query.id);
  const reason = cleanText(req.body?.reason, 256);
  if (!orderId || reason.length < 3) return res.status(400).json({ error: "Refund reason is required" });

  const outRequestNo = `ctr-${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const begun = await supabase.rpc("begin_point_order_refund", {
    p_order_id: orderId,
    p_admin_id: admin.id,
    p_out_request_no: outRequestNo,
    p_reason: reason,
  });
  if (begun.error || !begun.data) {
    return res.status(409).json({ error: begun.error?.message ?? "Refund cannot be started" });
  }
  const order = begun.data as Record<string, unknown>;

  try {
    const result = await refundAlipayOrder({
      outTradeNo: String(order.out_trade_no),
      refundAmount: formatYuan(Number(order.price_cents)),
      outRequestNo,
      reason,
    });
    const success = result.code === "10000";
    const completed = await supabase.rpc("complete_point_order_refund", {
      p_order_id: orderId,
      p_success: success,
    });
    if (completed.error || !completed.data) {
      return res.status(500).json({ error: "Refund state could not be finalized" });
    }
    return success
      ? res.status(200).json(mapPointOrder(completed.data as Record<string, unknown>))
      : res.status(502).json({ error: result.sub_msg ?? result.msg ?? "Alipay refund failed" });
  } catch (error) {
    await supabase.rpc("complete_point_order_refund", {
      p_order_id: orderId,
      p_success: false,
    });
    return res.status(502).json({ error: (error as Error).message });
  }
}
