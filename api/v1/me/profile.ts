import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  cleanText,
  mapCreatorProfile,
  requireUser,
  userIsAdmin,
} from "../../../server/commerce-api/marketplace.js";
import { supabase } from "../../../server/commerce-api/supabase.js";

const HANDLE_RE = /^[a-z0-9_]{3,24}$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === "PATCH") {
    const handle = cleanText(req.body?.handle, 24).toLowerCase();
    const displayName = cleanText(req.body?.displayName, 40);
    if (!HANDLE_RE.test(handle) || displayName.length < 2) {
      return res.status(400).json({ error: "Invalid public profile" });
    }
    const { error } = await supabase
      .from("profiles")
      .update({ handle, display_name: displayName, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    if (error?.code === "23505") {
      return res.status(409).json({ error: "Handle already in use" });
    }
    if (error) return res.status(500).json({ error: "Failed to update profile" });
  } else if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const [{ data: profile, error }, isAdmin] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, handle, display_name, avatar_url, custom_avatar_url, provider, created_at")
      .eq("id", user.id)
      .single(),
    userIsAdmin(user.id),
  ]);
  if (error || !profile) return res.status(404).json({ error: "Profile not found" });
  return res.status(200).json(
    mapCreatorProfile(profile as unknown as Record<string, unknown>, isAdmin),
  );
}
