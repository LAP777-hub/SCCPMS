# Production email delivery

SCCPMS has two email channels: Supabase Auth sends signup confirmations, staff invitations and password recovery; the API sends login OTPs through Resend. Both need a verified sender. All valid recipient addresses are accepted for every role: Gmail, Outlook, Yahoo, university addresses and other domains. Email confirmation and login OTP remain required. Students still need their university identity number, faculty/programme and residential address; their email need not match their number.

## Pending university subdomain

On 14 October 2026, Resend reported `clinic.spu.ac.za` as `not_started`, with its DNS records unpublished. A production OTP attempt returned HTTP 403. Supabase custom SMTP was absent. This is a configuration blocker, not evidence that an accepted message was delayed in transit. SPU has been asked to help with a subdomain; the application can be prepared while their response is pending.

SPU IT can publish [the prepared DNS records](../RESEND_UNIVERSITY_DNS.md) without granting access to the school's DNS account. If they approve a different subdomain, create that exact domain in Resend and give IT its actual provider records. Do not reuse records for a different domain. Alternatively, use a separate domain you own. A personal Gmail address cannot replace a verified Resend sending domain. The owner-only `onboarding@resend.dev` test sender is refused in production.

The hosted API currently uses `SCCPMS <login@clinic.spu.ac.za>`. Keep it pending until the corresponding domain is verified, or update `RESEND_FROM_EMAIL` to the approved sender in the API's Vercel environment and redeploy. Keep `RESEND_API_KEY` in private hosting secrets or ignored `server/.env`, never in a frontend variable. The sender domain must have sending enabled and click/open tracking disabled for authentication links.

## Configure Supabase mail after verification

Use Node 22.12+ from a secured administrative computer. The runner reads ignored `server/.env`; set `FRONTEND_ORIGIN=https://sccpms.vercel.app`, the approved `RESEND_FROM_EMAIL`, and private `SUPABASE_ACCESS_TOKEN` and `RESEND_API_KEY` there. Never paste credentials into commands, issue bodies or committed files.

```sh
npm run auth:configure-email --prefix server -- --inspect
npm run email:check --prefix server -- --production
```

Inspection is read-only and returns status categories without passwords or mailbox addresses. A sending-only Resend key cannot inspect domains; use a domain-readable administrative key for this operation. The API can retain a restricted sending key.

Deploy the frontend with `email_action` support before updating hosted templates. Link settings can be updated while SMTP is pending:

```sh
npm run auth:configure-email --prefix server -- --apply-links
```

This sets the production Site URL, preserves existing redirect entries, adds required production callbacks, sets new Auth links to two hours, and keeps email confirmation enabled. It leaves SMTP and templates unchanged. Existing emailed links retain their original expiry and cannot be restored after use.

When the sender domain is verified:

```sh
npm run auth:configure-email --prefix server -- --apply-smtp
```

The runner refuses to change SMTP unless the exact sender domain is verified, sending is enabled and tracking is disabled. It configures `smtp.resend.com`, port 465, username `resend`, the private API key as password, and the approved sender; sets a 30-second mail cooldown and an Auth email quota of at least 30/hour; and verifies saved settings without printing credentials. Adjust quotas for measured traffic and the Resend plan. [Resend's Supabase SMTP setup](https://resend.com/docs/send-with-supabase-smtp).

After custom SMTP is configured, install the branded templates:

```sh
npm run auth:configure-email --prefix server -- --apply-templates
```

The hosted free-tier project rejected template changes with its default mail provider (HTTP 400 on 14 October). The runner now reports the custom-SMTP prerequisite without attempting that rejected mutation. Templates are prepared in code but remain unapplied until SMTP is ready. Once installed, each email first opens the live application; only an explicit Continue click follows its validated Supabase verification URL. This reduces accidental consumption by email scanners.

Supabase's default mail service is restricted to project-team addresses and two messages/hour, with no delivery SLA. Production university mail needs custom SMTP. [Supabase SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp).

## Login timing and staff invitations

Login OTPs are valid for ten minutes **from the provider's acknowledgement**, with a 30-second resend cooldown. The UI receives the actual expiry from the server. An unsuccessful resend preserves an existing valid code. A new code replaces it only after the provider accepts sending. Codes are bound to the authenticated account, email and session, permit five failed guesses, and limit new challenges to ten/hour per account.

Provider requests have a ten-second total budget with at most one retry of transient failures. Retries reuse the same Resend idempotency key and message, so an ambiguous response does not cause a second distinct email. Permanent sender/quota failures fail promptly. Acknowledgement means accepted for sending; it does not prove arrival in the recipient's inbox. [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).

An invited doctor or receptionist opens the live confirmation page, clicks Continue, chooses and confirms a password, then signs in with that password and completes email OTP to reach their assigned dashboard. Signup confirmation returns patients to sign-in. The account's trusted role and email are retained for convenience; role selection never grants access. Authentication fetches and logout have deadlines, and temporary invitation/profile setup delays offer a retry.

Apply migration `022_otp_delivery_timing.sql` before deploying the new API. It adds delivery timing and pending-challenge state without deleting existing users, records or accepted codes. Defaults can be changed with `OTP_VALIDITY_SECONDS` (120–900) and `OTP_RESEND_COOLDOWN_SECONDS` (30–300).

## Live acceptance still required

After DNS, provider verification and SMTP are complete, use authorized recipients to check one signup confirmation, one doctor invitation, one receptionist invitation and one login OTP. Record request, provider-acceptance and receipt times separately; inspect Resend delivery/bounce events and spam folders. Confirm the address bar returns to `https://sccpms.vercel.app`, staff can choose passwords, and each role reaches its own dashboard. Localhost callbacks are for development on the recipient's computer.

Automated browser/provider checks send no real messages and cannot establish inbox latency. Do not promise delivery within seconds until measured in the university mail system. Current successes, failures and remaining acceptance work are in [the testing report](TESTING_REPORT.md).
