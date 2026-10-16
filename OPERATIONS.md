# SCCPMS operations

The active application is the root `src/` React frontend and `server/` Express
API. Supabase Auth, profiles and PostgreSQL clinic records must use the same
project. The older applications are preserved in `legacy/frontend/` and
`legacy/backend/`; supplied screen designs are in `design-references/`.

## Start locally

Use Node 22.12+ and configure the root `.env` and `server/.env` from their example
files. Install dependencies and apply migrations before starting:

```sh
npm ci
npm ci --prefix server
npm run db:migrate --prefix server
npm run dev
```

The development command starts both frontend and API. `FRONTEND_ORIGIN` controls
the browser origin; `VITE_API_URL` must point to the API. Restart after changing
server configuration. Phone numbers remain contact details; login verification
codes are emailed to the authenticated account's email address.

For login/session failures, run `npm --prefix server run connections:check` with
the application running. It distinguishes HTTP/CORS failures from PostgreSQL
connectivity and performs no account changes or email delivery. See
[the session and port diagnostic guide](docs/session-connectivity.md), including
the recorded university-network connection incident and required outbound ports.

## Email providers and SMTP

Resend sends login OTPs only to the configured owner administrator. Keep the
full RESEND_API_KEY, RESEND_ADMIN_OWNER_EMAIL and RESEND_ADMIN_OWNER_USER_ID
private and configured together. The exact trusted role, UUID and normalized
email must match; the fixed default sender is never enabled for another user.
Leave RESEND_FROM_EMAIL empty. Keep this route when adding Brevo.

Brevo sends login OTPs for all supported non-admin roles using BREVO_API_KEY and
BREVO_FROM_EMAIL. Supabase confirmation, invitation and recovery messages use
Brevo SMTP after setup. A verified individual Brevo sender may use a personal
mailbox; school DNS is not required. Sender verification, account activation,
provider quotas and inbox filtering still apply.

Initial account/sender inspection returned HTTP401 IP authorisation blocked.
On16October access returned200; the active sender, relay and SMTP credentials
were verified. Supabase SMTP and live templates are installed. API and actual
Supabase SMTP test messages were reported delivered. Brevo API and SMTP have
separate IP policies; keep them compatible with Vercel and Supabase sources.
Confirmation and OTP checks remain enforced.

Use Node22 and ignored server/.env for administrative SMTP credentials:

~~~sh
npm run auth:configure-brevo --prefix server -- --inspect
npm run auth:configure-brevo --prefix server -- --apply-smtp
npm run auth:configure-brevo --prefix server -- --apply-templates
~~~

The helper checks active sender and relay, verifies the SMTP username belongs
to the account, uses the distinct SMTP key and reads back saved settings. The
hosted SMTP password is write-only: its write acknowledgement and configured
presence are checked separately from real SMTP delivery. It
preserves existing redirect entries, keeps confirmation on and sends no email.
The runtime API needs only Brevo API credentials; SMTP credentials and the
Supabase management token are administrative secrets. Deploy after runtime
configuration changes. Disable link tracking for Auth mail and verify real
messages before accepting onboarding.

Login codes last five minutes after provider acknowledgement. Failed resends
preserve an existing valid code. Calls have a ten-second budget and reuse their
challenge idempotency key. An unknown delivery is never reported as activated.
See [provider setup, exact keys and required live acceptance](docs/email-delivery.md).
The canceled SPU/Resend DNS plan is historical; do not reinstate its sender.

## Roles and clinic workflows

Confirmation, invitation and recovery links use explicit action callbacks at
`FRONTEND_ORIGIN`. Invited doctors/receptionists choose their own password, then
sign in and verify email OTP. [Email link configuration and checks](docs/auth-email-links.md)
describes the hosted Site URL, allow-list and local-versus-hosted distinction.
Run `npm run auth:check-redirects --prefix server` to check actual routing without
sending messages or creating accounts.

- All roles accept any valid recipient email address. Email confirmation and
  login OTP remain required; sender-domain verification is a separate setting.
- Students require a student number; lecturer/staff patients require a staff
  number. The email address need not match that university identity number.
- Public registration creates patients. Admin creates doctor/receptionist
  invitations; recipients set a password, then complete email OTP for their role.
- Role comes from protected server-managed metadata. OTP authorization is bound
  to the account, authenticated session and current email address.
- There is no application inactivity logout or separate verification time limit.
  Supabase access tokens renew automatically; expired-token requests retry once
  with a renewed token for the same session. Temporary Auth outages return `503`
  and preserve the signed-in workspace. Sidebar logout removes its verification.
  In hosted Supabase Auth settings, leave session inactivity timeout and maximum
  lifetime disabled for this manual-logout policy. Account deactivation, email
  changes and revoked authentication still block access.
- An admin must deactivate a patient, doctor or receptionist before deleting its
  login account. Active care must be completed, cancelled, rescheduled or
  reassigned first. A pending deletion stays disabled until a retry finishes;
  it cannot be reactivated while deletion is pending.
- Deleted accounts remain in admin Records with contact details. Reinvite
  creates a separate Auth UUID and retains the historical records on the former
  identity. It does not grant the replacement login access to that history.
  `409 ACCOUNT_EMAIL_IN_USE` means the retained email already has an account;
  manage that account instead. Reinvitation never overwrites that account's
  profile or trusted role.

Appointments and availability obey the clinic timezone, hours, holidays and
approved leave. Database constraints prevent overlapping appointments. Front desk
manages intake and walk-ins; registered walk-ins require a linked consultation
and documented clinical visit before completion. Doctors manage assigned SOAP
notes, vitals, prescriptions and laboratory orders/results. Patients read their
own released records; admin/receptionist cannot access clinician SOAP content.
Clinical corrections preserve prior values for the responsible doctor.

Notifications are persisted for account activation, deactivation, deletion and
invitation acceptance after the invitee's password update is acknowledged.
They trigger authorized dashboard refresh through PostgreSQL notifications on
persistent hosting or a durable change-log check every two seconds on Vercel.
The browser also refreshes reads every 15 seconds when needed. These in-app
notices do not configure or prove email delivery. Analytics use real activity
and show zero when the clinic has none; admin charts accept date ranges of up
to 366 days. API/operation audit logs are retained independently of list limits.

## Deployment

Registration uses the 48 requested initial programmes, with NAS denoting
Natural and Applied Sciences. Official SPU catalogue differences are recorded in
[the catalogue review](docs/academic-catalogue.md). Kimberley address autocomplete
uses Photon/OSM; [provider configuration](docs/residential-address-search.md)
describes the cache, quotas and dedicated endpoint needed for sustained traffic.
Apply migration017 for the optional profile coordinates. Manual residential
addresses remain available whenever the map service is unavailable.

Apply `024_account_records_invitations.sql` before deploying deleted-account
Records, reinvitation and tracked invitation completion. Apply
`025_existing_invitation_state.sql` to retain the state of existing provider
invitations. These additive migrations retain clinical/profile identities and
send no email. A build does not apply them automatically.

Production clinic use needs HTTPS origins, full Resend credentials, a verified
replacement custom sender, configured Supabase Auth mail/redirects, and
certificate-verified PostgreSQL TLS. An empty primary sender with a complete
owner-admin binding permits only the existing administrator's OTP delivery;
it does not make general onboarding ready.
`DATABASE_SSL_CA` supplies a custom CA when needed. Ordinary Supabase queries can
use the transaction pooler on 6543. Vercel uses a durable change log and bounded
SSE on that connection. Local/persistent `LISTEN` deployments additionally use a
session connection on 5432 through `DATABASE_EVENTS_URL`.

Docker Compose requires `RESEND_API_KEY` and either `RESEND_FROM_EMAIL` or the
complete owner-admin binding. An empty primary sender leaves general mail
unavailable. The backend
image includes native migration and read-only email-check runners:

```sh
docker compose run --rm backend npm run db:migrate
docker compose run --rm backend npm run email:check -- --production
```

Supply deployment secrets before running these commands. The shutdown grace
period permits active HTTP requests, audits and streams to drain. CI uses Node
22 and dummy credentials for unit/database/browser checks; frontend Docker builds
use actual public deployment variables. Both Vercel applications deploy from
GitHub main; completed CI/deployment results are in the testing report. Historical SMS helper scripts are retained but are
not required by the active email OTP configuration.

## Verification

```sh
npm run typecheck
npm run build
npm run lint
npm run typecheck --prefix server
npm run build --prefix server
npm test --prefix server
npm run test:database --prefix server
npm run test:ui
npm run env:validate
npm run email:check --prefix server
```

Database regressions use isolated temporary schemas; browser/provider tests use
mocked services and do not establish real email delivery. Current email-migration
results and remaining acceptance work are recorded in `PRODUCTION_READINESS.md`
after checks run. Configuration syntax and domain checks are separate from a
successful login using an actual received message.
