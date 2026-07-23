import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  firstQueryValue,
  mapSubmission,
  requireUser,
} from "../../../../server/commerce-api/marketplace.js";
import { supabase } from "../../../../server/commerce-api/supabase.js";
import { validateAndCanonicalizeThemePackage } from "../../../../server/commerce-api/theme-package.js";

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const user = await requireUser(req, res);
  if (!user) return;
  const submissionId = firstQueryValue(req.query.id);
  if (!submissionId) return res.status(400).json({ error: "Submission id is required" });

  const { data: submission, error } = await supabase
    .from("theme_submissions")
    .select("*")
    .eq("id", submissionId)
    .eq("author_id", user.id)
    .single();
  if (error || !submission) return res.status(404).json({ error: "Submission not found" });
  if (submission.status !== "uploading") {
    return res.status(200).json(mapSubmission(submission as Record<string, unknown>));
  }

  const downloaded = await supabase.storage
    .from("theme-submissions")
    .download(submission.source_storage_path);
  if (downloaded.error || !downloaded.data) {
    return res.status(409).json({ error: "Theme package has not been uploaded" });
  }

  try {
    const sourceBuffer = Buffer.from(await downloaded.data.arrayBuffer());
    const canonical = await validateAndCanonicalizeThemePackage(
      sourceBuffer,
      submission.theme_id,
      submission.version,
    );
    const canonicalPath =
      `community/${submission.theme_id}/${submission.version}/${canonical.sha256.slice(0, 16)}.codextheme`;
    const privatePreviewPath = `${user.id}/${submission.id}/preview.webp`;

    const [packageUpload, previewUpload] = await Promise.all([
      supabase.storage.from("paid-themes").upload(
        canonicalPath,
        canonical.packageBuffer,
        { contentType: "application/zip", upsert: true },
      ),
      supabase.storage.from("theme-submissions").upload(
        privatePreviewPath,
        canonical.previewBuffer,
        { contentType: "image/webp", upsert: true },
      ),
    ]);
    if (packageUpload.error || previewUpload.error) {
      console.error("submission asset upload error:", packageUpload.error ?? previewUpload.error);
      return res.status(500).json({ error: "Failed to store validated theme" });
    }

    const { data: updated, error: updateError } = await supabase
      .from("theme_submissions")
      .update({
        status: "pending",
        name: canonical.theme.name,
        tagline: canonical.theme.tagline,
        description: canonical.theme.description,
        layout: canonical.theme.layout,
        min_engine_version: canonical.theme.minEngineVersion,
        canonical_storage_path: canonicalPath,
        preview_storage_path: privatePreviewPath,
        sha256: canonical.sha256,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", submission.id)
      .eq("status", "uploading")
      .select("*")
      .single();
    if (updateError || !updated) {
      return res.status(500).json({ error: "Failed to finalize submission" });
    }

    const signed = await supabase.storage
      .from("theme-submissions")
      .createSignedUrl(privatePreviewPath, 10 * 60);
    return res.status(200).json({
      ...mapSubmission(updated as Record<string, unknown>),
      previewUrl: signed.data?.signedUrl ?? null,
    });
  } catch (validationError) {
    const message = (validationError as Error).message;
    await supabase
      .from("theme_submissions")
      .update({
        status: "failed",
        review_reason: message.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", submission.id)
      .eq("status", "uploading");
    return res.status(422).json({ error: message });
  }
}
