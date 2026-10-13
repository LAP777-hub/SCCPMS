# SCCPMS API reference

This reference describes the active API in `server/src` and the root React application in `src`. It does not describe the separate legacy frontend directory. Updated 12 October 2026.

## Connection and responses

The development API defaults to `http://localhost:4000`; its port is configured by `PORT`. The frontend reads its API origin from `VITE_API_URL`, and the server accepts the configured `FRONTEND_ORIGIN` through CORS.

Authenticated requests send `Authorization: Bearer <Supabase access token>`. Requests with a JSON body also send `Content-Type: application/json`. JSON bodies are limited to 32 KiB. Successful record reads and writes usually return `{ "data": ... }`; collection reads return an array under `data`. Authentication, monitoring and streaming endpoints have the response shapes described below.

Errors generally return `{ "error": "message" }`, with optional validation `details`, machine-readable `code` or `requestId`. Rate-limit middleware can return plain text. Clients should display the server's error, keep unsaved input, and refresh availability after a scheduling conflict.

## Authentication and account creation

The application signs in with Supabase Auth using email and password. The API validates that access token with Supabase, derives privileges from protected `app_metadata.clinic_role`, checks account activation, and ties OTP verification to the token's `session_id`. A role selected in the login UI does not grant privileges. Public registration always provisions the `patient` role; `Student`, `Lecturer` and `SPU Staff` are university identity categories.

All `/api` routes require authentication and current server-side OTP verification. `/auth/profile`, `/auth/logout` and `/auth/otp/*` require authentication but can run before OTP verification. `POST /auth/register`, `GET /registration/addresses`, `GET /healthz` and `GET /metrics` are public.

| Endpoint | Request | Result |
| --- | --- | --- |
| `POST /auth/register` | Required `email`, `password`, `fullName`, `phone`, `userType`; identity fields described below | `201` with `confirmationRequired` and `message`; an obscured existing-account response can be `202` |
| `GET /auth/profile` | Bearer token | `{ data: profile }`, including the trusted role, current Auth email and contact phone |
| `GET /auth/otp/status` | Bearer token | `{ verified: boolean }` for this auth session and current account email |
| `POST /auth/otp/send` | Bearer token; no recipient field | `202` with `message`, `deliveryMode: "email"`, masked `destination` and `expiresInSeconds: 300` after Resend accepts the email |
| `POST /auth/otp/verify` | `{ code: string }`, exactly six digits | `{ message: "Verification successful." }` |
| `POST /auth/logout` | Bearer token | Ends OTP verification and active challenges for this session; the client also signs out of Supabase |

Registration accepts only its declared fields. There is no public staff or administrator registration and no accepted client-supplied `role`. Password length is 10–128 characters, the name is 2–160 characters, and the phone must match international format `+` followed by 8–15 digits with a nonzero first digit. Students must supply `studentNumber`; lecturers and university staff must supply `staffNumber`.

Students must also supply `department`, `program` and a nonempty `addressLine1` (Residential Address). Faculty codes are `EMS`, `EDU`, `Humanities` and `NAS`; NAS explicitly maps to Natural and Applied Sciences. The programme must exactly match one of the selected faculty's entries in `server/src/academic-catalogue.json`. For staff patients these selections and the address remain optional. `addressLine2`, `city`, `province` and `postalCode` remain optional API fields; City, Province and Postal code are removed from the registration form. Map selections may include `addressLatitude`, `addressLongitude` and `addressSource: "photon"`; coordinates must be finite, bounded and supplied together. Manual addresses save without coordinates and never require geocoder validation. Registration saves the Supabase authentication account, clinic profile (including signup-trigger-created profiles) and protected role/contact metadata. A partial provisioning failure returns `503` with the relevant recovery message. Email confirmation follows the Supabase project's settings; registration does not bypass email OTP verification or return a privileged session.

`GET /registration/addresses?q=...` accepts 3–200 characters and returns Kimberley Photon/OSM suggestions as `{ data: [{ id, address, latitude, longitude, source: "photon" }], provider, attribution }`. It is available before sign-in, rate-limited and cached. Search failures return `503`; clients retain manual address entry. See [address provider configuration and limits](docs/residential-address-search.md) and the [initial academic catalogue review](docs/academic-catalogue.md).

If `UNIVERSITY_EMAIL_DOMAINS` is configured as a comma-separated list, registration restricts email domains to that list. Identity numbers and domain restrictions are input checks. **The project has no external university identity verification integration.** They do not establish that a person is enrolled or employed by the university.

OTP emails go to the current confirmed email returned by Supabase Auth, including a personal email for the existing administrator. Request bodies cannot override the recipient. Phone numbers are contact data. Codes are stored as HMAC hashes bound to the account, auth session and normalized email. Changing the email invalidates earlier verification; changing only the phone preserves it. Apply `015_otp_email_binding.sql` before using this channel; earlier phone-bound sessions cannot authorize email login.

OTP codes expire after five minutes, permit five incorrect attempts, and have a one-minute resend cooldown plus ten requests per account per hour, persisted across sessions and API restarts. After successful verification, the same authenticated session and current email remain verified until logout; there is no application inactivity timeout or separate dashboard lifetime. Apply `016_manual_logout_sessions.sql` to preserve existing still-valid email verification; expired sessions are not revived. Incorrect codes return `401`, missing/consumed challenges `404`, expired codes `410`, and throttling or exhausted attempts `429`. Provider delivery failure returns `502`; missing email configuration or database unavailability returns `503`. Missing/revoked verification causes protected requests to return `428` with `code: "OTP_REQUIRED"`. Provider acceptance is recorded with its message reference; it does not prove inbox delivery.

The browser persists Supabase sessions and renews short-lived access tokens. An API `401` with `SESSION_INVALID` prompts one shared token renewal and one same-session retry before login is required; an old request is not replayed under another login. Temporary Auth dependency failures return `503`, preserving the browser session. Hosted Supabase session timeout/revocation policies remain authoritative.

Configure server-only `RESEND_API_KEY` and `RESEND_FROM_EMAIL`. Production requires a verified custom sender domain. The default `onboarding@resend.dev` sender is restricted to the Resend account owner; university recipients require the DNS verification described in `RESEND_UNIVERSITY_DNS.md`. Supabase confirmation/invitation/recovery mail has separate Auth SMTP configuration.

## Profiles, patients and staff

New signup confirmations use `${FRONTEND_ORIGIN}/?auth_action=signup`.
Doctor/receptionist and patient invitations use `/?auth_action=invite`; password
recovery uses `/?auth_action=recovery`. A validated invitation session opens the
user's own password form before normal sign-in and email OTP. Callback query
markers alone grant no access. Configure these URLs in the hosted Supabase Auth
allow-list and set Site URL to the actual application origin. Local development
uses `http://localhost:5173`. [Configuration and routing checks](docs/auth-email-links.md).

### Current profile

`GET /api/profile` returns the current profile after OTP verification. `PATCH /api/profile` accepts one or more of `full_name`, `address_line1`, `address_line2`, `city`, `province` and `postal_code`, with nullable optional values. Address text edits clear any previously selected coordinates and set the source to manual (or null for an empty address). It does not accept email, phone or role changes.

### Patient directory

| Endpoint | Permission | Behavior |
| --- | --- | --- |
| `GET /api/patients` | Admin or receptionist | Patient profiles, university/contact fields and computed account `active` state |
| `POST /api/patients` | Admin or receptionist | Saves a patient profile and sends a Supabase account invitation |
| `PATCH /api/patients/:id` | Admin or receptionist | Edits patient identity/contact details; only admin may set `active` |
| `DELETE /api/patients/:id` | Admin | Permanently removes an already inactive patient's Auth login, retains clinical identity/history and removes the account from operational patient lists |

Patient invitation requires `email`, `fullName`, `phone` and `userType` (`Student`, `Lecturer` or `SPU Staff`). Optional nullable fields are `studentNumber`, `staffNumber`, `department` and `program`. Its `201` response includes the account `id` and `invitationSent: true`. The invited user completes account setup and OTP before accessing a dashboard.

Patient updates accept `fullName`, `phone`, `userType`, `studentNumber`, `staffNumber`, `department`, `program` and, for administrators, `active`. At least one declared field is required. Setting `active: true` reactivates an account. Email and role are not editable through this route.

### Staff accounts and doctor directory

| Endpoint | Permission | Behavior |
| --- | --- | --- |
| `GET /api/staff` | Admin | Doctor and receptionist profiles with `active`, `doctor_id`, `specialty` and `doctor_active` |
| `POST /api/staff` | Admin | Invites a doctor or receptionist and saves their profile; doctors also receive a booking-directory record |
| `PATCH /api/staff/:id` | Admin | Edits staff details and synchronizes linked doctor details |
| `DELETE /api/staff/:id` | Admin | Deactivates the staff account and its linked doctor directory entry |
| `GET /api/doctors` | Any verified account | Active booking-directory entries: `id`, `user_id`, `full_name`, `specialty`, `department` |
| `POST /api/doctors` | Admin | Upserts a directory entry linked to an existing doctor account |
| `PATCH /api/doctors/:id` | Admin | Updates directory fields or booking activation |
| `DELETE /api/doctors/:id` | Admin | Removes the doctor from booking by setting directory `active` to false |

Staff invitation requires `email`, `role` (`doctor` or `receptionist`), `fullName` and international `phone`. `department` is optional; `specialty` is required for doctors. Staff updates accept `fullName`, `phone`, nullable `department`/`program`, doctor `specialty`, and `active`; patient identity fields do not apply.

Doctor directory creation requires `userId`, `fullName` and `specialty`, with optional nullable `department`. Directory updates accept `fullName`, `specialty`, nullable `department` and `active`. Doctor names, department and specialty are synchronized to the linked clinic profile. Reactivate a disabled staff account before enabling its directory entry.

Patient deactivation uses `PATCH /api/patients/:id` with `{ "active": false }` and remains reversible. Permanent patient login deletion uses `DELETE /api/patients/:id` after deactivation, with an explicit confirmation in the admin dashboard. Active accounts or ongoing appointments/walk-ins return `409`. A committed deletion request blocks editing and reactivation; provider or finalization failures return `503` with `PATIENT_DELETION_PENDING` and support retrying the same DELETE. Successful and repeated completed deletions retain the profile UUID, medical/appointment history and audit records. The original profile email is archived in `deleted_email` and replaced with a unique inactive marker so a later signup can use the address with a fresh identity.

Staff and doctor-directory DELETE endpoints retain their existing deactivation behavior. Account deactivation blocks API access and bans Supabase login; patient login deletion cannot be reversed. Suspended account denials return `403` with `ACCOUNT_DISABLED`; the login screen displays the suspension notice and links to `mailto:luckypinga077@gmail.com`.

## Appointments and scheduling

### Appointment endpoints

| Endpoint | Permission and contract |
| --- | --- |
| `GET /api/appointments` | Admin/receptionist see clinic appointments; doctors see their assigned appointments; patients see their own. Returns up to 500 rows, including patient/doctor names, `reason`, times and status. |
| `POST /api/appointments` | Patients book themselves; admin/receptionist must supply `patientUserId` for a registered active patient. Doctors do not use this booking route. |
| `PATCH /api/appointments/:id/status` | `{ status }`; allowed transitions and ownership are checked below. |
| `POST /api/appointments/:id/reschedule` | `{ slotId }`; owner, assigned doctor, admin or receptionist, with policy checks. |

Booking requires `slotId`, `consultationType` (2–120 characters) and `mode` (`in_person` or `telehealth`). Optional `reason` is nullable and limited to 2,000 characters. New bookings start `pending`, claim the availability slot, create notifications and audit records, and commit together. Patients cannot book on behalf of other patients.

Appointment states are `pending`, `confirmed`, `in_progress`, `completed`, `cancelled` and `no_show`. Permissions are specific to each transition:

| Role | Allowed transition |
| --- | --- |
| Patient, including legacy `student`/`lecturer`/`staff` roles | Own `pending` or `confirmed` appointment to `cancelled` |
| Admin or receptionist | `pending` to `confirmed`; `pending` or `confirmed` to `cancelled` |
| Assigned doctor | `pending` to `confirmed`; `pending` or `confirmed` to `cancelled`; `confirmed` to `in_progress` or `no_show`; `in_progress` to `completed` |

Confirmation is unavailable after the appointment ends. A doctor may start a confirmed appointment at most 15 minutes early; no-show is unavailable before its start. Completion requires a saved clinical visit. Unauthorized transitions return `403`; missing, out-of-scope or no-longer-valid state changes can return `404`. Cancellation retains the appointment and releases its original availability slot. There is no physical appointment-delete endpoint.

Rescheduling requires `pending` or `confirmed` status, fewer than ten previous reschedules, and the configured notice period **before the existing appointment**. The new slot must still be bookable and must not overlap the patient's other appointments. Doctors may reschedule only appointments assigned to them and only within their own schedule. Successful rescheduling releases the old slot, claims the new one, resets status to `pending`, records reschedule history, and notifies affected accounts.

### Availability and clinic policy

| Endpoint | Permission and contract |
| --- | --- |
| `GET /api/doctors/:id/availability?date=YYYY-MM-DD` | Any verified account; returns only currently bookable times on that date in the clinic timezone |
| `GET /api/availability-slots?doctorId=UUID` | Admin/receptionist or doctor; filter optional, doctors always scoped to themselves; returns status-bearing schedule rows, up to 2,000 |
| `POST /api/availability-slots` | Admin/receptionist or the same doctor; requires `doctorId`, `startsAt`, `endsAt` |
| `PATCH /api/availability-slots/:id` | Same ownership; accepts `status` (`available`/`blocked`), a pair of `startsAt`/`endsAt`, or both |
| `DELETE /api/availability-slots/:id` | Same ownership; physically deletes an unbooked slot without referenced appointment/reschedule history |
| `GET /api/clinic/settings` | Any verified account |
| `PUT /api/clinic/settings` | Admin; requires all policy fields below |

Slot timestamps are ISO 8601 instants with `Z` or an explicit offset. A slot must last more than zero and at most 30 minutes, start in the future, remain on one clinic calendar date, and fit clinic opening hours. Overlapping doctor schedules, booked appointments, clinic holidays and approved leave restrict availability. The API applies these rules to discovery, booking, rescheduling and reopening a blocked slot; it rechecks availability in a transaction rather than trusting a previously displayed time.

Booked slots cannot be edited or deleted. Referenced historical slots cannot have their times changed or be physically deleted; block booking instead. `409` denotes a scheduling conflict or protected history. Reopening unavailable/past/out-of-policy times returns `422`.

Settings read fields are `timezone`, `opens_at`, `closes_at`, `default_appointment_minutes` and `minimum_reschedule_notice_hours`. The update body uses `timezone`, `opensAt`, `closesAt`, `defaultAppointmentMinutes` and `minimumRescheduleNoticeHours`. Timezone must be a valid IANA name, opening/closing times use `HH:mm`, closing is later than opening, default duration is 10–30 minutes, and notice is 0–168 hours.

The configured clinic timezone governs date-based availability, clinic hours, leave, report boundaries and dashboard dates. Browser/device timezone must not change the instant submitted for a clinic wall-clock time. The active frontend converts that wall-clock time to an ISO instant before submitting it.

## Clinical documentation

Only doctors create or edit clinical records, scoped to their own visits. Patients read their own records. Administrators and receptionists cannot read clinical visits, prescriptions or lab results through these endpoints. Clinical reads and writes create audit events; clinical records are retained rather than physically deleted.

| Endpoint | Contract |
| --- | --- |
| `POST /api/patient-visits` | Doctor: requires assigned `appointmentId` in `in_progress`/`completed` and `chiefComplaint`; saves one visit for the appointment |
| `PATCH /api/patient-visits/:id` | Recording doctor: one or more visit fields, excluding `appointmentId` |
| `GET /api/patient-visits` | Doctor's recorded visits or patient's own visits, up to 500 |
| `POST /api/prescriptions` | Doctor: requires own `visitId`, `medication`, `dosage`, `frequency`, `duration` |
| `PATCH /api/prescriptions/:id` | Prescribing doctor: active prescription to `discontinued` or `completed` |
| `GET /api/prescriptions` | Prescribing doctor's records or patient's own records, up to 500 |
| `POST /api/lab-orders` | Doctor: requires own `visitId` and `testName`; optional nullable `clinicalIndication` |
| `PATCH /api/lab-orders/:id` | Ordering doctor: `{ status, resultSummary? }`; `resulted` requires a nonempty result |
| `GET /api/lab-orders` | Ordering doctor's records or patient's own results, up to 500 |

Optional nullable SOAP/visit fields are `history`, `examination`, `assessment` and `plan`. Optional nullable vitals are `temperatureC` (25–45), `bloodPressureSystolic` (integer 40–300), `bloodPressureDiastolic` (integer 20–200), `heartRate` (integer 20–250), `respiratoryRate` (integer 5–80), `oxygenSaturation` (0–100) and `weightKg` (0–1,000).

Optional prescription fields are nullable `route`, `quantity` and `instructions`. Laboratory states are `ordered`, `collected`, `processing`, `resulted` and `cancelled`. Collection requires `ordered`; processing requires `collected`; results or cancellation may follow any unfinished state. Resulted/cancelled orders are closed. Prescription creation/status updates and lab orders/results generate patient notifications.

## Walk-ins and linked clinical visits

| Endpoint | Permission and contract |
| --- | --- |
| `GET /api/walk-ins` | Admin/receptionist see the active queue in urgency/arrival order; doctors see their assigned active queue |
| `POST /api/walk-ins` | Admin/receptionist: required `patientName`, `reason`, `urgency`; optional nullable `patientUserId`, `contactPhone` |
| `PATCH /api/walk-ins/:id` | Required `status`; admin/receptionist may also set `urgency`, nullable `doctorId`, or a registered `patientUserId` |
| `DELETE /api/walk-ins/:id` | Admin/receptionist: cancels an unlinked active queue entry, preserving its record and audit |
| `POST /api/walk-ins/:id/consultation` | Assigned doctor: starts or returns the queue entry's linked clinical appointment |

Urgency is `low`, `medium`, `high` or `emergency`. Queue states are `waiting`, `triaged`, `assigned`, `in_progress`, `completed` and `cancelled`. Unassignment uses explicit `doctorId: null`; omitting that field keeps the existing doctor. Assignment/start/completion require an active doctor who is not on approved leave. Doctors cannot change urgency, patient identity or assignment through the queue PATCH route. They can begin assigned entries and complete entries already in progress. A registered patient cannot join the active queue twice.

Front desk can check in a name-only walk-in and later register/link a patient account using `patientUserId`. Clinical consultation requires that linked patient account, an assigned active doctor, and clinic opening hours for the configured appointment duration. It rejects doctor/patient appointment conflicts and approved leave. Success creates an `in_progress`, `in_person` appointment at the current server time, blocks overlapping available slots, saves `walk_ins.appointment_id`, and returns `{ data: { appointmentId, ... } }`. Repeating the request returns the existing appointment ID.

The doctor then records SOAP notes/vitals using that appointment ID, adds prescriptions/lab orders, and completes the appointment. Completion synchronizes the linked queue entry. Once `appointment_id` exists, queue status, doctor and patient changes are rejected with `409`; manage the linked appointment instead. Urgency edits remain available. A linked consultation cannot be physically deleted through the queue endpoint.

## Leave requests

| Endpoint | Permission and contract |
| --- | --- |
| `GET /api/leave-requests` | Doctor sees own requests; admin/receptionist see clinic requests, with doctor name and date-only fields |
| `POST /api/leave-requests` | Active doctor: `startsOn`, `endsOn`, `leaveType`, `reason` |
| `PATCH /api/leave-requests/:id` | Admin: pending request to `approved` or `rejected`; optional nullable `reviewNote` |
| `DELETE /api/leave-requests/:id` | Doctor for own request, or admin: withdraws pending or future approved leave by setting `cancelled` |

Dates use `YYYY-MM-DD` in the clinic timezone. Leave cannot start before today, end before it starts, or overlap the doctor's pending/approved leave. Types are `annual`, `sick`, `emergency` and `personal`. Approval returns `409` until conflicting appointments are cancelled/rescheduled and active walk-ins are reassigned. Approval never silently discards bookings. Approved leave immediately removes affected times from booking and blocks new slot creation during those dates. Decisions create doctor notifications and audit events. Leave records and decisions remain retained after withdrawal.

## Notifications, audit and reports

All notification endpoints operate only on the signed-in account. `GET /api/notifications` returns up to 100 newest notifications; `PATCH /api/notifications/:id/read` marks one read; `POST /api/notifications/read-all` marks unread entries read; `DELETE /api/notifications/:id` physically removes that owned notification.

`GET /api/audit-events` is administrator-only and returns the 250 newest retained audit events (`actor_user_id`, `action`, `entity_type`, `entity_id`, `created_at`). There is no audit-delete endpoint.

`GET /api/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD` is administrator-only. Dates are inclusive in the configured clinic timezone; omitted boundaries default to 30 days ago and today. A reversed range returns `422`. The report returns database-derived integer fields: `appointments`, `completed`, `cancelled`, `no_show`, `pending`, `confirmed`, `in_progress`, `patients_seen`, `active_doctors`, `pending_leave` and `walk_ins`. Appointment, patient-seen and walk-in totals follow the selected date range; active-doctor and pending-leave totals describe current clinic state.

## Real-time synchronization

`GET /api/events` is an authenticated, OTP-protected Server-Sent Events stream with `Content-Type: text/event-stream`. Use a streaming fetch that includes the bearer header. The stream emits invalidation messages, for example `data: {"changed":true,"table":"appointments"}`, rather than record contents or patient data. Database changes trigger clients to reload their role-authorized API views.

The stream sends comment heartbeats every 15 seconds and closes after 60 seconds so reconnecting clients use a fresh access token and recheck access/OTP. The active frontend reconnects, dispatches `clinic:data-changed` after local writes and remote events, and keeps 15-second polling plus focus refresh as fallback. A lost stream does not imply a failed database write. Refresh record data through the API to establish its current state.

## Status codes and limits

| HTTP status | Meaning |
| --- | --- |
| `200`, `201`, `202` | Success, created, or accepted; check endpoint-specific response |
| `400` | Invalid body, identifier or query |
| `401` | Missing/invalid session, or incorrect OTP on the verification route |
| `403` | Role, ownership or inactive-account restriction |
| `404` | Record absent/out of scope, or a state transition no longer permitted |
| `409` | Scheduling overlap, duplicate/conflicting operation, protected history or linked-workflow conflict |
| `410` | OTP challenge expired |
| `413`, `415` | Oversized body or unsupported content type |
| `422` | Validly formatted request violates clinic policy or account requirements |
| `428` | OTP verification required |
| `429` | Request throttle, OTP resend cooldown or exhausted OTP attempts |
| `500`, `502`, `503`, `504` | Unexpected error, email delivery failure, unavailable dependency or request timeout |

Rate limits are per client IP: `/api` permits 1,000 requests per 15 minutes; patient/staff mutation routes additionally permit 20 per 15 minutes, excluding GET/HEAD/OPTIONS; OTP mutations share 20 per 15 minutes, excluding GET status checks; public registration permits ten requests per hour. Non-streaming requests have a 30-second timeout. Deployments should configure trusted proxy hops to preserve the intended client IP.

`GET /healthz` checks database connectivity and returns `status`, `timestamp` and `requestId` (`503` when unavailable). `GET /metrics` exposes process uptime, environment and database connectivity/current time; it is public in the current server configuration.
