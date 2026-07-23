import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../../server/commerce-api/supabase.js";
import { firstQueryValue, mapThemeProduct } from "../../../server/commerce-api/marketplace.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const themeId = firstQueryValue(req.query.id);
  if (!themeId) return res.status(400).json({ error: "Theme id is required" });

  const { data, error } = await supabase
    .from("theme_products")
    .select(`
      id, name, tagline, description, version, layout, preview_url,
      price_cents, price_points, min_engine_version, published, origin,
      author_id, unlock_count, downloads_enabled, published_at,
      profiles(handle, display_name, avatar_url, custom_avatar_url)
    `)
    .eq("id", themeId)
    .eq("published", true)
    .single();
  if (error || !data) return res.status(404).json({ error: "Theme not found" });
  return res.status(200).json(mapThemeProduct(data as unknown as Record<string, unknown>));
}
