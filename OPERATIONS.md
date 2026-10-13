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

The default development sender is `SCCPMS <onboarding@resend.dev>`. Resend limits
that test domain to the email address associated with the Resend account. To send
to university users, set `RESEND_FROM_EMAIL` to a mailbox at a custom domain you
own and have verified in Resend. Production requires a full key and custom sender.
See [Resend test-domain restrictions](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)
and [domain verification](https://resend.com/docs/dashboard/domains/introduction).

The requested university sender `clinic.spu.ac.za` has been added to this Resend
account with sending enabled, receiving disabled, tracking disabled and enforced
TLS. It remains unverified. [RESEND_UNIVERSITY_DNS.md](RESEND_UNIVERSITY_DNS.md)
contains the actual DNS records for university IT to approve and publish.
University DNS was not changed. The local sender remains the owner-only test
sender until the university completes verification. After verification, set
`RESEND_FROM_EMAIL="SCCPMS <login@clinic.spu.ac.za>"`, run the production email
check and restart the API. To regenerate the provider record handoff:

```sh
npm run email:prepare-university --prefix server
```

That preparation command may create the pending domain in this Resend account
and disable its tracking; it does not publish DNS or send messages.

```sh
npm run email:check --prefix server
npm run email:check --prefix server -- --production
```

This native Node checker performs only authenticated `GET /domains` requests and
prints configuration/status categories. It checks the exact sender domain is
verified and enabled for sending; it never sends an email or prints keys, OTPs,
recipient addresses or provider payloads. A sending-only key cannot read domains,
so use the Resend dashboard or a domain-readable key for this administrative check.
The API can keep a restricted sending key for runtime delivery.
[Domain API](https://resend.com/docs/api-reference/domains/list-domains),
[API-key permissions](https://resend.com/docs/api-reference/api-keys/create-api-key).

A successful domain check does not establish inbox delivery. Complete the login
flow with an authorized account and the actually received code before accepting
the email channel for live use. No external email was sent during this change.

Supabase still sends account invitations, confirmation and password-recovery
emails through its Auth configuration. Application OTP configuration does not
change those settings. If using Resend for Auth mail too, configure custom SMTP
in Supabase: `smtp.resend.com`, port `587` with STARTTLS, username `resend`, and
the full API key as password, with a verified sender. Authorize the production
Site URL and invitation/recovery redirects. These external settings were not
changed by the application update. [Resend SMTP settings](https://resend.com/docs/send-with-smtp).

## Roles and clinic workflows

Confirmation, invitation and recovery links use explicit action callbacks at
`FRONTEND_ORIGIN`. Invited doctors/receptionists choose their own password, then
sign in and verify email OTP. [Email link configuration and checks](docs/auth-email-links.md)
describes the hosted Site URL, allow-list and local-versus-hosted distinction.
Run `npm run auth:check-redirects --prefix server` to check actual routing without
sending messages or creating accounts.

- The existing administrator may keep a personal email. New patients, doctors
  and receptionists require university email addresses.
- Students require their student number and associated university mailbox;
  lecturer/staff patients require a staff number.
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

Production needs HTTPS origins, full Resend credentials, a verified custom sender,
configured Supabase Auth mail/redirects, and certificate-verified PostgreSQL TLS.
`DATABASE_SSL_CA` supplies a custom CA when needed. Ordinary Supabase queries can
use the transaction pooler on 6543; live `LISTEN` updates require a session
connection on 5432, configured through `DATABASE_EVENTS_URL`.

Docker Compose requires `RESEND_API_KEY` and `RESEND_FROM_EMAIL`. The backend
image includes native migration and read-only email-check runners:

```sh
docker compose run --rm backend npm run db:migrate
docker compose run --rm backend npm run email:check -- --production
```

Supply deployment secrets before running these commands. The shutdown grace
period permits active HTTP requests, audits and streams to drain. CI uses Node
22 and dummy credentials for unit/database/browser checks; frontend Docker builds
use actual public deployment variables. No GitHub workflow or hosted deployment
was run during this update. Historical SMS helper scripts are retained but are
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
