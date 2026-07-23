import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser } from "../../../server/commerce-api/marketplace.js";
import { supabase } from "../../../server/commerce-api/supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const user = await requireUser(req, res);
  if (!user) return;
  const { data, error } = await supabase
    .from("point_ledger_entries")
    .select("id, delta, balance_after, entry_type, theme_id, reason, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return res.status(500).json({ error: "Failed to load point ledger" });
  return res.status(200).json(
    (data ?? []).map((item) => ({
      id: item.id,
      delta: item.delta,
      balanceAfter: item.balance_after,
      entryType: item.entry_type,
      themeId: item.theme_id,
      reason: item.reason,
      createdAt: item.created_at,
    })),
  );
}
