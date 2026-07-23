import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../../server/commerce-api/supabase.js";
import {
  expectedSellerMatches,
  formatYuan,
  getAlipayRuntimeConfig,
  isPaidTradeNotification,
  normalizeYuan,
  verifyAlipayParams,
} from "../../../server/commerce-api/alipay.js";

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
      if (Buffer.byteLength(data, "utf8") > 128 * 1024) {
        reject(new Error("Notification body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        const result: Record<string, unknown> = {};
        for (const [key, value] of new URLSearchParams(data).entries()) {
          result[key] = value;
        }
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function text(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sanitizeNotification(body: Record<string, unknown>): Record<string, unknown> {
  const { sign: _sign, ...safeBody } = body;
  return safeBody;
}

function respond(res: VercelResponse, status: number, value: "success" | "fail") {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  return res.status(status).send(value);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return respond(res, 405, "fail");
  }

  try {
    const body = await readBody(req);
    if (!verifyAlipayParams(body)) {
      return respond(res, 400, "fail");
    }

    const appId = text(body, "app_id");
    const notifyId = text(body, "notify_id");
    const outTradeNo = text(body, "out_trade_no");
    const tradeNo = text(body, "trade_no");
    const tradeStatus = text(body, "trade_status");
    const totalAmount = text(body, "total_amount");
    const runtimeConfig = getAlipayRuntimeConfig();

    if (
      !appId
      || appId !== runtimeConfig.appId
      || !notifyId
      || !outTradeNo
      || !tradeNo
      || !tradeStatus
      || !totalAmount
      || !expectedSellerMatches(body)
    ) {
      return respond(res, 400, "fail");
    }

    const paidNotification = isPaidTradeNotification(body);
    if (outTradeNo.startsWith("ctp-")) {
      const { data: pointOrder, error: pointOrderError } = await supabase
        .from("point_orders")
        .select("id, price_cents, status")
        .eq("out_trade_no", outTradeNo)
        .single();
      if (
        pointOrderError
        || !pointOrder
        || normalizeYuan(totalAmount) !== formatYuan(pointOrder.price_cents)
      ) {
        return respond(res, 400, "fail");
      }

      const { error: pointEventError } = await supabase.from("payment_events").upsert(
        {
          point_order_id: pointOrder.id,
          notify_id: notifyId,
          event_type: paidNotification ? "alipay_point_payment_notify" : "alipay_point_trade_notify",
          payload: sanitizeNotification(body),
        },
        { onConflict: "notify_id", ignoreDuplicates: true },
      );
      if (pointEventError) return respond(res, 500, "fail");
      if (!paidNotification || pointOrder.status === "paid") {
        return respond(res, 200, "success");
      }

      const { error: fulfillPointError } = await supabase.rpc(
        "fulfill_point_order_payment",
        {
          p_order_id: pointOrder.id,
          p_paid_at: new Date().toISOString(),
          p_alipay_trade_no: tradeNo,
        },
      );
      return fulfillPointError
        ? respond(res, 500, "fail")
        : respond(res, 200, "success");
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, user_id, theme_id, price_cents, status, theme_products(version)")
      .eq("out_trade_no", outTradeNo)
      .single();

    if (orderError || !order || normalizeYuan(totalAmount) !== formatYuan(order.price_cents)) {
      return respond(res, 400, "fail");
    }

    const { error: eventError } = await supabase.from("payment_events").upsert(
      {
        order_id: order.id,
        notify_id: notifyId,
        event_type: paidNotification ? "alipay_payment_notify" : "alipay_trade_notify",
        payload: sanitizeNotification(body),
      },
      { onConflict: "notify_id", ignoreDuplicates: true },
    );
    if (eventError) {
      return respond(res, 500, "fail");
    }

    if (!paidNotification || order.status === "paid") {
      return respond(res, 200, "success");
    }

    const version = (order.theme_products as unknown as { version: string } | null)?.version ?? "1.0.0";
    const { error: fulfillError } = await supabase.rpc("fulfill_order_payment", {
      p_order_id: order.id,
      p_user_id: order.user_id,
      p_theme_id: order.theme_id,
      p_version: version,
      p_paid_at: new Date().toISOString(),
      p_alipay_trade_no: tradeNo,
    });
    if (fulfillError) {
      return respond(res, 500, "fail");
    }

    return respond(res, 200, "success");
  } catch {
    return respond(res, 500, "fail");
  }
}
