import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash, randomUUID } from "node:crypto";
import { supabase } from "../../lib/supabase.js";
import { getAuthToken, verifyUser } from "../../lib/auth.js";
import { createAlipayOrder, createAlipayWapOrder, formatYuan } from "../../lib/alipay.js";

function sanitizeIdempotencyKey(raw: unknown): string {
  if (typeof raw === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(raw)) return raw;
  return randomUUID();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = getAuthToken(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const user = await verifyUser(token);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { themeId, idempotencyKey } = req.body as { themeId?: string; idempotencyKey?: string };
  if (!themeId || typeof themeId !== "string") {
    return res.status(400).json({ error: "themeId is required" });
  }

  // Read product price from the catalog; never trust client-submitted prices.
  const { data: product, error: productError } = await supabase
    .from("theme_products")
    .select("id, name, price_cents, published")
    .eq("id", themeId)
    .single();
  if (productError || !product) {
    return res.status(404).json({ error: "Theme not found" });
  }
  if (!product.published) {
    return res.status(404).json({ error: "Theme not available" });
  }

  // Check entitlement first to avoid duplicate paid orders.
  const { data: existingEntitlement } = await supabase
    .from("entitlements")
    .select("id")
    .eq("user_id", user.id)
    .eq("theme_id", themeId)
    .eq("status", "active")
    .maybeSingle();
  if (existingEntitlement) {
    return res.status(409).json({ error: "Theme already owned" });
  }

  // Deterministic out_trade_no from idempotency key.
  const key = sanitizeIdempotencyKey(idempotencyKey);
  const outTradeNo = `ct-${createHash("sha256").update(`${user.id}:${themeId}:${key}`).digest("hex").slice(0, 24)}`;

  // Upsert order idempotently.
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .upsert(
      {
        user_id: user.id,
        theme_id: themeId,
        price_cents: product.price_cents,
        status: "pending",
        out_trade_no: outTradeNo,
      },
      { onConflict: "out_trade_no", ignoreDuplicates: false },
    )
    .select("id, theme_id, price_cents, status, out_trade_no, created_at")
    .single();

  if (orderError || !order) {
    console.error("create order error:", orderError);
    return res.status(500).json({ error: "Failed to create order" });
  }

  try {
    const userAgent = req.headers["user-agent"] ?? "";
    const isMobile = /Mobile|Android|iPhone/i.test(userAgent);
    const { form } = isMobile
      ? await createAlipayWapOrder({
          outTradeNo,
          totalAmount: formatYuan(product.price_cents),
          subject: product.name,
        })
      : await createAlipayOrder({
          outTradeNo,
          totalAmount: formatYuan(product.price_cents),
          subject: product.name,
        });

    return res.status(201).json({
      id: order.id,
      themeId: order.theme_id,
      themeName: product.name,
      priceCents: order.price_cents,
      status: order.status,
      outTradeNo: order.out_trade_no,
      createdAt: order.created_at,
      paidAt: null,
      checkoutUrl: form,
    });
  } catch (error) {
    console.error("alipay order creation error:", error);
    return res.status(500).json({ error: "Failed to create Alipay order" });
  }
}
