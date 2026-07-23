import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser } from "../../../server/commerce-api/marketplace.js";
import { supabase } from "../../../server/commerce-api/supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const user = await requireUser(req, res);
  if (!user) return;
  const { data, error } = await supabase
    .from("point_accounts")
    .select("balance, lifetime_purchased, lifetime_earned, lifetime_spent, updated_at")
    .eq("user_id", user.id)
    .single();
  if (error || !data) return res.status(500).json({ error: "Failed to load wallet" });
  return res.status(200).json({
    balance: data.balance,
    lifetimePurchased: data.lifetime_purchased,
    lifetimeEarned: data.lifetime_earned,
    lifetimeSpent: data.lifetime_spent,
    updatedAt: data.updated_at,
  });
}
