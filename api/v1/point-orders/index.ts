import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  commerceBaseUrl,
  mapPointOrder,
  requireUser,
} from "../../../server/commerce-api/marketplace.js";
import { supabase } from "../../../server/commerce-api/supabase.js";

function idempotencyKey(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value)
    ? value
    : randomUUID();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const user = await requireUser(req, res);
  if (!user) return;
  const packId = typeof req.body?.packId === "string" ? req.body.packId : "";
  if (!packId) return res.status(400).json({ error: "packId is required" });

  const { data: pack, error: packError } = await supabase
    .from("point_packs")
    .select("id, name, price_cents, base_points, bonus_points")
    .eq("id", packId)
    .eq("active", true)
    .single();
  if (packError || !pack) return res.status(404).json({ error: "Point pack not found" });

  const key = idempotencyKey(req.body?.idempotencyKey);
  const outTradeNo =
    `ctp-${createHash("sha256").update(`${user.id}:${pack.id}:${key}`).digest("hex").slice(0, 24)}`;
  const checkoutToken = randomBytes(32).toString("base64url");
  const checkoutTokenHash = createHash("sha256").update(checkoutToken).digest("hex");
  const checkoutExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  let { data: order } = await supabase
    .from("point_orders")
    .select("id, user_id, pack_id, price_cents, base_points, bonus_points, status, out_trade_no, created_at, paid_at, refunded_at, point_packs(name)")
    .eq("out_trade_no", outTradeNo)
    .maybeSingle();

  if (!order) {
    const inserted = await supabase
      .from("point_orders")
      .insert({
        user_id: user.id,
        pack_id: pack.id,
        price_cents: pack.price_cents,
        base_points: pack.base_points,
        bonus_points: pack.bonus_points,
        status: "pending",
        out_trade_no: outTradeNo,
        checkout_token_hash: checkoutTokenHash,
        checkout_expires_at: checkoutExpiresAt,
      })
      .select("id, user_id, pack_id, price_cents, base_points, bonus_points, status, out_trade_no, created_at, paid_at, refunded_at, point_packs(name)")
      .single();
    if (inserted.error || !inserted.data) {
      return res.status(500).json({ error: "Failed to create point order" });
    }
    order = inserted.data;
  } else if (order.status === "pending") {
    const refreshed = await supabase
      .from("point_orders")
      .update({
        checkout_token_hash: checkoutTokenHash,
        checkout_expires_at: checkoutExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("status", "pending")
      .select("id, user_id, pack_id, price_cents, base_points, bonus_points, status, out_trade_no, created_at, paid_at, refunded_at, point_packs(name)")
      .single();
    if (refreshed.data) order = refreshed.data;
  }

  const response = mapPointOrder(order as unknown as Record<string, unknown>);
  const checkoutUrl = new URL(
    `/api/v1/point-orders/${order.id}/checkout`,
    commerceBaseUrl(),
  );
  checkoutUrl.searchParams.set("token", checkoutToken);
  return res.status(201).json({
    ...response,
    checkoutUrl: order.status === "pending" ? checkoutUrl.toString() : undefined,
  });
}
