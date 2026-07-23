import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash, timingSafeEqual } from "node:crypto";
import { createAlipayOrder, formatYuan } from "../../../../server/commerce-api/alipay.js";
import { firstQueryValue } from "../../../../server/commerce-api/marketplace.js";
import { supabase } from "../../../../server/commerce-api/supabase.js";

function safeTokenEquals(token: string, expectedHash: string): boolean {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token) || !/^[a-f0-9]{64}$/.test(expectedHash)) {
    return false;
  }
  const actual = createHash("sha256").update(token).digest();
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function page(title: string, message: string, form = ""): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${title} · Codex Themes</title><style>:root{color-scheme:dark}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0d1017;color:#f7f3ea;display:grid;place-items:center;min-height:100vh;margin:0}main{width:min(420px,calc(100vw - 48px));padding:36px;border:1px solid #2b3446;border-radius:24px;background:#151a24}p{color:#aeb8ca;line-height:1.7}</style></head><body><main><h1>${title}</h1><p>${message}</p>${form}</main></body></html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).send(page("无法打开收银台", "请求方式不受支持。"));
  const orderId = firstQueryValue(req.query.id);
  const token = firstQueryValue(req.query.token);
  if (!orderId || !token) return res.status(400).send(page("支付链接无效", "请返回应用重新发起。"));

  const { data: order, error } = await supabase
    .from("point_orders")
    .select("id, price_cents, base_points, bonus_points, status, out_trade_no, checkout_token_hash, checkout_expires_at")
    .eq("id", orderId)
    .single();
  if (error || !order || !order.checkout_token_hash || !order.checkout_expires_at) {
    return res.status(404).send(page("订单不存在", "请返回应用重新发起。"));
  }
  if (!safeTokenEquals(token, order.checkout_token_hash)) {
    return res.status(403).send(page("支付链接无效", "链接无法验证。"));
  }
  if (Date.parse(order.checkout_expires_at) <= Date.now()) {
    return res.status(410).send(page("支付链接已过期", "请返回应用重新发起。"));
  }
  if (order.status === "paid") return res.status(200).send(page("积分已经到账", "请返回 Codex Themes 查看余额。"));
  if (order.status !== "pending") return res.status(409).send(page("订单无法支付", "当前订单已经关闭。"));

  try {
    const totalPoints = order.base_points + order.bonus_points;
    const { form } = createAlipayOrder({
      outTradeNo: order.out_trade_no,
      totalAmount: formatYuan(order.price_cents),
      subject: `Codex Themes ${totalPoints} 积分`,
    });
    return res.status(200).send(page("正在前往支付宝", "完成支付后积分将自动到账。", form));
  } catch {
    return res.status(500).send(page("收银台暂时不可用", "支付服务配置尚未就绪。"));
  }
}
