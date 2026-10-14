# Current email readiness ? 14 October 2026

All valid recipient emails are accepted for every role. Student/staff identity details remain required; email need not match the student number. The new OTP expiry, safe confirmation landing and staff password flows are described in [email setup](docs/email-delivery.md), with successful/failed checks in [the testing report](docs/TESTING_REPORT.md). SPU has been asked to help with a sender subdomain. DNS verification, custom SMTP and real inbox acceptance are still pending. The dated history below records earlier milestones and policies.

# SCCPMS email OTP readiness — 12 October 2026

The supplied full Resend key is saved in ignored server configuration and was
accepted by the provider's read-only domain API (HTTP 200). The API restarted
with that configuration, resolving the missing-configuration error shown at
login. The earlier CSV contained only a masked token and was not used as a key.
No email was sent during these checks; real inbox/login acceptance remains pending.

The university sender `clinic.spu.ac.za` is now added in Resend, with sending
enabled, receiving disabled, tracking disabled and enforced TLS. Its status is
`not_started`: university IT must approve and publish the actual records in
[RESEND_UNIVERSITY_DNS.md](RESEND_UNIVERSITY_DNS.md). No university DNS was changed.
The active local sender remains the owner-only test sender until verification.

## Configuration

The active login channel uses Resend email. `RESEND_API_KEY` and
`RESEND_FROM_EMAIL` are server settings; no private provider key belongs in the
browser build. The development default `SCCPMS <onboarding@resend.dev>` can send
only to the Resend account owner's address. University recipients and production
require a verified custom sending domain. [Provider restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

The read-only `npm run email:check --prefix server -- --production` command checks
domain access, exact sender-domain verification and sending capability through
`GET /domains`. It sends no mail and prints no secrets, OTPs or recipient data.
A restricted sending-only key cannot perform that domain lookup; inspect the
domain in the dashboard or use an administrative key for the check. Passing the
lookup does not prove delivery to an inbox.

Phone fields remain available for contact/intake records. Existing accounts,
roles and clinical records are retained. Apply current migrations before startup;
previous phone-bound verification cannot establish email OTP authorization.

Supabase invitations, confirmation and password recovery still depend on Auth's
SMTP/redirect configuration. Resend can also supply custom SMTP for those emails,
but setting the application's OTP key does not change Supabase settings.
[Resend SMTP reference](https://resend.com/docs/send-with-smtp).

## Verification status

These checks were executed against the current email implementation. Provider
and browser simulations establish application behavior, not real inbox delivery.

| Check | Status |
| --- | --- |
| Frontend/backend typecheck and build | Passed both typechecks and builds; frontend lint passed with one existing FastRefresh warning |
| Server email delivery, OTP and Auth regressions | 132 passed, 1 intentional database skip, 0 failures; providers mocked |
| Isolated database OTP/session workflow | Passed 1/1; temporary schema cleaned up |
| Browser role login, callbacks and session persistence | Passed 30/30; APIs mocked |
| Public database session migrations | Applied `015_otp_email_binding.sql` and `016_manual_logout_sessions.sql`; migration commands exited successfully |
| Dashboard and login branding | Desktop and mobile checks passed for all four sidebar logos; login logo enlarged |
| Restarted runtime smoke | API/database health 200, frontend 200, unauthenticated protected API 401 |
| Deployment examples, CI and checker syntax | Passed JavaScript syntax, YAML/CI checks, Compose config and 25 mocked readiness cases |
| Current local email/configuration readiness | Environment validation passed; read-only provider check accepted key; test sender remains owner-only |
| Full Resend API key installed | Completed in ignored `server/.env`; no key in browser configuration |
| Custom sender domain verified and sending enabled | Prepared `clinic.spu.ac.za`, sending enabled; DNS verification pending university IT |
| Actual received OTP opens the assigned dashboard | Pending authorized real-recipient check |
| Supabase invitation/confirmation/recovery delivery | Pending real-recipient acceptance |
| Hosted Supabase development redirect configuration | Saved and read back on 13 October 2026; default, signup, invite and recovery HTTP 303 probes all target `http://localhost:5173` |
| Hosted HTTPS, backups and restore verification | Pending deployment environment |

The pending Resend domain and tracking settings were configured. No external
email, university DNS change, clinical-record mutation, account credential reset,
publishing or hosted deployment occurred during these checks.

## Session persistence and branding

The application has no idle logout or separate 12-hour dashboard verification
expiry. Successful OTP verification belongs to the same authenticated session
and current email until logout. Migration 016 extends only existing still-valid
email verification; previously expired and phone-bound sessions remain denied.
The isolated database suite confirms verification remains valid after 13 hours,
manual logout removes it, and cleanup targets its own session.

The browser explicitly persists and renews Supabase sessions. An expired-token
response triggers one shared renewal and one retry for the same session. Temporary
Auth service failures return `503` without logging out. Stale responses from
before logout, another login or a newer OTP verification cannot revoke that
new state. Account deactivation and genuinely invalid/revoked authentication
remain denied. Hosted Supabase inactivity/lifetime settings must be disabled
for this policy; those external settings were not changed or confirmed here.
[Supabase session controls](https://supabase.com/docs/guides/auth/sessions).

Eight browser regressions confirm expired-token recovery, shared renewal for
concurrent requests, 11 minutes idle with a five-minute token and page reload,
failed SDK renewal without anonymous API calls, temporary API outage recovery,
manual sidebar logout, and delayed responses after a later login or verification.

All four role sidebars use the existing logo. The login logo is now 92 pixels
on desktop and 70 pixels on small screens, up from 72 and 54 respectively.

## Remaining provider and hosting steps

1. Ask university IT to approve and publish the exact sending records in
   `RESEND_UNIVERSITY_DNS.md`, then verify `clinic.spu.ac.za` in Resend.
   [Verified domains](https://resend.com/docs/dashboard/domains/introduction).
2. Set `RESEND_FROM_EMAIL="SCCPMS <login@clinic.spu.ac.za>"` after verification.
   Store the full key in deployment secrets when moving to hosted production.
3. Run the production read-only email check. Restart after changing settings,
   then complete an authorized login with the actually received six-digit code.
4. Complete Supabase Auth SMTP and actual confirmation, invitation and
   password-recovery message acceptance. Development redirect configuration is
   verified; add the deployed HTTPS frontend and its callback URLs before launch.
5. Provide hosting HTTPS origins, certificate-verified database connections,
   monitoring and backup/restore acceptance in an isolated recovery environment.

## Application acceptance

- [ ] Confirmed user receives an email OTP at the current trusted account email.
- [ ] Correct code grants only the stored role; wrong, expired or replayed codes fail.
- [ ] Email/session changes invalidate old verification; resend limits persist.
- [ ] Provider rejection, timeout and database outage preserve a retryable login.
- [ ] Admin invites staff; public patients register using valid university identity.
- [ ] Appointments, walk-ins and clinical documentation persist without conflicts.
- [ ] Clinical-record access remains limited to authorized patients/clinicians.
- [ ] Notifications, real analytics and audit records update across dashboards.
- [ ] Account deactivation preserves records and blocks ongoing-care conflicts.

## Registration update — 13 October 2026

The existing form now lists EMS, EDU, Humanities and NAS with the requested 48
initial programmes. NAS denotes Natural and Applied
Sciences. Programme search filters by faculty and clears on faculty change;
the server rejects mismatched combinations. The [SPU catalogue review](docs/academic-catalogue.md)
documents official entries beyond this initial data.

Residential Address uses real Photon/OpenStreetMap Kimberley autocomplete,
including New Park priority and manual entry. City, Province and Postal code are
removed from registration and are not required. Selected addresses and optional
coordinates save into the existing profile; edits clear obsolete coordinates.
Migration017 was applied successfully to the configured database, preserving
existing users.

Verified frontend/server builds and typechecks; lint has zero errors and one
existing Fast Refresh warning. All **39 browser tests** and **151 server tests**
pass; the unit command intentionally skips two opt-in database tests. The
separate database command passes **both** isolated registration and clinic
workflow suites. Provider/Auth browser tests are mocked. Additional live API and
desktop/mobile browser searches returned real Long Street, New Park and
Bultfontein Road OSM data without GPS, and mobile had no horizontal overflow.
The isolated registration test confirmed saved faculty/programme/address and
coordinates without creating production Auth accounts. Temporary test schemas
were cleaned up.

No map key is needed for initial limited use. Sustained deployment must configure
a dedicated Photon-compatible endpoint or equivalent shared capacity; the public
demo has no availability guarantee. [Address configuration, limits and verification](docs/residential-address-search.md).
Existing university sender DNS and Supabase Auth SMTP acceptance work above remain
pending; this registration update does not establish real email delivery.

## Confirmation and invitation redirects — 13 October 2026

New signup, invitation and password recovery links explicitly target the
configured frontend with separate callback actions. For local development this
is `http://localhost:5173/`. Signup confirmation returns to sign-in with an
acknowledgement. Invited doctors and receptionists choose their own password,
then sign in and complete the existing email OTP check before dashboard access.

Password setup validates the current clinic account and binds unfinished setup
to both user and authentication session. It survives reload and temporary account
service failure after a single-use invitation has been consumed. Invalid links,
disabled accounts and URL markers without a successful callback cannot open
setup. Password update failures preserve a retryable setup step.

Hosted redirect configuration was completed and verified on 13 October 2026.
Management API readback confirmed Site URL `http://localhost:5173` and all five
required allow-list entries, preserving existing URLs. The read-only checker
exited successfully with `ok: true`: the project default, signup, invite and
recovery probes all returned HTTP 303 to `http://localhost:5173`. A separate
fresh, uncached invalid-token probe confirmed the same default destination.
These checks send no email, create no account and consume no real user link.
Run `npm run auth:check-redirects --prefix server` after future redirect changes.
See [email-link setup and checks](docs/auth-email-links.md). University sender DNS
verification and actual received confirmation, invitation and OTP acceptance
remain pending.

Frontend typecheck and production build passed; lint reports zero errors and
one existing Fast Refresh warning. The full 53-case browser suite passed, then
all 30 callback/session cases passed against the final frontend build, including
two additional regressions for stale account-check failures and signup outages.
The final server suite passed **165 tests**, with zero failures and two
intentional opt-in database skips; server build and typecheck passed. Profile
storage/network errors return retryable `503` responses, while missing profiles,
invalid trusted roles and deactivated accounts remain denied. The existing
isolated database suites passed in the registration update above; this callback
change introduces no schema migration.
Those browser cases simulate Auth/provider responses; hosted probes verify
redirect routing. No real confirmation, invitation or OTP message was sent and
no production Auth account was created during these checks.

## Startup and rollback

```sh
npm ci
npm ci --prefix server
npm run db:migrate --prefix server
npm run dev
```

Keep the additive OTP/audit migrations and clinical history intact. Reverse only
reviewed application hunks or use a compatible verified image; do not reset the
dirty checkout, drop clinical tables, erase migration history or remove account
records as a rollback. Restoring earlier phone-OTP code also requires reviewing
channel-binding compatibility. No destructive rollback was performed.
