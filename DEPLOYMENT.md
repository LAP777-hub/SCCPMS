# SCCPMS deployment

Deploy the active frontend and API as two Vercel projects connected to
[the SCCPMS GitHub repository](https://github.com/LAP777-hub/SCCPMS).

- Frontend Root Directory: repository root; Vite; output `dist`.
- Backend Root Directory: `server`; Express; output directory unset.

Follow [the complete Vercel deployment guide](docs/vercel-deployment.md) for
project settings, separate environment variables, database migrations, Supabase
Auth callbacks, university email verification and live acceptance checks.

[Testing results](docs/TESTING_REPORT.md) distinguish automated fixtures from
live acceptance. Earlier deployment notes are preserved in
`legacy/documentation/DEPLOYMENT-before-vercel.md` for historical reference.
