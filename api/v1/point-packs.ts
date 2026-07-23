import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../server/commerce-api/supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const { data, error } = await supabase
    .from("point_packs")
    .select("id, name, price_cents, base_points, bonus_points")
    .eq("active", true)
    .order("sort_order");
  if (error) return res.status(500).json({ error: "Failed to load point packs" });
  return res.status(200).json(
    (data ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      priceCents: item.price_cents,
      basePoints: item.base_points,
      bonusPoints: item.bonus_points,
      totalPoints: item.base_points + item.bonus_points,
    })),
  );
}
