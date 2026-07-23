import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../server/commerce-api/supabase.js";
import { firstQueryValue, mapThemeProduct } from "../../server/commerce-api/marketplace.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const origin = firstQueryValue(req.query.origin);
  const sort = firstQueryValue(req.query.sort) ?? "latest";
  const q = (firstQueryValue(req.query.q) ?? "")
    .replace(/[%_,()]/g, "")
    .trim()
    .slice(0, 60);

  let query = supabase
    .from("theme_products")
    .select(`
      id, name, tagline, description, version, layout, preview_url,
      price_cents, price_points, min_engine_version, published, origin,
      author_id, unlock_count, downloads_enabled, published_at,
      profiles(handle, display_name, avatar_url, custom_avatar_url)
    `)
    .eq("published", true)
    .eq("downloads_enabled", true)
    .limit(100);

  if (origin === "official" || origin === "community") {
    query = query.eq("origin", origin);
  }
  if (q) {
    query = query.or(`name.ilike.%${q}%,tagline.ilike.%${q}%,description.ilike.%${q}%`);
  }
  if (sort === "popular") {
    query = query.order("unlock_count", { ascending: false }).order("id");
  } else if (sort === "price_asc") {
    query = query.order("price_points", { ascending: true }).order("id");
  } else if (sort === "price_desc") {
    query = query.order("price_points", { ascending: false }).order("id");
  } else {
    query = query.order("published_at", { ascending: false, nullsFirst: false }).order("id");
  }

  const { data, error } = await query;

  if (error) {
    console.error("catalog error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }

  return res.status(200).json(
    (data ?? []).map((item) => mapThemeProduct(item as unknown as Record<string, unknown>)),
  );
}
