import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../lib/supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).send("Method not allowed");
  }

  const outTradeNo = req.query.out_trade_no as string | undefined;
  if (!outTradeNo) {
    return res.status(400).send("Missing order id");
  }

  const { data: order } = await supabase
    .from("orders")
    .select("id")
    .eq("out_trade_no", outTradeNo)
    .maybeSingle();

  const orderId = order?.id ?? "";
  const deepLink = `codexthemes://payment/result?orderId=${encodeURIComponent(orderId)}`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(`
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>支付结果 · Codex Themes</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f1012; color: #e8e8e8; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
          .box { text-align: center; max-width: 420px; padding: 32px; }
          h1 { font-size: 20px; font-weight: 500; margin-bottom: 12px; }
          p { color: #9ca3af; line-height: 1.6; }
          a { color: #60a5fa; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="box">
          <h1>支付已处理</h1>
          <p>正在返回 Codex Themes 客户端。如果客户端没有自动打开，请手动切换回应用查看已购主题。{/* */}</p>
          <p><a href="${deepLink}">打开 Codex Themes</a></p>
        </div>
      </body>
    </html>
  `);
}
