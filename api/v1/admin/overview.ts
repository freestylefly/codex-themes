import type { VercelRequest, VercelResponse } from "@vercel/node";
import { mapPointOrder, requireAdmin } from "../../../server/commerce-api/marketplace.js";
import { supabase } from "../../../server/commerce-api/supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!(await requireAdmin(req, res))) return;

  const [
    pending,
    community,
    pointOrders,
    accounts,
    recentOrders,
    recentLedger,
    communityProducts,
    entitlementSales,
    paidThemeOrders,
    recentThemeOrders,
  ] = await Promise.all([
    supabase.from("theme_submissions").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("theme_products").select("*", { count: "exact", head: true }).eq("origin", "community").eq("published", true),
    supabase.from("point_orders").select("price_cents, status").eq("status", "paid"),
    supabase.from("point_accounts").select("user_id, balance, lifetime_purchased, lifetime_earned, lifetime_spent"),
    supabase
      .from("point_orders")
      .select("id, user_id, pack_id, price_cents, base_points, bonus_points, status, out_trade_no, created_at, paid_at, refunded_at, point_packs(name)")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("point_ledger_entries")
      .select("id, user_id, delta, balance_after, entry_type, theme_id, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("theme_products")
      .select("id, name, unlock_count")
      .eq("origin", "community")
      .order("unlock_count", { ascending: false })
      .limit(100),
    supabase
      .from("entitlements")
      .select("theme_id, points_spent, creator_reward_points")
      .gt("points_spent", 0)
      .limit(5000),
    supabase.from("orders").select("price_cents").eq("status", "paid"),
    supabase
      .from("orders")
      .select("id, user_id, theme_id, price_cents, status, out_trade_no, created_at, paid_at, theme_products(name)")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const accountRows = accounts.data ?? [];
  const paidRows = pointOrders.data ?? [];
  const profileIds = accountRows.map((row) => row.user_id);
  const profiles = profileIds.length > 0
    ? await supabase
        .from("profiles")
        .select("id, handle, display_name")
        .in("id", profileIds)
    : { data: [] };
  const profileMap = new Map((profiles.data ?? []).map((profile) => [profile.id, profile]));
  const salesTotals = new Map<string, { pointsSpent: number; creatorRewards: number }>();
  for (const entitlement of entitlementSales.data ?? []) {
    const current = salesTotals.get(entitlement.theme_id) ?? { pointsSpent: 0, creatorRewards: 0 };
    current.pointsSpent += entitlement.points_spent;
    current.creatorRewards += entitlement.creator_reward_points;
    salesTotals.set(entitlement.theme_id, current);
  }
  return res.status(200).json({
    pendingSubmissions: pending.count ?? 0,
    publishedCommunityThemes: community.count ?? 0,
    paidPointOrders: paidRows.length,
    paidThemeOrders: (paidThemeOrders.data ?? []).length,
    grossPointRevenueCents: paidRows.reduce((sum, row) => sum + row.price_cents, 0),
    grossThemeRevenueCents: (paidThemeOrders.data ?? []).reduce((sum, row) => sum + row.price_cents, 0),
    pointsInCirculation: accountRows.reduce((sum, row) => sum + row.balance, 0),
    lifetimePointsPurchased: accountRows.reduce((sum, row) => sum + row.lifetime_purchased, 0),
    lifetimeCreatorRewards: accountRows.reduce((sum, row) => sum + row.lifetime_earned, 0),
    lifetimePointsSpent: accountRows.reduce((sum, row) => sum + row.lifetime_spent, 0),
    recentPointOrders: (recentOrders.data ?? []).map((item) =>
      mapPointOrder(item as unknown as Record<string, unknown>),
    ),
    recentThemeOrders: (recentThemeOrders.data ?? []).map((item) => ({
      id: item.id,
      userId: item.user_id,
      themeId: item.theme_id,
      themeName:
        (item.theme_products as unknown as { name?: string } | null)?.name
        ?? item.theme_id,
      priceCents: item.price_cents,
      status: item.status,
      outTradeNo: item.out_trade_no,
      createdAt: item.created_at,
      paidAt: item.paid_at,
    })),
    recentLedger: (recentLedger.data ?? []).map((item) => ({
      id: item.id,
      userId: item.user_id,
      delta: item.delta,
      balanceAfter: item.balance_after,
      entryType: item.entry_type,
      themeId: item.theme_id,
      reason: item.reason,
      createdAt: item.created_at,
    })),
    userBalances: accountRows.map((account) => {
      const profile = profileMap.get(account.user_id);
      return {
        userId: account.user_id,
        handle: profile?.handle ?? null,
        displayName: profile?.display_name ?? profile?.handle ?? "用户",
        balance: account.balance,
        lifetimePurchased: account.lifetime_purchased,
        lifetimeEarned: account.lifetime_earned,
        lifetimeSpent: account.lifetime_spent,
      };
    }),
    themeSales: (communityProducts.data ?? []).map((theme) => ({
      themeId: theme.id,
      name: theme.name,
      unlockCount: theme.unlock_count,
      pointsSpent: salesTotals.get(theme.id)?.pointsSpent ?? 0,
      creatorRewards: salesTotals.get(theme.id)?.creatorRewards ?? 0,
    })),
  });
}
