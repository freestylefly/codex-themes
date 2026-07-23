import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import {
  formatYuan,
  refundAlipayOrder,
} from "../../../../../server/commerce-api/alipay.js";
import {
  cleanText,
  firstQueryValue,
  requireAdmin,
} from "../../../../../server/commerce-api/marketplace.js";
import { supabase } from "../../../../../server/commerce-api/supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await requireAdmin(req, res))) return;
  const orderId = firstQueryValue(req.query.id);
  const reason = cleanText(req.body?.reason, 256);
  if (!orderId || reason.length < 3) {
    return res.status(400).json({ error: "Refund reason is required" });
  }
  const { data: order } = await supabase
    .from("orders")
    .select("id, user_id, theme_id, price_cents, status, out_trade_no, created_at, paid_at, theme_products(name)")
    .eq("id", orderId)
    .single();
  if (!order) return res.status(404).json({ error: "Order not found" });

  const outRequestNo = `rft-${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const audit = await supabase.from("refund_requests").insert({
    order_id: order.id,
    user_id: order.user_id,
    out_request_no: outRequestNo,
    amount_cents: order.price_cents,
    status: "requested",
  });
  if (audit.error) return res.status(500).json({ error: "Failed to create refund audit record" });

  const begun = await supabase.rpc("begin_theme_order_refund", {
    p_order_id: order.id,
    p_user_id: order.user_id,
    p_reason: reason,
  });
  if (begun.error || !begun.data) {
    await supabase
      .from("refund_requests")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("out_request_no", outRequestNo);
    return res.status(409).json({ error: begun.error?.message ?? "Refund cannot be started" });
  }

  try {
    const result = await refundAlipayOrder({
      outTradeNo: order.out_trade_no,
      refundAmount: formatYuan(order.price_cents),
      outRequestNo,
      reason,
    });
    const success = result.code === "10000";
    const completed = await supabase.rpc("complete_theme_order_refund", {
      p_order_id: order.id,
      p_success: success,
    });
    if (completed.error || !completed.data) {
      return res.status(500).json({ error: "Refund state could not be finalized" });
    }
    if (!success) {
      await supabase
        .from("refund_requests")
        .update({
          status: "failed",
          alipay_result: result,
          updated_at: new Date().toISOString(),
        })
        .eq("out_request_no", outRequestNo);
      return res.status(502).json({ error: result.sub_msg ?? result.msg ?? "Alipay refund failed" });
    }
    await supabase
      .from("refund_requests")
      .update({
        status: "succeeded",
        alipay_result: result,
        updated_at: new Date().toISOString(),
      })
      .eq("out_request_no", outRequestNo);
    const current = completed.data as Record<string, unknown>;
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
  } catch (error) {
    await supabase.rpc("complete_theme_order_refund", {
      p_order_id: order.id,
      p_success: false,
    });
    await supabase
      .from("refund_requests")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("out_request_no", outRequestNo);
    return res.status(502).json({ error: (error as Error).message });
  }
}
