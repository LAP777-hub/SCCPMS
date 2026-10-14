# SCCPMS - Smart Campus Clinic Patient Management System

SCCPMS is a university clinic application with a React/TypeScript frontend, an Express API, Supabase Auth, and PostgreSQL records. The active frontend is the repository root `src/`; the active backend is `server/`.

For GitHub-to-Vercel deployment, use [the deployment guide](docs/vercel-deployment.md). Import the same repository into two projects:

| Application | Vercel project | Root Directory | Build |
| --- | --- | --- | --- |
| Frontend | Reuse `sccpms` | Repository root (`.`) | Vite: `npm run build`, output `dist` |
| API | `sccpms-api` | `server` | Express: `npm run build` |

The live frontend is [sccpms.vercel.app](https://sccpms.vercel.app); the live API is [sccpms-api.vercel.app](https://sccpms-api.vercel.app), with a passing [database health check](https://sccpms-api.vercel.app/healthz). Both deploy automatically from this repository's `main` branch and have separate environment variables and `vercel.json`. GitHub CI passes **95 browser tests, 276 server checks and six real database cases**, with six explicit database skips in the unit command. Sender DNS verification, custom SMTP, inbox delivery and operational acceptance remain required before clinic use. [Testing results and failure history](docs/TESTING_REPORT.md).

## Project layout

```text
SCCPMS/
  src/                         React frontend and role dashboards
  public/                      Active logos, images and static assets
  package.json                 Frontend dependencies and local commands
  package-lock.json            Frontend dependency lock
  vercel.json                  Frontend Vite build and SPA routing
  .vercelignore                Deployment input exclusions
  server/
    app.mjs                    Vercel entry for the compiled Express app
    src/app.ts                 Typed Express app and existing middleware
    src/index.ts               Local port listener
    src/academic-catalogue.json Shared faculty/programme catalogue
    sql/                       Versioned clinic database migrations
    tests/                     API and database regression tests
    package.json               API dependencies and commands
    package-lock.json          API dependency lock
    vercel.json                Separate API deployment configuration
  tests/ui/                    Mocked Playwright browser regressions
  docs/                        Deployment, account links and diagnostics
  supabase/                    Local Auth configuration and security migrations
  legacy/frontend/             Preserved older frontend application
  legacy/backend/              Preserved older Django application
  legacy/README-before-organisation.md  Previous project documentation
  design-references/           Supplied screen designs and reference assets
```

The legacy applications and reference folders remain available for inspection. They are excluded from the active deployment. The root frontend still reads the shared catalogue from `server/src/academic-catalogue.json`; keep that file available when building.

## Local setup

Use **Node.js 22.x, version 22.12 or newer**, and npm. Install the two applications from the repository root:

```sh
npm ci
npm ci --prefix server
```

For a fresh checkout, create the ignored root `.env` and `server/.env` using their example files. Keep existing configured environment files when updating the project. The frontend needs only public Supabase configuration and the API origin:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-project-public-key
VITE_API_URL=http://localhost:4000
```

The API uses its own Supabase private key, PostgreSQL connection, OTP secret and Resend configuration. PostgreSQL and Supabase Auth/profiles must refer to the **same Supabase project**. Set local `FRONTEND_ORIGIN=http://localhost:5173`; use verified TLS for hosted database connections. Never put private keys, database passwords or email credentials in a `VITE_` variable.

Apply versioned migrations from an authorized, configured administrative environment:

```sh
npm run db:migrate --prefix server
```

For an existing installation that needs trusted role metadata repaired, use `npm run auth:sync-claims --prefix server`. No build or migration creates demo users, sample appointments or invented analytics.

Start the frontend and API together:

```sh
npm run dev
```

This starts the frontend at `http://localhost:5173` and API at `http://localhost:4000`. To run them separately, use `npm run dev:frontend` and `npm run dev --prefix server` in separate terminals. Restart the appropriate service after changing its environment.

## Roles and account access

The server validates the Supabase session, confirmed email, trusted role and active account before authorizing access. Selecting a role on the login form does not grant it. A successful login requires the account's real email OTP before opening its role dashboard.

| Role | Main workflows |
| --- | --- |
| Patient | Doctor availability, booking, appointment history/status, cancellation/rescheduling, own clinical records and profile, notifications |
| Doctor | Assigned appointments, SOAP notes/vitals, prescriptions, laboratory orders/results, availability and leave requests |
| Admin | Patient/staff account management, doctor/receptionist invitations, doctor directory, clinic policies, appointment oversight, leave approvals, reports and audit records |
| Receptionist | Patient registration/intake, walk-in queue, scheduling assistance and front-desk operations |

All roles can use any valid email address, including personal and university mailboxes. Students still register with a student number, faculty/programme, and residential address; their email need not match the student number. Doctors and receptionists are created by the admin and receive invitation links to choose their own password. Profile identity details are stored and validated; external university enrolment/identity integration remains separate work.

Appointment and clinical data come from the database. Empty datasets produce zero totals and empty states. Scheduling uses clinic hours, timezone and booking policies, and rejects invalid/conflicting slots. Clinical history and audit records are retained when account access is suspended.

Updates use authenticated SSE with polling fallback. On Vercel the API uses a durable database change log and bounded streams across instances; persistent PostgreSQL `LISTEN` is used only on suitable local or persistent hosting. See [the Vercel guide](docs/vercel-deployment.md) for the runtime and port differences.

## Login and email setup

Temporary account-service or network failures preserve credentials so Sign In can retry. Role/profile checks and email OTP still apply. Old requests cannot overwrite or verify a newer login. Suspended accounts return to login with the administrator contact message; invalid credentials retain their own error.

If the API reports "Unable to validate your session right now", run:

```sh
npm --prefix server run connections:check
```

The read-only checker distinguishes HTTP/CORS failures from PostgreSQL connectivity. The recorded university-network incident blocked PostgreSQL TCP access while Supabase HTTPS remained healthy. See [the connection diagnostic](docs/session-connectivity.md); changing Auth redirect URLs does not repair that database connection.

Supabase sends confirmation, invitation and password-reset emails. Resend sends the additional login OTP through the API. Both channels need verified production mail configuration. [Account email links](docs/auth-email-links.md) explains the callback markers and password-setup flow.

The university sender `clinic.spu.ac.za` remains pending DNS verification. SPU has been asked to help with a subdomain; IT can publish [the prepared DNS records](RESEND_UNIVERSITY_DNS.md) without granting DNS access. A separately owned verified sender domain also works with university recipients. See [production email setup](docs/email-delivery.md) for the guarded SMTP/template runner, ten-minute OTPs and live acceptance requirements.

The existing administrator has a temporary real-OTP route through Resend's owner-only sender, bound to the confirmed owner's exact account ID, role and email. Other accounts continue using the main sender. This restores administrator mail access while the verified clinic sender is pending; it does not configure general signup/invitation SMTP.

Read-only sender checks are available from a securely configured environment:

```sh
npm run email:check --prefix server
npm run email:check --prefix server -- --production
```

## Validation and builds

From the repository root:

```sh
npm run typecheck
npm run lint
npm run build
npm run build --prefix server
npm test --prefix server
npm run test:ui
```

Build before browser tests, which use the local Vite preview. Browser regressions mock external services; they send no real mail and create no live accounts. `npm run test:database --prefix server` additionally exercises temporary isolated schemas and requires a reachable test database. Keep reports, dependencies, build output and private environment files outside Git.

The frontend build creates `dist/`. Vercel imports the frontend from the repository root and the API from `server`; do not import `legacy/frontend` or `legacy/backend` for this system. The deployment guide lists the exact public/private environment settings, production Auth callback URLs, custom SMTP and TLS requirements.

For current operating procedures and remaining external requirements, see [OPERATIONS.md](OPERATIONS.md) and [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md). The archived README in `legacy/` records the older project instructions; the commands and deployment roots above describe the active application.

## Team Members and Responsibilities

| Team Member | Role | Responsibilities |
|---|---|---|
| Lucky Albert Pinga | Backend Developer | Supabase database, authentication, and backend functionality. |
| Lucky Malegole Seloane | Frontend Developer | User interface, responsive design, and frontend integration. |
| Lungelo Mjuleka | Tester | System testing, bug reporting, and quality assurance. |
| Katleho Pitikoe | System Architect & Documentation | System requirements, architecture, technical specifications, and documentation. |
