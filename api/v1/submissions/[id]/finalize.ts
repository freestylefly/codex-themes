import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  firstQueryValue,
  mapSubmission,
  requireUser,
} from "../../../../server/commerce-api/marketplace.js";
import { supabase } from "../../../../server/commerce-api/supabase.js";
import { validateAndCanonicalizeThemePackage } from "../../../../server/commerce-api/theme-package.js";

export const config = { maxDuration: 60 };

async function markFailed(submissionId: string, message: string) {
  const reason = message.trim().slice(0, 500) || "自动校验未完成，请重新校验。";
  await supabase
    .from("theme_submissions")
    .update({
      status: "failed",
      review_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", submissionId)
    .eq("status", "uploading");
}

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
  if (!["uploading", "failed"].includes(submission.status)) {
    return res.status(200).json(mapSubmission(submission as Record<string, unknown>));
  }

  try {
    const startedAt = new Date().toISOString();
    const { data: started, error: startError } = await supabase
      .from("theme_submissions")
      .update({
        status: "uploading",
        review_reason: null,
        updated_at: startedAt,
      })
      .eq("id", submission.id)
      .eq("author_id", user.id)
      .in("status", ["uploading", "failed"])
      .select("id")
      .single();
    if (startError || !started) {
      throw new Error("无法启动自动校验，请刷新后重试。");
    }

    const downloaded = await supabase.storage
      .from("theme-submissions")
      .download(submission.source_storage_path);
    if (downloaded.error || !downloaded.data) {
      throw new Error("没有找到已上传的主题包，请重新提交作品。");
    }

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
      throw new Error("主题已通过安全校验，但保存预览失败，请重新校验。");
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
      const { data: current } = await supabase
        .from("theme_submissions")
        .select("*")
        .eq("id", submission.id)
        .eq("author_id", user.id)
        .maybeSingle();
      if (current && current.status === "pending") {
        return res.status(200).json(mapSubmission(current as Record<string, unknown>));
      }
      throw new Error("自动校验结果保存失败，请重新校验。");
    }

    const signed = await supabase.storage
      .from("theme-submissions")
      .createSignedUrl(privatePreviewPath, 10 * 60);
    return res.status(200).json({
      ...mapSubmission(updated as Record<string, unknown>),
      previewUrl: signed.data?.signedUrl ?? null,
    });
  } catch (validationError) {
    const message =
      validationError instanceof Error
        ? validationError.message
        : "自动校验发生未知错误，请重新校验。";
    console.error("submission validation failed:", {
      submissionId: submission.id,
      message,
    });
    await markFailed(submission.id, message);
    return res.status(422).json({ error: message });
  }
}
