import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../../../server/commerce-api/supabase.js";
import { getAuthToken, verifyUser } from "../../../../server/commerce-api/auth.js";
import {
  formatYuan,
  queryAlipayRefund,
  refundAlipayOrder,
} from "../../../../server/commerce-api/alipay.js";

function orderId(req: VercelRequest): string | null {
  const value = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  return value || null;
}

function outRequestNo(id: string): string {
  return `rf-${id.replaceAll("-", "")}`;
}

function publicResult(result: Record<string, unknown>) {
  return {
    code: result.code,
    subCode: result.sub_code ?? null,
    refundStatus: result.refund_status ?? null,
    refundAmount: result.refund_amount ?? result.refund_fee ?? null,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (process.env.ENABLE_SELF_SERVICE_REFUNDS?.trim().toLowerCase() !== "true") {
    return res.status(403).json({ error: "Self-service refunds are disabled" });
  }

  const token = getAuthToken(req);
  const user = token ? await verifyUser(token) : null;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const id = orderId(req);
  if (!id) return res.status(400).json({ error: "Order id is required" });

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, user_id, price_cents, status, out_trade_no")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (error || !order) return res.status(404).json({ error: "Order not found" });

  const requestNo = outRequestNo(order.id);
  if (req.method === "GET") {
    try {
      const result = await queryAlipayRefund({
        outTradeNo: order.out_trade_no,
        outRequestNo: requestNo,
      });
      return res.status(result.code === "10000" ? 200 : 502).json(publicResult(result));
    } catch {
      return res.status(502).json({ error: "Unable to query the Alipay refund" });
    }
  }

  if (order.status === "refunded") {
    return res.status(200).json({ id: order.id, status: "refunded", outRequestNo: requestNo });
  }
  if (order.status !== "paid") {
    return res.status(409).json({ error: "Only paid orders can be refunded" });
  }

  const reason =
    typeof req.body?.reason === "string" && req.body.reason.trim()
      ? req.body.reason.trim().slice(0, 256)
      : "用户申请退款";

  const audit = await supabase.from("refund_requests").upsert(
    {
      order_id: order.id,
      user_id: user.id,
      out_request_no: requestNo,
      amount_cents: order.price_cents,
      status: "requested",
    },
    { onConflict: "out_request_no", ignoreDuplicates: true },
  );
  if (audit.error) {
    return res.status(500).json({ error: "Failed to create refund audit record" });
  }

  const begun = await supabase.rpc("begin_theme_order_refund", {
    p_order_id: order.id,
    p_user_id: user.id,
    p_reason: reason,
  });
  if (begun.error || !begun.data) {
    return res.status(409).json({
      error: begun.error?.message ?? "Refund cannot be started",
    });
  }

  try {
    const result = await refundAlipayOrder({
      outTradeNo: order.out_trade_no,
      refundAmount: formatYuan(order.price_cents),
      outRequestNo: requestNo,
      reason,
    });
    if (result.code !== "10000") {
      await supabase.rpc("complete_theme_order_refund", {
        p_order_id: order.id,
        p_success: false,
      });
      await supabase
        .from("refund_requests")
        .update({
          status: "failed",
          alipay_result: publicResult(result),
          updated_at: new Date().toISOString(),
        })
        .eq("out_request_no", requestNo);
      return res.status(502).json({
        error: "Alipay rejected the refund request",
        ...publicResult(result),
      });
    }

    const { data: refunded, error: refundError } = await supabase.rpc("complete_theme_order_refund", {
      p_order_id: order.id,
      p_success: true,
    });
    if (refundError) {
      return res.status(500).json({ error: "Refund succeeded but local reconciliation is pending" });
    }
    await supabase
      .from("refund_requests")
      .update({
        status: "succeeded",
        alipay_result: publicResult(result),
        updated_at: new Date().toISOString(),
      })
      .eq("out_request_no", requestNo);
    return res.status(200).json({
      id: (refunded as { id?: string } | null)?.id ?? order.id,
      status: "refunded",
      outRequestNo: requestNo,
    });
  } catch {
    await supabase.rpc("complete_theme_order_refund", {
      p_order_id: order.id,
      p_success: false,
    });
    await supabase
      .from("refund_requests")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("out_request_no", requestNo);
    return res.status(502).json({ error: "Unable to submit the Alipay refund" });
  }
}
