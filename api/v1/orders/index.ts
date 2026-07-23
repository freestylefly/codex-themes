import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { supabase } from "../../../server/commerce-api/supabase.js";
import { getAuthToken, verifyUser } from "../../../server/commerce-api/auth.js";

function sanitizeIdempotencyKey(raw: unknown): string {
  if (typeof raw === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(raw)) return raw;
  return randomUUID();
}

function commerceBaseUrl(): URL {
  const value = process.env.COMMERCE_API_URL;
  if (!value) throw new Error("COMMERCE_API_URL must be set.");
  const url = new URL(value);
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) {
    throw new Error("COMMERCE_API_URL must use HTTPS, except for localhost development.");
  }
  return url;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const token = getAuthToken(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const user = await verifyUser(token);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { themeId, idempotencyKey } = req.body as {
    themeId?: string;
    idempotencyKey?: string;
  };
  if (!themeId || typeof themeId !== "string") {
    return res.status(400).json({ error: "themeId is required" });
  }

  const { data: product, error: productError } = await supabase
    .from("theme_products")
    .select("id, name, price_cents, price_points, creator_share_bps, author_id, published, downloads_enabled")
    .eq("id", themeId)
    .single();
  if (productError || !product) return res.status(404).json({ error: "Theme not found" });
  if (!product.published || !product.downloads_enabled) {
    return res.status(404).json({ error: "Theme not available" });
  }
  if (product.price_cents <= 0) {
    return res.status(409).json({ error: "This theme is free; unlock it without payment" });
  }
  if (product.author_id === user.id) {
    return res.status(409).json({ error: "Creators already own their published themes" });
  }

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

  const key = sanitizeIdempotencyKey(idempotencyKey);
  const outTradeNo =
    `ct-${createHash("sha256").update(`${user.id}:${themeId}:${key}`).digest("hex").slice(0, 24)}`;
  const checkoutToken = randomBytes(32).toString("base64url");
  const checkoutTokenHash = createHash("sha256").update(checkoutToken).digest("hex");
  const checkoutExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const creatorRewardPoints = product.author_id && product.author_id !== user.id
    ? Math.floor(product.price_points * product.creator_share_bps / 10_000)
    : 0;

  let { data: order } = await supabase
    .from("orders")
    .select("id, theme_id, price_cents, status, out_trade_no, created_at, paid_at")
    .eq("out_trade_no", outTradeNo)
    .maybeSingle();

  if (!order) {
    const inserted = await supabase
      .from("orders")
      .insert({
        user_id: user.id,
        theme_id: themeId,
        price_cents: product.price_cents,
        status: "pending",
        out_trade_no: outTradeNo,
        checkout_token_hash: checkoutTokenHash,
        checkout_expires_at: checkoutExpiresAt,
        creator_id: product.author_id,
        creator_reward_points: creatorRewardPoints,
      })
      .select("id, theme_id, price_cents, status, out_trade_no, created_at, paid_at")
      .single();
    if (inserted.error || !inserted.data) {
      console.error("create order error:", inserted.error);
      return res.status(500).json({ error: "Failed to create order" });
    }
    order = inserted.data;
  } else if (order.status === "pending") {
    const refreshed = await supabase
      .from("orders")
      .update({
        checkout_token_hash: checkoutTokenHash,
        checkout_expires_at: checkoutExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("status", "pending")
      .select("id, theme_id, price_cents, status, out_trade_no, created_at, paid_at")
      .single();
    if (refreshed.data) order = refreshed.data;
  }

  const checkoutUrl = new URL(`/api/v1/orders/${order.id}/checkout`, commerceBaseUrl());
  checkoutUrl.searchParams.set("token", checkoutToken);
  return res.status(201).json({
    id: order.id,
    themeId: order.theme_id,
    themeName: product.name,
    priceCents: order.price_cents,
    status: order.status,
    outTradeNo: order.out_trade_no,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    checkoutUrl: order.status === "pending" ? checkoutUrl.toString() : undefined,
  });
}
