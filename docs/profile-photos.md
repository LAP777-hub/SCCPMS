# Profile photos

All four dashboard roles can select their avatar to open the Profile photo
popup. JPEG, PNG and WebP inputs are accepted up to 2 MB and 16 megapixels.
The API decodes and re-encodes an oriented, cropped image up to 512px, strips
metadata including EXIF/GPS and stores a WebP object in a private bucket.

Apply migration `027_profile_photos_reception_department.sql`. It adds the
nullable `profiles.avatar_path` field and restricts paths to the same user's
UUID prefix. The same migration normalizes receptionist departments to
`Reception / Front desk`, preserving doctor departments. Other profile fields
and historical clinical records are retained.

Supabase Storage needs a **private** bucket named `profile-photos`, file size
limit 2097152 bytes and allowed MIME type `image/webp`. The API uses the existing
server-only service-role credential; no public bucket or client upload policy
is needed. This bucket has been configured and tested in the connected project.
The live acceptance check uploaded a synthetic image, verified signed download
and rejected public download, then removed the diagnostic object. No real
profile or account was changed by that check.

`GET /api/profile/photo` returns only the caller's 15-minute signed photo URL.
`PUT /api/profile/photo` accepts only a validated image body for the caller.
Both require an active confirmed account and OTP-verified session. The 2 MB
request allowance applies only to this exact image-upload route; JSON limits
elsewhere remain 256 KB. No client-supplied object path is accepted.

Uploads persist their own-user database path and `profile.photo_updated` audit
event transactionally. A replaced image is removed after commit. A definite
database failure removes the unused upload; an uncertain commit retains the
object to avoid destroying a potentially committed photo. The UI refreshes its
profile and the saved image survives reload. Initials remain the fallback.

References: [Sharp image limits](https://sharp.pixelplumbing.com/api-constructor/),
[Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals).
