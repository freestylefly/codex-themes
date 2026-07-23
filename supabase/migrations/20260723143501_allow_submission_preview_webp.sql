-- Review previews stay private until an administrator approves a submission.
-- The trusted API writes normalized WebP previews beside the source package,
-- so the private bucket must allow that MIME type in addition to source ZIPs.
update storage.buckets
set allowed_mime_types = array[
  'application/zip',
  'application/octet-stream',
  'image/webp'
]
where id = 'theme-submissions';
