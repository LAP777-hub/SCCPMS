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

## Resend email OTP

Set the full `RESEND_API_KEY` in the ignored `server/.env` or hosting secret
manager. Never put it in a `VITE_` variable. A masked token in an API-key CSV
export cannot authenticate and must not be saved as a working key. The supplied
full key has now been installed and accepted by Resend's read-only domain API.
Development can start without a key; requesting a code fails safely until
delivery is configured. Restart the API after changing its environment file.

The primary sender is intentionally unset until a replacement custom domain is
verified. Leave `RESEND_FROM_EMAIL` unset or empty. Production requires a full
key and either a valid custom sender or the complete temporary owner-admin
binding. `RESEND_ADMIN_OWNER_EMAIL` and `RESEND_ADMIN_OWNER_USER_ID` must identify
the existing confirmed, active administrator and the Resend account email.
Only that exact account can receive a real OTP from
`SCCPMS <onboarding@resend.dev>`; no global test sender is enabled. Other accounts
receive a safe delivery-unavailable response while the primary sender is empty.
For general delivery, set `RESEND_FROM_EMAIL` to a mailbox at a custom domain you
own and have verified in Resend. Recipients may use any valid email domain.
See [Resend test-domain restrictions](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)
and [domain verification](https://resend.com/docs/dashboard/domains/introduction).

The SPU sender setup was canceled on **14 October 2026**. The earlier
`clinic.spu.ac.za` domain was prepared but remained unverified; university DNS
was not changed. [RESEND_UNIVERSITY_DNS.md](RESEND_UNIVERSITY_DNS.md) preserves
that historical handoff. Do not configure its address as the active sender or
run the university preparation command as a required setup step. The handoff
can be reconsidered only if that domain is separately approved and verified.
No replacement provider or verified sender is configured by canceling SPU.

```sh
npm run email:check --prefix server
npm run email:check --prefix server -- --production
```

This native Node checker performs only authenticated `GET /domains` requests and
prints configuration/status categories. It checks the exact sender domain is
verified and enabled for sending; it never sends an email or prints keys, OTPs,
recipient addresses or provider payloads. A sending-only key cannot read domains,
so use the Resend dashboard or a domain-readable key for this administrative check.
The API can keep a restricted sending key for runtime delivery. This general
sender check remains unavailable while the primary sender is empty; it does not
measure delivery through the separate owner-admin route.
[Domain API](https://resend.com/docs/api-reference/domains/list-domains),
[API-key permissions](https://resend.com/docs/api-reference/api-keys/create-api-key).

A successful domain check does not establish inbox delivery. Complete the login
flow with an authorized account and the actually received code before accepting
the email channel for live use. Read-only checks do not send messages.

Supabase sends account invitations, confirmation and password-recovery emails
through its Auth configuration. Use the separate guarded configuration runner
for production templates and Resend SMTP on port 465. It verifies the sender
before changing SMTP and preserves existing redirects. Custom SMTP is currently
absent. Supabase's default service sends only to project-team addresses; accepting
any valid email in the application does not remove that provider restriction.
Configure the verified replacement sender before general onboarding.
[Email setup, timing and live acceptance](docs/email-delivery.md).

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
- Removing an account deactivates access while retaining clinical/audit history.
  Active care must be completed, cancelled, rescheduled or reassigned first.

Appointments and availability obey the clinic timezone, hours, holidays and
approved leave. Database constraints prevent overlapping appointments. Front desk
manages intake and walk-ins; registered walk-ins require a linked consultation
and documented clinical visit before completion. Doctors manage assigned SOAP
notes, vitals, prescriptions and laboratory orders/results. Patients read their
own released records; admin/receptionist cannot access clinician SOAP content.
Clinical corrections preserve prior values for the responsible doctor.

Notifications are persisted and trigger authorized dashboard refresh through
PostgreSQL notifications, with reconnection and polling fallback. Analytics use
real activity and show zero when the clinic has none. API/operation audit logs
are retained independently of list limits.

## Deployment

Registration uses the 48 requested initial programmes, with NAS denoting
Natural and Applied Sciences. Official SPU catalogue differences are recorded in
[the catalogue review](docs/academic-catalogue.md). Kimberley address autocomplete
uses Photon/OSM; [provider configuration](docs/residential-address-search.md)
describes the cache, quotas and dedicated endpoint needed for sustained traffic.
Apply migration017 for the optional profile coordinates. Manual residential
addresses remain available whenever the map service is unavailable.

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
