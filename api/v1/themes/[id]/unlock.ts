import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../../../server/commerce-api/supabase.js";
import { firstQueryValue, requireUser } from "../../../../server/commerce-api/marketplace.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const user = await requireUser(req, res);
  if (!user) return;
  const themeId = firstQueryValue(req.query.id);
  if (!themeId) return res.status(400).json({ error: "Theme id is required" });

  const { data, error } = await supabase.rpc("unlock_theme_with_points", {
    p_user_id: user.id,
    p_theme_id: themeId,
  });
  if (error) {
    const message = error.message ?? "";
    if (message.includes("Insufficient points")) {
      return res.status(402).json({ error: "Insufficient points" });
    }
    if (message.includes("not available")) {
      return res.status(404).json({ error: "Theme not available" });
    }
    console.error("unlock theme error:", error);
    return res.status(500).json({ error: "Failed to unlock theme" });
  }

  const entitlement = data as Record<string, unknown>;
  const { data: account } = await supabase
    .from("point_accounts")
    .select("balance")
    .eq("user_id", user.id)
    .single();
  return res.status(200).json({
    themeId: entitlement.theme_id,
    version: entitlement.version,
    status: entitlement.status,
    acquisitionType: entitlement.acquisition_type,
    pointsSpent: entitlement.points_spent,
    creatorRewardPoints: entitlement.creator_reward_points,
    balance: account?.balance ?? 0,
  });
}
