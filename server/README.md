# SCCPMS API

This Express API uses the same Supabase project as the React frontend for
identity, profiles and PostgreSQL clinic records. Email OTP uses Resend.

For Vercel, select `server` as Root Directory, Express as framework, Node 22.x,
`npm ci --include=dev` for installation and `npm run build` for the build.
`src/app.ts` exports the typed app without opening a port. After compilation,
`app.mjs` exposes that same app to Vercel's native JavaScript Express runtime.
`src/index.ts` runs the local/container listener.
[Complete deployment guide](../docs/vercel-deployment.md).

## Local development

Copy `.env.example` to ignored `.env`, configure real credentials, then run:

```sh
npm ci
npm run db:migrate
npm run dev
```

Use `VITE_API_URL=http://localhost:4000` in the frontend locally. Root
`npm run dev` starts both services. Production uses separate HTTPS origins
and verified database TLS; credentials never belong in frontend variables.

## Authentication and workflows

Supabase validates identity; trusted application metadata determines roles.
Confirmed, active accounts must verify the email OTP bound to their Auth
session before entering protected clinic workflows. Students self-register
with university identity and address details. Administrators invite doctors
and receptionists, who choose their passwords using the invitation link.
Every role may use any valid mailbox; email need not match the university ID.

APIs cover scheduling, availability, leave, clinical visits/prescriptions/labs,
notifications, patient records, operational analytics and audit history.
Patient login deletion requires deactivation and preserves clinical history.
See [API documentation](../API_DOCUMENTATION.md) and [operations](../OPERATIONS.md).

Vercel uses the transaction pooler on port 6543, managed connection pooling, retained
audit writes, PostgreSQL-backed request/provider budgets, and bounded SSE
streams backed by migration 020. Local/container mode retains session LISTEN
on port 5432. Apply migrations 020/021/022/023 before serving the new Vercel API.
Login OTPs expire five minutes after provider acceptance; failed resends retain a
valid code. A verified Resend sender and Supabase custom SMTP are needed for live
mail. [Email configuration and acceptance](../docs/email-delivery.md).

## Checks

```sh
npm run typecheck
npm run build
npm test
npm run test:database
npm run connections:check
```

Database tests use isolated temporary schemas and require a reachable test
database. `GET /healthz` requires a working PostgreSQL connection.
[Test evidence and remaining acceptance](../docs/TESTING_REPORT.md).
