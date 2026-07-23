import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../lib/supabase.js";
import { verifyAlipayNotify } from "../../lib/alipay.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readBody(req: VercelRequest): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      try {
        const parsed = new URLSearchParams(data);
        const result: Record<string, unknown> = {};
        for (const [key, value] of parsed.entries()) {
          result[key] = value;
        }
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const body = await readBody(req);

  // Log the raw notification for audit.
  await supabase.from("payment_events").insert({
    event_type: "alipay_notify",
    payload: body,
  });

  if (!verifyAlipayNotify(body)) {
    return res.status(400).send("fail");
  }

  const appId = body.app_id as string | undefined;
  if (appId !== process.env.ALIPAY_APP_ID) {
    return res.status(400).send("fail");
  }

  const outTradeNo = body.out_trade_no as string | undefined;
  const tradeNo = body.trade_no as string | undefined;
  const tradeStatus = body.trade_status as string | undefined;
  const totalAmount = body.total_amount as string | undefined;
  const sellerId = body.seller_id as string | undefined;

  if (!outTradeNo || !tradeNo || !tradeStatus || !totalAmount) {
    return res.status(400).send("fail");
  }

  if (!["TRADE_SUCCESS", "TRADE_FINISHED"].includes(tradeStatus)) {
    return res.status(200).send("success");
  }

  // Look up the order and verify amount/seller.
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, user_id, theme_id, price_cents, status, theme_products(version)")
    .eq("out_trade_no", outTradeNo)
    .single();

  if (orderError || !order) {
    return res.status(200).send("success");
  }

  const expectedAmount = (order.price_cents / 100).toFixed(2);
  if (totalAmount !== expectedAmount) {
    return res.status(400).send("fail");
  }
  if (sellerId && sellerId !== process.env.ALIPAY_SELLER_ID) {
    return res.status(400).send("fail");
  }

  if (order.status === "paid") {
    return res.status(200).send("success");
  }

  // Idempotency: skip if a payment event already fulfilled this order.
  const { data: existingEvent } = await supabase
    .from("payment_events")
    .select("id")
    .eq("order_id", order.id)
    .eq("event_type", "order_fulfilled")
    .maybeSingle();
  if (existingEvent) {
    return res.status(200).send("success");
  }

  const version = (order.theme_products as unknown as { version: string } | null)?.version ?? "1.0.0";
  const { error: fulfillError } = await supabase.rpc("fulfill_order", {
    p_order_id: order.id,
    p_user_id: order.user_id,
    p_theme_id: order.theme_id,
    p_version: version,
    p_paid_at: new Date().toISOString(),
  });

  if (fulfillError) {
    console.error("notify fulfill error:", fulfillError);
    return res.status(500).send("fail");
  }

  await supabase.from("payment_events").insert({
    order_id: order.id,
    event_type: "order_fulfilled",
    payload: { trade_no: tradeNo, trade_status: tradeStatus },
  });

  return res.status(200).send("success");
}
