import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  mapSubmission,
  requireAdmin,
} from "../../../../server/commerce-api/marketplace.js";
import { supabase } from "../../../../server/commerce-api/supabase.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!(await requireAdmin(req, res))) return;
  const status = typeof req.query.status === "string" ? req.query.status : "pending";
  let query = supabase
    .from("theme_submissions")
    .select("*, profiles!theme_submissions_author_id_fkey(handle, display_name, avatar_url, custom_avatar_url)")
    .order("created_at", { ascending: true })
    .limit(100);
  if (["uploading", "pending", "approved", "rejected", "withdrawn"].includes(status)) {
    query = query.eq("status", status);
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: "Failed to load review queue" });

  const items = await Promise.all((data ?? []).map(async (item) => {
    const signed = item.preview_storage_path
      ? await supabase.storage
          .from("theme-submissions")
          .createSignedUrl(item.preview_storage_path, 10 * 60)
      : null;
    const author = item.profiles as unknown as {
      handle?: string | null;
      display_name?: string | null;
      avatar_url?: string | null;
      custom_avatar_url?: string | null;
    } | null;
    return {
      ...mapSubmission(item as unknown as Record<string, unknown>),
      previewUrl: signed?.data?.signedUrl ?? null,
      author: author
        ? {
            handle: author.handle ?? null,
            displayName: author.display_name ?? author.handle ?? "创作者",
            avatarUrl: author.custom_avatar_url ?? author.avatar_url ?? null,
          }
        : null,
    };
  }));
  return res.status(200).json(items);
}
