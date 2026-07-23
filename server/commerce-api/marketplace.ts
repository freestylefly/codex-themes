import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import { getAuthToken, verifyUser, type VerifiedUser } from "./auth.js";
import { supabase } from "./supabase.js";

export const POINT_PRICE_TIERS = [0, 49, 99, 199, 399] as const;

export function firstQueryValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export function isPointPrice(value: unknown): value is number {
  return (
    typeof value === "number"
    && Number.isInteger(value)
    && (POINT_PRICE_TIERS as readonly number[]).includes(value)
  );
}

export function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function requireUser(
  req: VercelRequest,
  res: VercelResponse,
): Promise<VerifiedUser | null> {
  const token = getAuthToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const user = await verifyUser(token);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return user;
}

export async function userIsAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function requireAdmin(
  req: VercelRequest,
  res: VercelResponse,
): Promise<VerifiedUser | null> {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (!(await userIsAdmin(user.id))) {
    res.status(403).json({ error: "Admin role required" });
    return null;
  }
  return user;
}

export function newIdempotencyKey(prefix: string): string {
  return `${prefix}:${randomUUID()}`;
}

export function commerceBaseUrl(): URL {
  const value = process.env.COMMERCE_API_URL;
  if (!value) throw new Error("COMMERCE_API_URL must be set.");
  const url = new URL(value);
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) {
    throw new Error("COMMERCE_API_URL must use HTTPS, except for localhost development.");
  }
  return url;
}

export function mapThemeProduct(item: Record<string, unknown>) {
  const profile = item.profiles as
    | {
        handle?: string | null;
        display_name?: string | null;
        avatar_url?: string | null;
        custom_avatar_url?: string | null;
      }
    | null
    | undefined;
  return {
    id: item.id,
    name: item.name,
    tagline: item.tagline,
    description: item.description,
    version: item.version,
    layout: item.layout,
    previewUrl: item.preview_url,
    priceCents: item.price_cents,
    pricePoints: item.price_points,
    minEngineVersion: item.min_engine_version,
    published: item.published,
    origin: item.origin,
    authorId: item.author_id,
    author: profile
      ? {
          handle: profile.handle ?? null,
          displayName: profile.display_name ?? profile.handle ?? "创作者",
          avatarUrl: profile.custom_avatar_url ?? profile.avatar_url ?? null,
        }
      : null,
    unlockCount: item.unlock_count,
    downloadsEnabled: item.downloads_enabled,
    publishedAt: item.published_at,
  };
}

export function mapCreatorProfile(
  item: Record<string, unknown>,
  isAdmin: boolean,
) {
  return {
    id: item.id,
    email: item.email,
    handle: item.handle,
    displayName: item.display_name,
    avatarUrl: item.custom_avatar_url ?? item.avatar_url ?? null,
    provider: item.provider,
    createdAt: item.created_at,
    isAdmin,
  };
}

export function mapPointOrder(item: Record<string, unknown>) {
  return {
    id: item.id,
    userId: item.user_id,
    packId: item.pack_id,
    packName:
      (item.point_packs as { name?: string } | null | undefined)?.name
      ?? item.pack_id,
    priceCents: item.price_cents,
    basePoints: item.base_points,
    bonusPoints: item.bonus_points,
    totalPoints: Number(item.base_points) + Number(item.bonus_points),
    status: item.status,
    outTradeNo: item.out_trade_no,
    createdAt: item.created_at,
    paidAt: item.paid_at,
    refundedAt: item.refunded_at,
  };
}

export function mapSubmission(item: Record<string, unknown>) {
  return {
    id: item.id,
    themeId: item.theme_id,
    authorId: item.author_id,
    revision: item.revision,
    version: item.version,
    sourceKind: item.source_kind,
    status: item.status,
    proposedPricePoints: item.proposed_price_points,
    approvedPricePoints: item.approved_price_points,
    name: item.name,
    tagline: item.tagline,
    description: item.description,
    layout: item.layout,
    previewUrl: item.preview_url,
    submittedAt: item.submitted_at,
    reviewedAt: item.reviewed_at,
    reviewReason: item.review_reason,
    createdAt: item.created_at,
  };
}
