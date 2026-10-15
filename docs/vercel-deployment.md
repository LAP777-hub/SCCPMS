# Deploy SCCPMS from GitHub to Vercel

The active system is the React application in the repository root and the Express API in `server/`. Import the same GitHub repository into two Vercel projects. Vercel supports a separate project for each application directory. [Vercel monorepo imports](https://vercel.com/docs/monorepos#add-a-monorepo-through-the-vercel-dashboard).

Both Vercel projects are linked to [LAP777-hub/SCCPMS](https://github.com/LAP777-hub/SCCPMS), production branch `main`: **sccpms** at `https://sccpms.vercel.app`, and **sccpms-api** at `https://sccpms-api.vercel.app`. Their production settings and separate environment variables are configured in Vercel. The frontend has three public variables; the API has eighteen private/runtime variables, including OTP validity/cooldown and the temporary owner-admin binding. Environment values remain outside Git. Deployment checks and failures are recorded in [the testing report](TESTING_REPORT.md).

Both production deployments are READY. Live checks verify frontend assets/routing,
API/database health 200, production CORS and protected GET/POST rejection. GitHub
CI passes 95/95 browser cases, 301 server checks, six real database cases and
security checks. Supabase Site URL and
signup/invite/recovery redirects now target the production frontend; previous
local callback URLs remain allowed. All valid recipient emails are accepted.
The SPU sender setup was canceled on 14 October; general email delivery still
requires a verified replacement sender and SMTP/inbox acceptance described below.

## Repository and project settings

| Setting | Frontend: sccpms | Backend: sccpms-api |
| --- | --- | --- |
| Git repository | The existing SCCPMS GitHub repository | The same repository |
| Root Directory | `.` — repository root; leave empty if Vercel displays root as blank | `server` |
| Framework Preset | Vite | Express |
| Install Command | `npm ci --include=dev` | `npm ci --include=dev` |
| Build Command | `npm run build` | `npm run build` |
| Output Directory | `dist` | Leave unset; Express becomes a Vercel Function |
| Node.js | `22.x` | `22.x` |
| Configuration | Root `vercel.json` | `server/vercel.json` |

Use Node 22.12 or newer in the 22.x line locally. Both package manifests pin the Vercel runtime to that major. Including development dependencies installs the Vite and TypeScript build tools. [Vercel Node.js version selection](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

The frontend builds `src/` and `public/`. Its academic catalogue comes from `server/src/academic-catalogue.json`, which must remain available to the frontend build. The existing typed API is exported from `server/src/app.ts`; `server/src/index.ts` starts the local port listener. After `npm run build` compiles the API, `server/app.mjs` exposes it through Vercel's native JavaScript Express entry. This retains the normal TypeScript check while avoiding a second, incompatible cloud compiler check of Helmet's conditional exports. The API project uses `dub1` and a 60-second function limit. [Express on Vercel](https://vercel.com/docs/frameworks/backend/express).

`legacy/frontend/` and `legacy/backend/` preserve the older applications. `design-references/` preserves the supplied screenshots and reference assets. They are outside the active build; do not select those folders as Vercel roots. Root `.vercelignore` excludes these references, local dependencies, build/test artifacts and local secret files without excluding the shared catalogue. Git ignores keep private environment files out of the repository. [Vercel deployment exclusions](https://vercel.com/docs/deployments/vercel-ignore).

Root `vercel.json` rewrites frontend paths to `/index.html` so direct links and authentication callbacks load the SPA. The frontend calls the separate API using `VITE_API_URL`; it does not require an API proxy in the frontend project. [Vite SPA routing on Vercel](https://vercel.com/docs/frameworks/frontend/vite#using-vite-to-make-spas).

## Frontend environment

Set these three variables on the **frontend** project's Production environment before building:

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | The HTTPS URL of the Supabase project used by the API and database |
| `VITE_SUPABASE_ANON_KEY` | That project's public publishable key or legacy anon key |
| `VITE_API_URL` | The API's actual HTTPS production origin, without a trailing slash or `/api` suffix |

For the configured API project, use `https://sccpms-api.vercel.app` as `VITE_API_URL`.

Vite embeds `VITE_` values in browser assets. Never add a service-role/secret key, database URI/password, Resend key or OTP secret with that prefix. Changes to frontend environment variables require a new frontend build. Set Production and Preview values deliberately; Vercel does not copy changes into already-built deployments. [Vercel environment variables](https://vercel.com/docs/environment-variables).

## Backend environment and database

Set these variables on the **API** project's Production environment:

| Variable | Required production setting |
| --- | --- |
| `NODE_ENV` | `production` |
| `FRONTEND_ORIGIN` | `https://sccpms.vercel.app`, or the actual frontend custom-domain origin; no path or trailing slash |
| `TRUST_PROXY` | `1` for Vercel's forwarding proxy |
| `DATABASE_URL` | The same Supabase project's transaction-pooler URI on port **6543** |
| `DATABASE_SSL_MODE` | `verify-full` |
| `DATABASE_SSL_CA` | Optional CA override; verified Supabase connections use the bundled `server/certs/prod-ca-2021.crt` when absent. PEM with literal `\n` line separators is supported |
| `SUPABASE_URL` | The same value as frontend `VITE_SUPABASE_URL` |
| `SUPABASE_ANON_KEY` | The same public key as frontend `VITE_SUPABASE_ANON_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | That project's private service-role or secret API key |
| `OTP_HMAC_SECRET` | A securely generated random secret of at least 32 characters, consistent across all API instances |
| `OTP_VALIDITY_SECONDS` | `600`: code validity from provider acceptance; permitted range 120–900 |
| `OTP_RESEND_COOLDOWN_SECONDS` | `30`: minimum interval after accepted sending; permitted range 30–300 |
| `RESEND_API_KEY` | The full Resend sending key |
| `RESEND_FROM_EMAIL` | Intentionally unset or empty until a replacement custom-domain sender is verified and enabled for sending; empty production setting requires the complete owner-admin binding below |
| `RESEND_ADMIN_OWNER_EMAIL` | Optional temporary Resend owner email, bound to the existing confirmed administrator; configure together with its Auth ID |
| `RESEND_ADMIN_OWNER_USER_ID` | Optional exact Auth UUID for that administrator; owner-only OTP route never applies to other accounts |

Vercel supplies `VERCEL=1` automatically. `PORT` is for the local server and does not select the hosted API URL. Store backend secrets in the API project's environment settings, not source files or frontend variables. Optional Photon address-search settings are documented in `server/.env.example`.

Deploy the API source that permits a blank primary sender with a complete valid
owner binding before removing its former `RESEND_FROM_EMAIL` Vercel variable.
Redeploy after the environment change. Keep both owner settings private and
configured together. This permits only the configured confirmed administrator's
real OTP delivery; all other accounts fail safely until a replacement sender is
verified. Never set `onboarding@resend.dev` as a global production sender.

Copy **Transaction pooler** from Supabase's Connect dialog. Its form is:

```text
postgresql://postgres.<PROJECT_REF>:<URL_ENCODED_DB_PASSWORD>@<POOLER_HOST>:6543/postgres
```

Use the exact pooler host and username supplied for the project. A Supabase API key is not the database password. Percent-encode reserved password characters. Transaction pooling suits serverless functions; session features and named prepared statements must not be used on that connection. [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).

Keep certificate verification enabled. The API bundles the Supabase root CA, with `DATABASE_SSL_CA` available for an explicit override. Its database helper removes URI `sslmode`, `sslcert`, `sslkey` and `sslrootcert` overrides so they cannot weaken the explicit `verify-full` policy. This handles node-postgres's URI precedence rather than disabling certificate checks. [node-postgres SSL options](https://node-postgres.com/features/ssl).

On Vercel, cross-instance updates use the durable database change log and bounded SSE: streams check for changes every two seconds, last up to 50 seconds, and recheck authentication every 15 seconds before reconnecting. Persistent PostgreSQL `LISTEN` is disabled in that runtime. **Only port 6543 is required for Vercel clinic queries.** `DATABASE_EVENTS_URL` on port 5432 belongs to local or other persistent hosting that uses `LISTEN`; omit it from Vercel. A 15-second browser read fallback keeps dashboard data current when the event stream cannot connect.

Apply all versioned `server/sql/` migrations using a trusted administrative environment before accepting traffic. The Vercel runtime additionally relies on `020_serverless_clinic_events.sql` for durable updates, `021_shared_request_limits.sql` for shared request/address-provider budgets, `022_otp_delivery_timing.sql` for pending/accepted OTP timing and safe resends, `023_otp_sender_binding.sql` for retries using the saved sender, `024_account_records_invitations.sql` for retained-account replacement links and invitation tracking, and `025_existing_invitation_state.sql` for the state of existing provider invitations.

```sh
npm ci --prefix server
npm run db:migrate --prefix server
```

Use the migration runner's securely configured database connection and verified TLS. Supabase recommends a direct connection for administration; use an appropriate reachable connection for your environment. For an existing installation that needs trusted role metadata repaired, the operator can run `npm run auth:sync-claims --prefix server`. Builds do not create sample users or run migrations automatically.

Admin deletion requires an already deactivated patient, doctor or receptionist.
Records retains the deleted identity's contacts and offers reinvitation with a
new Auth UUID; clinical history stays attached to the former identity. Existing
email accounts return `409 ACCOUNT_EMAIL_IN_USE` without profile or role
overwrites. Account lifecycle changes and password-acknowledged invitation
acceptance create persisted in-app notices. Admin report charts use real records
over a selected range of at most 366 days. These workflows still require the
general email sender and SMTP setup below before real onboarding.

The recorded university-network PostgreSQL timeout remains a separate local-network issue. Hosting the API on Vercel changes its network path but does not prove connectivity; require a deployed `/healthz` response of 200 with its database healthy. See [the connection diagnostic](session-connectivity.md).

## Supabase Auth URLs and mail

In the hosted Supabase project, open **Authentication → URL Configuration**. Set Site URL to the final frontend production origin. Add the following production Redirect URLs, preserving any local development URLs that are still needed:

```text
https://sccpms.vercel.app
https://sccpms.vercel.app/
https://sccpms.vercel.app/?auth_action=signup
https://sccpms.vercel.app/?auth_action=invite
https://sccpms.vercel.app/?auth_action=recovery
```

Replace the origin consistently if using a custom domain. Hosted settings are separate from local `supabase/config.toml`. The currently verified local callback settings do not automatically authorize Vercel domains. Registration uses `signup`; admin-created doctor/receptionist/patient invitation links use `invite`; browser recovery uses `recovery`. Keep confirmation enabled and retain templates that use the provider's `{{ .ConfirmationURL }}` so verification and redirect information remain intact. [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls), [account-link behavior](auth-email-links.md).

Supabase sends confirmation, invitation and password-reset mail. The API sends the additional login OTP through Resend's email API. Configure both channels. For Supabase custom SMTP with Resend, use host `smtp.resend.com`, port `465` with TLS, username `resend`, the full API key as the SMTP password, and a verified sender address/name. [Resend's Supabase SMTP setup](https://resend.com/docs/send-with-supabase-smtp).

**The SPU sender setup was canceled on 14 October 2026.** Leave the primary sender unset or empty until a replacement domain you own is verified. `clinic.spu.ac.za` was prepared but remained unverified; [its DNS handoff](../RESEND_UNIVERSITY_DNS.md) is now historical and optional, not an active deployment requirement. The existing administrator retains a separate `SCCPMS <onboarding@resend.dev>` OTP route with exact trusted admin ID/email/recipient checks. This sender is never enabled for other users. Importing GitHub code does not complete general sender verification or SMTP setup. [Resend's owner-only restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

Use `npm run email:check --prefix server -- --production` from a securely configured operator environment for a read-only domain check. Real inbox acceptance still requires an authorized account receiving its actual confirmation/invitation and OTP; mocked tests and a successful domain check do not establish delivery.

All valid recipient domains are accepted by the application; student email does not have to match a student number. Supabase custom SMTP remains absent, so its default service still limits Auth mail to project-team addresses. Configure the replacement verified sender and custom SMTP before general signup/invitation/recovery delivery. [Supabase SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp). [Production email setup](email-delivery.md) describes the guarded template/SMTP runner, two-hour Auth links and ten-minute login OTPs. Deploy the frontend's confirmation landing page before applying the new hosted templates. SMTP activation remains gated on verified DNS.

## Import, connect and validate

1. Reuse the existing **sccpms** frontend project, link the published repository, and set its root/framework/build settings and public environment variables as above. Create the second project from the same repository with root **server** and its own private environment variables.
2. Copy the actual production API origin into frontend `VITE_API_URL`. Set API `FRONTEND_ORIGIN` to the actual frontend origin. Rebuild/redeploy each project after changing its settings, then authorize the same frontend callback URLs in Supabase.
3. Apply migrations and finish sender verification/custom SMTP before live onboarding. Confirm the deployed `/healthz` reports a healthy database; a successful static frontend build alone does not prove the API works.
4. Verify a frontend deep link loads the SPA, assets return their correct content types, and Auth callback links return to the correct project. An unauthenticated API `/auth/profile` must reject access with 401; it must not return the frontend HTML.
5. With authorized acceptance accounts, complete each role's actual email OTP and check the correct dashboard, scheduling changes, notifications, invitation password creation, manual sign-out, and recorded audit events. Do not count fake browser fixtures as production acceptance.

Before importing the release, run the local checks from the repository root:

```sh
npm ci
npm ci --prefix server
npm run typecheck
npm run lint
npm run build
npm run build --prefix server
npm test --prefix server
npm run test:ui
```

`npm run test:database --prefix server` additionally exercises temporary isolated schemas and requires a reachable test database. Browser regressions mock services and never send email or create live users. Keep test reports and generated build output outside Git.

For preview deployments, configure a matching preview/staging frontend origin, API URL, Supabase project and callback allow-list. The API currently accepts one exact `FRONTEND_ORIGIN`; arbitrary preview hostnames are not automatically authorized. Use the Vercel environment scope intended for that preview and rebuild after changing it.
