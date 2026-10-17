# Profile photos

All four dashboard roles can select their avatar to open the Profile photo
popup in the centre of the viewport. It offers four image actions: Select image,
Upload image, Remove image and View larger (which toggles back to View smaller).
JPEG, PNG and WebP source files are accepted up to **5 MB (5,242,880 bytes)** and
16 megapixels. The selected file previews before upload. Removing an unsaved
selection restores the saved photo; removing a saved photo clears it from the
profile and survives reload.

The browser optimises the selected image to at most 1024px before sending it,
with an explicit 4 MiB transport cap. This makes the 5 MB source-file allowance work
within [Vercel's request-body limit](https://vercel.com/docs/functions/limitations#request-body-size).
Failed decoding/encoding never falls back to sending the original file. The API
independently decodes and re-encodes an oriented, cropped image up to 512px, strips
metadata including EXIF/GPS and stores a WebP object in a private bucket.

Apply migration `027_profile_photos_reception_department.sql`. It adds the
nullable `profiles.avatar_path` field and restricts paths to the same user's
UUID prefix. The same migration normalizes receptionist departments to
`Reception / Front desk`, preserving doctor departments. Other profile fields
and historical clinical records are retained.

Supabase Storage needs a **private** bucket named `profile-photos`, file size
limit 5242880 bytes and allowed MIME type `image/webp`. The API uses the existing
server-only service-role credential; no public bucket or client upload policy
is needed. This bucket has been configured and tested in the connected project.
The live acceptance check uploaded a synthetic image, verified signed download
and rejected public download, then removed the diagnostic object. No real
profile or account was changed by that check.

`GET /api/profile/photo` returns only the caller's 15-minute signed photo URL.
`PUT /api/profile/photo` accepts only a validated image body for the caller.
`DELETE /api/profile/photo` removes only the caller's saved image.
All require an active confirmed account and OTP-verified session. The 5 MB
request allowance applies only to this exact image-upload route; JSON limits
elsewhere remain 256 KB. No client-supplied object path is accepted.

Uploads persist their own-user database path and `profile.photo_updated` audit
event transactionally. A replaced image is removed after commit. A definite
database failure removes the unused upload; an uncertain commit retains the
object to avoid destroying a potentially committed photo. The UI refreshes its
profile and the saved image survives reload. Initials remain the fallback.

Deletion locks the caller's profile, clears its image and records
`profile.photo_removed` in one transaction. Only the database's own stored path
can be removed from Storage, after commit acknowledgement. An empty retry does
not add duplicate changes/audits. Rollback or an uncertain commit never deletes
a potentially referenced object. Storage-cleanup failures retain a private,
unreferenced object rather than restoring a deleted profile photo.

References: [Sharp image limits](https://sharp.pixelplumbing.com/api-constructor/),
[Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals).
