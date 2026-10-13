# Deploy SCCPMS from GitHub to Vercel

The active system is the React application in the repository root and the Express API in `server/`. Import the same GitHub repository into two Vercel projects. Vercel supports a separate project for each application directory. [Vercel monorepo imports](https://vercel.com/docs/monorepos#add-a-monorepo-through-the-vercel-dashboard).

Both Vercel projects are linked to [LAP777-hub/SCCPMS](https://github.com/LAP777-hub/SCCPMS), production branch `main`: **sccpms** at `https://sccpms.vercel.app`, and **sccpms-api** at `https://sccpms-api.vercel.app`. Their production settings and separate environment variables are configured in Vercel. The frontend has three public variables; the API has fifteen private/runtime variables. Environment values remain outside Git. Deployment checks and failures are recorded in [the testing report](TESTING_REPORT.md).

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

The frontend builds `src/` and `public/`. Its academic catalogue comes from `server/src/academic-catalogue.json`, which must remain available to the frontend build. The API exports Express from `server/src/app.ts`; `server/src/index.ts` starts the local port listener. The API project uses `dub1` and a 60-second function limit. [Express on Vercel](https://vercel.com/docs/frameworks/backend/express).

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
| `RESEND_API_KEY` | The full Resend sending key |
| `RESEND_FROM_EMAIL` | A sender on a custom domain verified and enabled for sending in Resend |
| `UNIVERSITY_EMAIL_DOMAINS` | `spu.ac.za` |

Vercel supplies `VERCEL=1` automatically. `PORT` is for the local server and does not select the hosted API URL. Store backend secrets in the API project's environment settings, not source files or frontend variables. Optional Photon address-search settings are documented in `server/.env.example`.

Copy **Transaction pooler** from Supabase's Connect dialog. Its form is:

```text
postgresql://postgres.<PROJECT_REF>:<URL_ENCODED_DB_PASSWORD>@<POOLER_HOST>:6543/postgres
```

Use the exact pooler host and username supplied for the project. A Supabase API key is not the database password. Percent-encode reserved password characters. Transaction pooling suits serverless functions; session features and named prepared statements must not be used on that connection. [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).

Keep certificate verification enabled. The API bundles the Supabase root CA, with `DATABASE_SSL_CA` available for an explicit override. Its database helper removes URI `sslmode`, `sslcert`, `sslkey` and `sslrootcert` overrides so they cannot weaken the explicit `verify-full` policy. This handles node-postgres's URI precedence rather than disabling certificate checks. [node-postgres SSL options](https://node-postgres.com/features/ssl).

On Vercel, cross-instance updates use the durable database change log and bounded SSE: streams last up to 50 seconds, with authentication rechecked every 15 seconds, then reconnect. Persistent PostgreSQL `LISTEN` is disabled in that runtime. **Only port 6543 is required for Vercel clinic queries.** `DATABASE_EVENTS_URL` on port 5432 belongs to local or other persistent hosting that uses `LISTEN`; omit it from Vercel. Dashboard polling remains available when the event stream cannot connect.

Apply all versioned `server/sql/` migrations using a trusted administrative environment before accepting traffic. The Vercel runtime additionally relies on `020_serverless_clinic_events.sql` for durable updates and `021_shared_request_limits.sql` for request limits and address-provider budgets shared across instances. These replace dependence on instance-local counters for those limits.

```sh
npm ci --prefix server
npm run db:migrate --prefix server
```

Use the migration runner's securely configured database connection and verified TLS. Supabase recommends a direct connection for administration; use an appropriate reachable connection for your environment. For an existing installation that needs trusted role metadata repaired, the operator can run `npm run auth:sync-claims --prefix server`. Builds do not create sample users or run migrations automatically.

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

**University email delivery is still blocked by sender DNS verification.** `clinic.spu.ac.za` was prepared in Resend but remains unverified. University IT must approve and publish the records in [RESEND_UNIVERSITY_DNS.md](../RESEND_UNIVERSITY_DNS.md). After verification, an approved example sender is `SCCPMS <login@clinic.spu.ac.za>`. The `onboarding@resend.dev` sender is limited to the Resend account owner and is refused by production configuration. Importing GitHub code does not complete DNS or SMTP setup.

Use `npm run email:check --prefix server -- --production` from a securely configured operator environment for a read-only domain check. Real inbox acceptance still requires an authorized account receiving its actual confirmation/invitation and OTP; mocked tests and a successful domain check do not establish delivery.

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
