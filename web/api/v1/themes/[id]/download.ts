import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../../lib/supabase";
import { getAuthToken, verifyUser } from "../../../lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = getAuthToken(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const user = await verifyUser(token);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.query;
  const themeId = Array.isArray(id) ? id[0] : id;
  if (!themeId) return res.status(400).json({ error: "Theme id is required" });

  // Verify entitlement.
  const { data: entitlement, error: entitlementError } = await supabase
    .from("entitlements")
    .select("id")
    .eq("user_id", user.id)
    .eq("theme_id", themeId)
    .eq("status", "active")
    .maybeSingle();
  if (entitlementError || !entitlement) {
    return res.status(403).json({ error: "Theme not purchased" });
  }

  // Read private asset path.
  const { data: asset, error: assetError } = await supabase
    .schema("private")
    .from("theme_assets")
    .select("storage_path, sha256")
    .eq("theme_id", themeId)
    .single();

  if (assetError || !asset) {
    return res.status(404).json({ error: "Theme package not found" });
  }

  // Create a short-lived signed URL (5 minutes).
  const { data: signed, error: signedError } = await supabase.storage
    .from("paid-themes")
    .createSignedUrl(asset.storage_path, 5 * 60);

  if (signedError || !signed) {
    console.error("signed url error:", signedError);
    return res.status(500).json({ error: "Failed to create download URL" });
  }

  return res.status(200).json({ signedUrl: signed.signedUrl, sha256: asset.sha256 });
}
