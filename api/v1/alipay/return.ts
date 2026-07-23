import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../../server/commerce-api/supabase.js";
import { verifyAlipayParams } from "../../../server/commerce-api/alipay.js";

function queryParams(req: VercelRequest): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(req.query)) {
    result[key] = Array.isArray(value) ? value[0] : value;
  }
  return result;
}

function renderResult(orderId: string | null, kind: "theme" | "points" = "theme"): string {
  const queryKey = kind === "points" ? "pointOrderId" : "orderId";
  const deepLink = orderId
    ? `codexthemes://payment/result?${queryKey}=${encodeURIComponent(orderId)}`
    : "codexthemes://payment/result";
  const heading = orderId ? "支付结果确认中" : "返回 Codex Themes";
  const message = orderId
    ? "页面返回不代表支付成功。客户端将通过支付宝查单确认结果，请稍候查看已购主题。"
    : "未能验证本次同步返回。请回到 Codex Themes，应用会通过安全查单确认最终支付状态。";

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="referrer" content="no-referrer" />
    <title>支付结果 · Codex Themes</title>
    <style>
      :root { color-scheme: dark; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0d1017; color: #f7f3ea; display: grid; place-items: center; min-height: 100vh; margin: 0; }
      main { width: min(440px, calc(100vw - 48px)); padding: 38px; border: 1px solid #2b3446; border-radius: 24px; background: #151a24; text-align: center; box-shadow: 0 24px 80px #0008; }
      h1 { margin: 0 0 12px; font-size: 24px; }
      p { margin: 0 0 24px; color: #aeb8ca; line-height: 1.7; }
      a { display: inline-flex; padding: 12px 20px; border-radius: 999px; color: #111827; background: #edbd58; font-weight: 700; text-decoration: none; }
    </style>
  </head>
  <body>
    <main>
      <h1>${heading}</h1>
      <p>${message}</p>
      <a href="${deepLink}">打开 Codex Themes</a>
    </main>
  </body>
</html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");

  if (req.method !== "GET") {
    return res.status(405).send(renderResult(null));
  }

  const params = queryParams(req);
  const outTradeNo = typeof params.out_trade_no === "string" ? params.out_trade_no : null;
  if (!outTradeNo || !params.sign) {
    return res.status(200).send(renderResult(null));
  }

  try {
    if (!verifyAlipayParams(params)) {
      return res.status(200).send(renderResult(null));
    }
    if (outTradeNo.startsWith("ctp-")) {
      const { data: pointOrder } = await supabase
        .from("point_orders")
        .select("id")
        .eq("out_trade_no", outTradeNo)
        .maybeSingle();
      return res.status(200).send(renderResult(pointOrder?.id ?? null, "points"));
    }
    const { data: order } = await supabase
      .from("orders")
      .select("id")
      .eq("out_trade_no", outTradeNo)
      .maybeSingle();
    return res.status(200).send(renderResult(order?.id ?? null, "theme"));
  } catch {
    return res.status(200).send(renderResult(null));
  }
}
