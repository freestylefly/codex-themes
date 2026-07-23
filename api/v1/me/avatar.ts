import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import {
  MAX_AVATAR_SOURCE_BYTES,
  normalizeAvatar,
} from "../../../server/commerce-api/avatar.js";
import {
  mapCreatorProfile,
  requireUser,
  userIsAdmin,
} from "../../../server/commerce-api/marketplace.js";
import { supabase } from "../../../server/commerce-api/supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const user = await requireUser(req, res);
  if (!user) return;

  const imageBase64 = typeof req.body?.imageBase64 === "string"
    ? req.body.imageBase64
    : "";
  if (!imageBase64 || imageBase64.length > MAX_AVATAR_SOURCE_BYTES * 1.4) {
    return res.status(400).json({ error: "Avatar image is missing or too large" });
  }

  const source = Buffer.from(imageBase64, "base64");
  if (source.length < 1 || source.length > MAX_AVATAR_SOURCE_BYTES) {
    return res.status(400).json({ error: "Avatar image must not exceed 3 MB" });
  }

  let normalized: Buffer;
  try {
    normalized = await normalizeAvatar(source);
  } catch {
    return res.status(400).json({ error: "Unsupported or invalid avatar image" });
  }

  const objectPath = `${user.id}/${Date.now()}-${randomUUID()}.webp`;
  const upload = await supabase.storage
    .from("avatars")
    .upload(objectPath, normalized, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
  if (upload.error) {
    console.error("avatar upload failed:", upload.error);
    return res.status(500).json({ error: "Failed to upload avatar" });
  }

  const publicUrl = supabase.storage.from("avatars").getPublicUrl(objectPath).data.publicUrl;
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ custom_avatar_url: publicUrl, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (updateError) {
    await supabase.storage.from("avatars").remove([objectPath]).catch(() => {});
    return res.status(500).json({ error: "Failed to update avatar" });
  }

  const [{ data: profile, error: profileError }, isAdmin] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, handle, display_name, avatar_url, custom_avatar_url, provider, created_at")
      .eq("id", user.id)
      .single(),
    userIsAdmin(user.id),
  ]);
  if (profileError || !profile) {
    return res.status(500).json({ error: "Failed to load updated profile" });
  }
  return res.status(200).json(
    mapCreatorProfile(profile as unknown as Record<string, unknown>, isAdmin),
  );
}
