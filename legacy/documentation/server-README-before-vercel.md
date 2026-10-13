# SCCPMS API

The API keeps Supabase Auth as the identity provider and uses Railway PostgreSQL for operational clinic data. The browser sends its Supabase access token to this service; the service validates the token and reads the account role from Supabase before authorizing a request.

## Local Setup

1. Create a local PostgreSQL database or a Railway PostgreSQL service.
2. Copy `.env.example` to `.env` and set each server-only secret. Never put the service-role key, SMS key, or OTP HMAC secret in the Vite environment.
3. Run `npm install`, then `npm run db:migrate`, then `npm run dev` from this directory.
4. Set the frontend `.env` values from the root `.env.example`; use `VITE_API_URL=http://localhost:4000` locally.

`/healthz` reports API and database availability. Every route under `/api` requires a valid Supabase session and a verified OTP for that session. OTP endpoints use Africa's Talking and never return the code to the browser. Configure an enabled Africa's Talking account, sender, and destination-country support before enabling production login; save phone numbers in international E.164 format. Patient and staff onboarding is invitation-only until the university identity provider and eligibility verification are approved. Disable public sign-ups in Supabase Auth. Configure production SMTP and allowed invitation redirect URLs before accepting invitations.

## Railway

Create a Railway PostgreSQL service and an API service with the service root directory set to `server`. The Railway config builds the API, applies versioned SQL migrations before deployment, and checks `/healthz`. Set `DATABASE_URL` to Railway's private Postgres connection string and configure all values from `.env.example` as Railway service variables. Production requires an explicit `DATABASE_SSL_MODE`: use `verify-full` for TLS with certificate validation, optionally providing `DATABASE_SSL_CA`; use `disable` only when the database is accessed over an institution-approved private network. Set `FRONTEND_ORIGIN` to the exact deployed frontend origin. The frontend host separately needs `VITE_API_URL` pointing at the deployed API and the public Supabase URL/anon key.

Deploy `supabase/migrations/20260928000000_normalize_patient_registration_roles.sql` to the existing Supabase project before accepting new registrations. The retired Supabase Edge Functions also need to be redeployed with their new 410 responses or deleted in the Supabase dashboard; editing local source alone does not change already-deployed functions.

Also apply `supabase/migrations/20260928001000_create_profiles_on_signup.sql` and then `supabase/migrations/20260928002000_add_registration_details.sql` after the role-normalization migration. Configure Supabase Auth's production SMTP and allowed invitation redirect URLs before inviting accounts. To bootstrap the first administrator, have a trusted database operator create/confirm the account through Supabase Auth, ensure its profile and E.164 phone exist, then set that one profile's role to `admin` through the Supabase SQL editor. Do not expose a public admin-registration route.

## Initial Data

The service intentionally has no sample clinic users, doctors, appointments, or patient records. An admin account must be provisioned by a trusted operator. The admin can add doctor/receptionist accounts; doctor provisioning adds the practitioner to the Railway directory. Patients may self-register and request appointments from active doctors. Appointment overlap is rejected by a PostgreSQL exclusion constraint. `audit_events` records account/appointment actions without storing clinical note content.

## Current API

- `GET /healthz`
- `POST /auth/otp/send`, `POST /auth/otp/verify`
- `GET/PATCH /api/profile`
- `GET /api/doctors`, `POST /api/doctors`, `POST /api/staff`
- `GET /api/patients`
- `GET /api/appointments`, `POST /api/appointments`, `PATCH /api/appointments/:id/status`
- `GET /api/notifications`, `PATCH /api/notifications/:id/read`, `POST /api/notifications/read-all`

Medical records, medication, billing/payment processing, leave requests, doctor availability slots, email delivery, and institutional SSO are not part of this initial API and must not be treated as operational until their requirements and workflows are implemented and reviewed.