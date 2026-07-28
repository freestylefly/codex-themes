import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  fetchLatestReleaseDownload,
  parseDownloadTarget,
} from "../../../server/downloads/github-release.js";

const LATEST_RELEASE_PAGE =
  "https://github.com/freestylefly/codex-themes/releases/latest";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const target = parseDownloadTarget(req.query);
  if (!target) {
    return res.status(400).json({
      error: "supported targets: mac/arm64 dmg|zip, mac/x64 dmg|zip, win/x64 exe",
    });
  }

  try {
    const download = await fetchLatestReleaseDownload(target);
    // The release tag is correctness-sensitive: serving a stale redirect after
    // publishing a release makes the website advertise the previous package.
    // Keep browsers and Vercel's CDN from caching this response.
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");
    res.setHeader("Location", download.url);
    res.setHeader("X-Codex-Themes-Release", download.tagName);
    res.statusCode = 307;
    return res.end();
  } catch (error) {
    console.error("latest release download redirect error:", error);
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");
    res.setHeader("Location", LATEST_RELEASE_PAGE);
    res.statusCode = 302;
    return res.end();
  }
}
