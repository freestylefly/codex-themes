import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../lib/supabase";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { data, error } = await supabase
    .from("theme_products")
    .select("id, name, tagline, description, version, layout, preview_url, price_cents, min_engine_version, published")
    .eq("published", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("catalog error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }

  return res.status(200).json(
    (data ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      tagline: item.tagline,
      description: item.description,
      version: item.version,
      layout: item.layout,
      previewUrl: item.preview_url,
      priceCents: item.price_cents,
      minEngineVersion: item.min_engine_version,
      published: item.published,
    })),
  );
}
