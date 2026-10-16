# Production email delivery

All valid recipient email addresses are accepted. Email confirmation and login
OTP remain required. Students still supply university identity, programme and
residential address; email need not match the university number.

## Provider routing

| Email | Provider | Private configuration |
| --- | --- | --- |
| Configured owner administrator login OTP | Resend API | `RESEND_API_KEY`, `RESEND_ADMIN_OWNER_EMAIL`, `RESEND_ADMIN_OWNER_USER_ID` |
| Patient, student, lecturer/staff patient, doctor and receptionist login OTP | Brevo API | `BREVO_API_KEY`, `BREVO_FROM_EMAIL` |
| Confirmation, invitation and password recovery | Supabase Auth through Brevo SMTP | Hosted SMTP settings, configured with the administrative helper |

Resend requires the exact trusted admin role, Auth UUID and normalized owner
email. Its fixed sender is `SCCPMS <onboarding@resend.dev>`. Other administrators
fail closed; other roles cannot use Resend even with the owner's email. There
is no cross-provider fallback. Keep `RESEND_FROM_EMAIL` empty and retain both
owner settings when adding Brevo.

The SPU sender plan was canceled on 14 October 2026. Brevo supports verifying an
individual sender mailbox without owning SPU's domain. Free-mail senders still
have authentication/deliverability limitations; a verified domain is preferable
for clinic operation. Sender verification, transactional account activation and
plan quotas apply. [Brevo sender verification](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email).

## IP access and delivery checks

Initial account and sender inspection returned **HTTP401 IP authorisation
blocked**. On16October both returned **200**: one active sender, an enabled relay
and the matching SMTP username were established. SMTP authentication succeeded
with verified TLS. Supabase SMTP and live templates are now installed. An API
diagnostic was accepted in634ms and a real Supabase recovery email in716ms;
Brevo reported both **delivered**. These were sent only to the confirmed owner
administrator as setup diagnostics; admin login OTP still uses Resend.

Open Brevo **Settings → Security → Authorized IPs**. API and SMTP blocking have
separate switches. Standard Vercel outbound addresses can change; Supabase SMTP
originates from Supabase rather than this laptop. Use controlled fixed outbound
addresses and authorise every relevant source, or configure the provider's IP
policy for this hosting arrangement. Local IP approval alone does not establish
hosted access. [Brevo IP policy](https://help.brevo.com/hc/en-us/articles/5740111683858-Authorize-and-block-IP-addresses-for-API-and-SMTP-security).

## Configure Brevo and Supabase

Before enabling Brevo on an existing installation, apply migration
`026_retire_legacy_nonadmin_otp_drafts.sql`. It retires unconfirmed non-admin
drafts from the earlier provider so their idempotency keys cannot cross
providers, even when the sending address is identical. Accepted codes, known
acknowledgements and admin drafts are retained. Apply it through the normal
versioned migration runner before setting the active Brevo sender.

In ignored `server/.env`, configure `BREVO_API_KEY`, `BREVO_FROM_EMAIL`,
`BREVO_SMTP_USERNAME`, `BREVO_SMTP_PASSWORD`, `SUPABASE_ACCESS_TOKEN`, and
`FRONTEND_ORIGIN=https://sccpms.vercel.app`. The SMTP host is
`smtp-relay.brevo.com`; port 587 uses STARTTLS, with 465 also supported. Use the
SMTP username shown by Brevo, not an assumed account email.

The runtime API needs only Brevo's API key and sender in the backend Vercel
project's production secrets, followed by redeployment. Supabase needs the SMTP
username and SMTP key. API, SMTP and encoded MCP credentials are not
interchangeable. Never place them in frontend `VITE_` settings.

Use Node 22.12+:

```sh
npm run auth:configure-brevo --prefix server -- --inspect
npm run auth:configure-brevo --prefix server -- --apply-smtp
npm run auth:configure-brevo --prefix server -- --apply-templates
```

The helper sends no emails. It verifies an active sender and relay, matches the
SMTP username to the account, requires an SMTP key, preserves redirects and
reads back saved changes. Supabase's SMTP password is write-only, so its write
acknowledgement and configured presence are verified separately from actual
SMTP delivery. It keeps confirmation enabled, a 30-second Auth mail
cooldown and at least 30 messages/hour, subject to provider quotas. Readback
does not prove SMTP authentication or inbox delivery.
[Brevo SMTP](https://developers.brevo.com/docs/smtp-integration),
[Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

The template command requires matching Brevo SMTP. It preserves existing
callbacks, sets new links to two hours and points to the live application.
Emails open the application wrapper; its Continue button follows the validated
Supabase verification URL. The delivered recovery email's Brevo tracking URL
was resolved safely to the live wrapper and correct Supabase recovery/redirect
targets without consuming the verification link. Disabling link tracking is
recommended for Auth mail; confirm links after provider changes. Existing emails retain
their original expiry. The older Resend SMTP helper is historical.

## OTP timing and invitations

Codes last ten minutes from provider acknowledgement, with a 30-second resend
cooldown. Failed resends preserve an existing valid code. Replacements activate
only after provider acknowledgement and database commit. Single-use hashes,
session/email binding, five failed guesses and ten new challenges/hour remain
enforced. Missing configuration does not reserve a new challenge.

Provider calls have a ten-second budget and at most one transient retry, using
the same payload and challenge key. Resend uses HTTP `Idempotency-Key`; Brevo
uses JSON `headers.idempotencyKey`. A Brevo duplicate without a message reference
remains unknown delivery, never a false success. An uncertain code may remain
pending until its 15-minute draft expires. Reducing timers cannot fix provider
outages or inbox filtering.
[Brevo transactional API](https://developers.brevo.com/docs/send-a-transactional-email),
[Brevo idempotency](https://developers.brevo.com/docs/heterogenous-versions-batch-emails).

Invited doctors/receptionists follow the live link, create and confirm a
password, then sign in and verify OTP for their trusted role. Signup confirmation
returns patients to sign-in. Invitation acceptance notifications and audits
follow provider acknowledgement. Browser role selection never grants access.

## Live acceptance

After IP access, sender verification and SMTP setup, measure provider acceptance
and receipt for signup, doctor/receptionist invitations, recovery and login OTP.
Confirm links return to `https://sccpms.vercel.app`, staff create passwords and
every role reaches its dashboard. Check delivery/bounce events and spam folders.
Automated fixtures send no real mail and do not establish inbox speed. Keep the
admin Resend route available while Brevo is incomplete.

[Testing results, failures and remaining acceptance](TESTING_REPORT.md).
