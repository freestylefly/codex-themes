import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../lib/supabase";
import { getAuthToken, verifyUser } from "../../lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = getAuthToken(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const user = await verifyUser(token);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { data, error } = await supabase
    .from("entitlements")
    .select("theme_id, version, status, created_at, theme_products(name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("entitlements error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }

  return res.status(200).json(
    (data ?? []).map((item) => ({
      themeId: item.theme_id,
      themeName: (item.theme_products as unknown as { name: string } | null)?.name ?? item.theme_id,
      version: item.version,
      status: item.status,
      createdAt: item.created_at,
    })),
  );
}
