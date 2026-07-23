import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash, timingSafeEqual } from "node:crypto";
import { supabase } from "../../../../server/commerce-api/supabase.js";
import { createAlipayOrder, formatYuan } from "../../../../server/commerce-api/alipay.js";

function safeTokenEquals(actualToken: string, expectedHash: string): boolean {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(actualToken) || !/^[a-f0-9]{64}$/.test(expectedHash)) {
    return false;
  }
  const actualHash = createHash("sha256").update(actualToken).digest();
  const expected = Buffer.from(expectedHash, "hex");
  return actualHash.length === expected.length && timingSafeEqual(actualHash, expected);
}

function renderMessage(title: string, message: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title} · Codex Themes</title>
    <style>
      :root { color-scheme: dark; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0d1017; color: #f7f3ea; display: grid; place-items: center; min-height: 100vh; margin: 0; }
      main { width: min(420px, calc(100vw - 48px)); padding: 36px; border: 1px solid #2b3446; border-radius: 24px; background: #151a24; box-shadow: 0 24px 80px #0008; }
      h1 { margin: 0 0 12px; font-size: 22px; }
      p { margin: 0; color: #aeb8ca; line-height: 1.7; }
    </style>
  </head>
  <body><main><h1>${title}</h1><p>${message}</p></main></body>
</html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");

  if (req.method !== "GET") {
    return res.status(405).send(renderMessage("无法打开收银台", "请求方式不受支持。"));
  }

  const rawId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const token = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token;
  if (!rawId || !token) {
    return res.status(400).send(renderMessage("支付链接无效", "请返回 Codex Themes 重新发起支付。"));
  }

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, price_cents, status, out_trade_no, checkout_token_hash, checkout_expires_at, theme_products(name)")
    .eq("id", rawId)
    .single();

  if (error || !order || !order.checkout_token_hash || !order.checkout_expires_at) {
    return res.status(404).send(renderMessage("订单不存在", "请返回 Codex Themes 重新选择主题。"));
  }
  if (!safeTokenEquals(token, order.checkout_token_hash)) {
    return res.status(403).send(renderMessage("支付链接无效", "这个链接无法验证，请返回应用重新发起支付。"));
  }
  if (Date.parse(order.checkout_expires_at) <= Date.now()) {
    return res.status(410).send(renderMessage("支付链接已过期", "支付链接 30 分钟内有效，请返回应用重新发起支付。"));
  }
  if (order.status === "paid") {
    return res.status(200).send(renderMessage("订单已经支付", "请返回 Codex Themes 查看并使用已购主题。"));
  }
  if (order.status !== "pending") {
    return res.status(409).send(renderMessage("订单无法支付", "当前订单已关闭，请返回应用重新发起支付。"));
  }

  try {
    const themeName = (order.theme_products as unknown as { name: string } | null)?.name ?? "Codex Themes 主题";
    const { form } = createAlipayOrder({
      outTradeNo: order.out_trade_no,
      totalAmount: formatYuan(order.price_cents),
      subject: themeName,
    });
    return res.status(200).send(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="referrer" content="no-referrer" />
    <title>正在前往支付宝 · Codex Themes</title>
  </head>
  <body>
    <noscript>请启用 JavaScript 后重新打开支付链接。</noscript>
    ${form}
  </body>
</html>`);
  } catch {
    return res.status(500).send(renderMessage("收银台暂时不可用", "支付服务配置尚未就绪，请稍后重试。"));
  }
}
