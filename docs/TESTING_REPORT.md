# SCCPMS testing report

**Report date:** 17 October 2026 (Africa/Johannesburg)
**Application under review:** the root React/Vite application in `src/` and the Express API in `server/`.
**Status:** the admin overview release is published at application commit `c4a20ca`, and both Vercel projects were verified READY for that exact commit. Its [cloud workflow](https://github.com/LAP777-hub/SCCPMS/actions/runs/38955867246) passed **399 server checks with seven intentional unit-command database skips**, **seven separate real PostgreSQL cases**, **121 browser cases**, builds, typechecks and security checks. **9/9 deployed HTTP checks** and **7/7 live overview/asset/protection checks** passed. Earlier **10/10 live address searches**, **8/8 live desktop/mobile email-wrapper checks** and two delivered Brevo API/Supabase SMTP setup messages remain separate evidence. Migrations 027/028 remain applied; login OTP lifetime is five minutes. Sections 11h–11l preserve release history, failed attempts, corrections and remaining real-user acceptance work.

All valid recipient emails are accepted. The SPU sender plan remains canceled.
Brevo API/SMTP credentials have now been supplied and saved privately. New
provider routing restricts Resend to the bound administrator and uses Brevo for
other roles; local and cloud validation passed.
Brevo's initial HTTP401 IP block was subsequently resolved. Its active sender,
relay and SMTP credentials are verified; Supabase SMTP and live templates are
installed. An API diagnostic and actual Supabase recovery email were accepted
in 634ms/716ms and both reported delivered. Section 11j records this restoration,
the write-only-password checker correction and migration 026. The
bound administrator OTP route remains available; its earlier diagnostic email
was delivered, while a real OTP/login round trip and live clinical acceptance
are still unverified. Earlier failures and corrections remain recorded below.

This report preserves successful checks, failures, skips, warnings and remaining acceptance work. It does not certify that the system is error-free, suitable for unrestricted clinical use, or fully production ready. Earlier applications in `legacy/frontend/` and `legacy/backend/` are outside the active release validation.

## 1. Evidence and test boundaries

| Evidence type | What it establishes | What it does not establish |
| --- | --- | --- |
| Server unit, policy and route regressions | Validation, role policy, error handling, provider request construction and transaction behavior under controlled fixtures | Actual provider delivery, a production user's credentials, or every possible clinical workflow |
| Isolated PostgreSQL suites | Real SQL persistence, migrations, constraints and route behavior in unique temporary schemas; external Auth/provider calls mocked | A production signup or mutation of real patient records |
| Playwright browser regressions | Rendered role flows, callbacks, OTP gates, refresh/reload behavior and registration using mocked Auth/API/provider responses | A received real email, actual university inbox delivery, or a live multi-user clinic session |
| Responsive browser measurements/screenshots | Concrete geometry, scroll access, table readability, menus, logos and dropdown behavior in Chrome at the recorded sizes | Every browser/device, physical handset performance, or a complete accessibility certification |
| Read-only live checks | Runtime health, configured provider-key acceptance, real public address results and hosted redirect destinations | Message delivery or a completed real invitation/confirmation/OTP round trip |
| Configuration changes/migrations | Recorded settings repair and additive schema migration completion | Independent hosted deployment, restore acceptance or production operations approval |

Automated browser/provider tests did not send emails or create live Auth accounts. Database fixtures use temporary schemas and clean them up. Recorded live setup separately included additive migrations, preparing the Resend domain, and repairing Supabase redirect settings; those setup operations are not labelled read-only.

No keys, passwords, OTPs, actual patient records or private provider response payloads are included here.

Artifact availability was checked during the latest connectivity update. The
current connection JSON and browser-run metadata are present. Some earlier
measurement/screenshot/failure folders are no longer present in the workspace;
their historical command results and failure descriptions remain in this report.
Their old paths below are identified as unavailable rather than linked as
currently inspectable evidence.

## 2. Latest completed results

These are completed results available when this report was assembled. Counts from different suites and development milestones must not be added into a single coverage total.

| Check | Completed result | Qualification |
| --- | --- | --- |
| Frontend TypeScript/build | Passed | Latest production frontend build and separate typecheck completed |
| Frontend lint | Passed with zero errors | One existing `react-refresh/only-export-components` warning and an `.eslintignore` deprecation notice remain |
| Server TypeScript/build | Passed | Latest successful TypeScript build also checks API types; separate no-emit typecheck passed at the earlier baseline |
| Latest completed cloud server unit run | **406 total: 399 passed, 7 skipped, 0 failed or cancelled** | Node 22; seven real database cases opt in; final workflow for `c4a20ca`, 59.651s |
| Earlier completed server baseline | **167 total: 165 passed, 2 skipped, 0 failed** | Historical callback baseline; its two separate database suites passed |
| Latest focused trusted Auth checks | **28 passed, 0 skipped, 0 failed** | Rechecked after final diagnostic changes; safe stage/timeout logging, provider bans and transient/permanent auth failures |
| Earlier isolated database command | **2 suites passed** | Clinic workflows and registration persistence; unique temporary schemas cleaned up |
| Latest stable isolated database command | **7/7 passed, 0 skipped, 0 failed or cancelled** | GitHub Linux/PostgreSQL CI for `c4a20ca`, 5.375s; includes the new admin overview aggregate/clinic-date/zero-state checks and existing deletion/history, OTP, profile, ownership and shared-budget cases; earlier failures retained |
| Completed browser baseline | **55 cases verified: 54 passed initially; 1 passed on isolated rerun** | First full command had one timeout; the report does not describe that command as an uninterrupted 55-pass run |
| Main responsive dashboard matrix | **184 views passed** | 30 sections × 6 viewports = 180, plus four landscape overviews; no document overflow or runtime errors |
| Short/mobile/landscape drawers | **12 checks passed** | Four roles × three sizes; final navigation item and Sign Out reachable; logos loaded |
| Authentication responsiveness | **12 views passed** | Login and registration × six viewports; no document overflow; all visible controls reachable by vertical scrolling |
| Registration popups | **2 mobile sizes passed** | Programme and mocked address suggestions remain inside 320/390px widths and select the expected values |
| Final table/menu follow-up | **25 checks passed** | 12 patient and 12 doctor table views plus one settled receptionist drawer check |
| Latest invitation modal/menu checks | Passed | 320×640 modal and all four menu ARIA states; see section 6 |
| Final circular auth logo check | **4 browser views passed** | Login/registration at 320×640 and 1366×768; loaded 50% border radius, square 104/156px geometry, no overflow or runtime errors |
| Earlier runtime smoke | Passed at that milestone | API/database health 200, frontend 200, unauthenticated protected API 401; superseded by the current connection incident below |
| Deployed runtime connectivity | **9/9 live HTTP checks passed** | Frontend/API/database health 200; invitation callback, protected GET/POST/PUT rejection, production CORS and JSON404; campus-network failures remain historical/local evidence in sections 11b/11d |
| Live Kimberley address/residence searches | **10/10 passed** | Real Long Street/New Park coordinates plus eight catalogue/alias results; catalogue-only names retain null coordinates and manual entry |
| Deployed admin overview checks | **7/7 passed** | Correct production API origin, header/search, separate overview bundle, empty/unavailable states, unauthenticated denial and production CORS |
| Hosted development redirect routing | Passed | Saved/read back 5173; default/signup/invite/recovery HTTP 303 probes resolve to the development frontend |
| Resend key/domain API | Passed key acceptance | Authenticated read-only domain lookup succeeded; this is not delivery acceptance |
| Former university sending domain | **Canceled; historical setup only** | `clinic.spu.ac.za` was prepared but unverified; the active verified Brevo sender now supports general delivery |
| Real API and Supabase SMTP delivery | **Both reported delivered** | Confirmed owner diagnostic and recovery email only; accepts in 634ms/716ms; recipient signup, invitation completion and OTP entry remain unverified |
| Live email-wrapper responsiveness | **8/8 passed** | Desktop/mobile signup, invitation, recovery and foreign-origin rejection; no overflow, runtime errors, verification requests or mutations |
| Focused browser suspension run | **5/5 passed on rerun** | Initial 3 pass/2 fail retained in chronology; successful rerun 8.8s |
| Earlier account-release browser attempt | **67 total: 59 passed, 8 failed initially** | 1.8 minutes; two outdated disabled-account callback expectations and six ambiguous Patients-heading selectors; original failures retained |
| Latest focused browser correction | **9/9 passed in 11.6s** | Two callbacks plus all seven deletion cases; includes one deletion case already passed initially |
| Earlier account-release distinct browser cases | **67 verified** | 59 initial passes plus eight corrected failures; that milestone was not an uninterrupted 67-pass full command |
| Latest full browser run | **121 passed, 0 failed** | GitHub Linux CI for `c4a20ca`, 1.9 minutes; reference overview, actual15-second polling, quick actions/search, preserved forms, responsive layout and all previous role/session/email/photo cases |
| Added sign-in profile race checks | **2/2 passed** | Focused run after adding old403/mismatched-profile cases; 79 distinct current browser cases verified across the complete77 and focused2 commands |
| Focused password visibility | **6 passed** | Independent masking, keyboard controls, values/FormData, validation, busy state and chosen passwords; exact accessible names strengthened for the final full run |
| Fixed-pane and readable-text matrix | **128 views passed** | 28 authentication views and 100 dashboard views; 35 keyboard toggles and seven programme/address popup scenarios passed |
| Migration 019 | **Applied and read-only metadata verified** | CLI exited 0; all four required columns and two deletion constraints confirmed; no existing account was deleted |

## 3. Coverage against the requested clinic features

| Feature | Exercised evidence | Remaining practical acceptance |
| --- | --- | --- |
| Admin/doctor/patient/receptionist login and assigned dashboard | Four-role mocked browser OTP/reload checks; server trusted role/confirmation/account guards | Real authorized users must receive and enter their own OTPs; any valid email domain is accepted |
| Student/staff self-registration | Mailbox/identity/catalogue/address validation; actual registration handler in a private SQL schema; browser payload/selection checks | Real confirmation delivery and institution-approved enrolment/identity process |
| Admin-created doctor/receptionist accounts | Role-protected invitation callback/provider-contract tests; recipient password setup and OTP gates under mocks | Invitation delivered to the intended real recipient |
| Account suspension/deletion, Records and reinvitation | Active-account denial/compensation, provider-ban and all-role deletion/history checks; Records contacts/reinvite UI; safe fresh-identity provisioning; applied migrations 019/024/025 | No live user was deleted to prove the fixture; actual reinvitation delivery and operational acceptance remain outstanding |
| Booking/cancellation/rescheduling | Role policy and real private-schema slot/appointment state/ownership/conflict checks | Real operators exercise end-to-end use after deployment/provider setup |
| Availability/leave/closures | Timezone/hours/holiday policies, SQL constraints, booked-care conflict and approved-leave exclusion checks | Institution reviews actual timezone, hours, holidays and booking notice settings |
| Doctor SOAP/vitals/prescriptions/labs | Validation fixtures and isolated clinician-owned clinical persistence/corrections where asserted | Clinical documentation and released-result workflows accepted by responsible clinicians |
| Patient health records | Assigned/own-record ownership checks and mocked records dashboard | Real authorized-patient record release and access acceptance |
| Reception patient intake/walk-ins | Active-patient serialization tests and real private-schema linkage/assigned consultation checks | Front desk accepts actual intake/queue process with authorized accounts |
| Notifications and refresh | Persisted appointment/account/invitation-acceptance notices, event shutdown tests, separate admin/doctor/patient browser sessions with mocked streams and polling fallback | Live multi-user authorized SSE/reconnection/notification acceptance is not proven by mocked browser traffic |
| Reports/analytics | Real isolated zero-data analytics, read-only production aggregation consistency, date-range validation and browser checks for charts, zero states, retained filters and readable mobile plots | Actual operated clinic counts must be reconciled; fixtures are never presented as production analytics |
| Audit/history preservation | Isolated audit rows/pagination and transaction/record history checks | Hosted retention, backup/restore and institutional access policy acceptance |

## 4. Chronological failure, fix and rerun record

Stages follow the work sequence. Exact timestamps were not retained for every earlier run; dates are supplied where the available record establishes them.

| Stage/date | Failure or observed limitation | Change or response | Recorded verification/outcome |
| --- | --- | --- | --- |
| Initial project assessment | User reported login returning to the login page in less than a second, with the designated role dashboard not loading; only the administrator existed initially | Active frontend/API paths, trusted roles, session restoration and OTP/database binding reviewed and repaired | Subsequent four-role browser regressions establish the repaired application behavior with mocked accounts; real school-inbox acceptance remains outstanding |
| Scheduling/clinical implementation | Slot concurrency, account activity checks, clinical ownership/corrections and walk-in linkage needed protection | Transaction/policy/ownership guards, recorded clinical revisions, active-patient serialization and related audit behavior added | Focused policy/route tests and the isolated clinic workflow suite passed; production clinical accounts were not populated for this test |
| Deployment/cleanup review | Runtime lacked a complete graceful shutdown/migration path; CI used an incompatible Node version and misleading deployment placeholders | HTTP/stream/database drain, native migration runner, Node 22 CI, enforced lint, isolated DB/browser steps and actual frontend build arguments added | Focused shutdown/migration tests passed; JavaScript/YAML/Compose checks completed; no GitHub workflow or hosted publishing run recorded |
| Email OTP configuration | Earlier SMS configuration was unsuitable for the requested email channel; the supplied key CSV initially contained only a masked token | Active configuration changed to Resend email; masked tokens rejected; full key later stored only in ignored server configuration | Early email milestone: 109 passing server tests with one intentional DB skip, isolated DB 1/1 and 22 browser passes were reported; counts are historical |
| Resend readiness | Missing/invalid credentials and default test sender cannot provide university-wide delivery | Safe unavailable/delivery errors, trusted email binding, persistent rate limits and a read-only domain checker implemented | Later recorded email milestone: 132 server passes/one opt-in DB skip, isolated DB 1/1 and 30 browser passes; 25 mocked readiness cases and eight environment scenarios passed |
| Manual logout/session policy | Transient provider/API failures could invalidate a valid session; separate dashboard verification expiry conflicted with the requested manual-logout policy | Retryable Auth/provider/profile failures become 503; shared token renewal and stale-response guards added; session-bound verification retained until logout | Focused Auth tests, browser idle/refresh/reload scenarios and isolated DB verification after 13 hours passed |
| Registration UI integration, 13 October | First 37-case browser run had 28 passes and nine registration failures waiting for exact Department selection | Native select's nested label included option text; explicit `htmlFor`/`id` and a separate label restored the accessible Department name | Later 39-case browser milestone passed; registration/server/database checks passed as recorded in readiness notes |
| Registration data, 13 October | Academic selection, required student residential address, real suggestions and existing-trigger profile persistence needed coverage | Faculty/programme validation, address coordinate/source persistence, stale-selection clearing and manual fallback added | Recorded registration milestone: 151 server passes with two intentional DB skips, both isolated DB suites passed and 39 browser cases passed |
| Faculty correction, 13 October | Natural and Applied Sciences had the retired incoming code `NURS` | Canonical code corrected to `NAS`; migration 018 maps historical patient faculty values and preserves clinical doctor/receptionist departments | Focused validation/browser checks passed; isolated migration assertions cover patient mapping, unchanged doctor department and idempotent reapplication |
| Email callback review, 13 October | URL markers/stale codes could be confused with setup intent; consumed invitations could be lost on temporary profile lookup failure | Successful callback credentials and trusted account/session checks required; unfinished setup stored per user/session and revalidated on reload | Full 53-case browser milestone and final 30-case callback/session subset passed |
| Stale callback rejection | A delayed rejection from an old callback could sign out a newer account | Same-session guard added before callback failure state changes/sign-out | Regression holds an old 403, completes a newer doctor login/OTP step, releases the old response and confirms session/reload survival |
| Callback retry classification | Server profile-query errors returned 403 and discarded recoverable setup; final SDK session refresh errors could return silently | Temporary profile query/network errors separated into safe 503; final refresh error enters the retained-intent retry path | Focused profile/provider tests passed; missing profile, invalid trusted role and disabled accounts remain denied |
| Hosted redirect review, 13 October | Hosted Supabase project default still pointed at port 3000 even though explicit 5173 callbacks were accepted | Hosted Site URL/allow-list repaired with existing entries retained; management readback and independent invalid-token redirect probes performed | Default, signup, invite and recovery now return HTTP 303 to `http://localhost:5173`; no real email/token consumed |
| Responsive baseline, 13 October | Admin mobile documents expanded to 399–646px; doctor overview/appointments to 649px; patient My Appointments to 755px mobile, 779px at 768 and 1039px at 1024 | Main/container intrinsic widths constrained; responsive grids/toolbars/forms and internal table scrolling added | Final 184-view matrix has zero document overflow/runtime errors; receptionist baseline already contained document width |
| Initial ignored visual-harness attempts | A viewport-change attempt timed out on an offscreen Overview item; another waited for exact Notifications even though its unread badge changed the accessible name | Harness opens the drawer from its explicit open state, waits for the transition, and permits the notification-count suffix | Completed baseline 180 and final 184 view matrices; these were harness navigation/selector failures, not established application runtime exceptions |
| Toolbar/avatar review | Receptionist 35px toolbar buttons wrapped labels over the next row; mobile admin rule hid the avatar together with profile text | Toolbar controls sized for content/touch access; avatar/text selectors separated | Final screenshots and geometry confirm contained headers and visible avatars |
| Short-screen menus | Large logos/nav items could compete with Sign Out; offscreen drawers remained a keyboard concern | Independent nav scrolling, larger logos, hidden closed drawers and `aria-expanded`/`aria-controls` added | All 12 drawer sizes reach final item/Sign Out; all four menu targets and false→true→false states verified |
| Closed drawer transition measurement | Early 300ms receptionist snapshots briefly counted inherited visibility transitions while the drawer closed | Final follow-up checks the settled drawer rather than treating an animation snapshot as a steady-state failure | Final 25-check artifact reports zero receptionist hidden focus targets; earlier raw snapshots are retained |
| Invitation modal | At 320px role toggles needed wrapping and the modal needed bounded safe-area height | Wrapping role buttons, minimum control sizes and safe-area-subtracted scroll height applied | At 320×640 modal is 288×608 at x/y=16; all ten controls reachable, no horizontal overflow |
| Patient/doctor table readability | A contained 620px patient table still squeezed a long name into narrow fragments | Patient table/identity/avatar/date/consultation columns and doctor identity columns given adequate intrinsic space; scrolling retained inside panel | Final 24 table views have readable name widths approximately 161–276px and reachable last columns at all six sizes |
| Final 55-case browser command | One registration manual-address case timed out selecting the Accounting programme; 54 others passed | The single case rerun separately, preserving the first failure record | Isolated rerun passed in about 1.9s; no application defect established from this timeout |
| Environment during that run | Two independent PowerShell helper launches failed CLR startup with HRESULT `0x80004005` | Concurrent Chrome work stopped; subsequent checks used one browser/context at a time | Existing browser checks completed; isolated rerun passed. Resource pressure was suspected, not proven as the timeout cause |
| New account suspension/deletion coverage | Focused current account-access cases requested after the prior baseline | Explicit provider banned-account denial and new account/browser regressions added | Focused trusted Auth: 27/27 passed; latest full server and browser correction results recorded below |
| New focused suspension browser run | First five-case run: three passed and two failed; one fixture lacked exposed provider version/CORS headers, and production behavior lost retryable profile-503 guidance during a late OTP status response | Corrected fixture header exposure and preserved profile-error state in the application | All five passed on rerun in 8.8s; included in the current 67 distinct browser cases |
| Latest deletion/server verification | New patient-login deletion adds reservation/provider/finalization and retry/concurrency failure paths | Twenty policy/transaction/listing regressions and a private SQL deletion suite added | Full server: 191 total/188 pass/3 opt-in DB skips/zero failures in 55.7s. Final isolated command: 3/3 pass, zero skips/failures, 139.5s; deletion 21.9s and registration 11.6s individually reported |
| First full 67-case account-release browser attempt | 59 passed/eight failed in 1.8 minutes: two prior callback tests expected a generic link error despite the newly required disabled-account message/mailto; six deletion tests matched both topbar h2 and page h1 titled Patients and stopped before feature interaction | Updated callback expectations while retaining no-signup/no-setup safety assertions and mailto verification; scoped Patients headings to level 1 | No application change for these eight assertion/fixture corrections. Focused rerun passed 9/9 in 11.6s, including one earlier pass; all 67 distinct cases now verified; original failure artifacts retained separately |
| Migration 019 live setup | New patient-login deletion requires reservation/deletion/history fields and constraints | Applied the additive tracked migration using the existing CLI | CLI exited 0; read-only live metadata confirms all four required columns and two constraints; no existing account was deleted during acceptance |
| Final runtime/branding acceptance | Latest compiled application and circular logo needed a final smoke check | Read-only runtime/DB metadata and four mocked browser logo views checked | API/database health 200, development frontend 5173 HTTP 200, unauthenticated protected patients 401; four loaded circular logos with contained square 104/156px geometry and zero overflow/runtime errors |

An expected negative assertion inside a passing test is not a test failure. Wrong/expired/replayed OTPs, rejected roles, account bans, invalid coordinates and scheduling conflicts deliberately return denial/conflict statuses in the fixtures.

## 5. Isolated database coverage

The normal server command deliberately skips:

- `registration-database.test.ts`
- `workflows.integration.test.ts`
- `account-deletion-database.test.ts`

`npm run test:database --prefix server` enables all three through `RUN_DATABASE_TESTS=1` and launches each file in its own process. Suites allocate unique validated temporary schema names, select their schema explicitly and clean it up. They do not create production Auth accounts. The latest command passed all three in 139.5s with zero skips/failures and completed every temporary-schema cleanup.

The workflow suite exercises actual route handlers and SQL persistence for zero analytics, session/email OTP binding and replay denial, manual logout of only the authenticated session, audit pagination with identical timestamps, availability/booking/rescheduling/status transitions, overlap/conflict policy, clinic closures, approved leave and walk-in/clinical ownership. Clinical record corrections/revisions and notifications/audits are covered where asserted by that suite.

The registration suite invokes the actual signup handler while simulating Auth/profile-provider calls into its private database. It verifies trigger-created profile completion, exact faculty/programme persistence, selected/manual addresses, coordinate bounds/pairs/source constraints, audit rows, preservation of existing rows, and the NAS migration's patient-only mapping/idempotence.

The new deletion suite exercises real SQL migration 019 idempotence, deletion
reservation, prevention of account reactivation, email archiving/finalization,
rollback/retry after provider and SQL failures, unchanged clinical history,
reuse of the original email for a fresh account, idempotent audit behavior and
cleanup targeted to that user's OTP state. Auth deletion is simulated; no live
user is removed by this suite.

Some files with names such as `integration.test.ts`, `appointments.test.ts` and `clinical.test.ts` contain controlled validation/serialization/policy fixtures. Their names alone must not be read as full live integration or clinical acceptance. Real SQL coverage is the separate isolated database evidence described above.

## 6. Browser and visual coverage

### Viewports

| Class | Viewport |
| --- | --- |
| Small mobile | 320×640 |
| Mobile | 390×844 |
| Tablet portrait | 768×1024 |
| Tablet/small desktop | 1024×768 |
| Desktop | 1366×768 |
| Large desktop | 1920×1080 |
| Short landscape drawer | 844×390 |

The 180 standard dashboard views cover:

- Admin: Overview, Doctors & Staff, Patients, Appointments, Availability & Settings, Reports, Leave Requests, Audit Log, Notifications.
- Doctor: Overview, Appointments, Clinical Records, Assigned Walk-ins, My Availability, Leave Requests, Notifications.
- Patient: Dashboard, Book Appointment, My Appointments, Available Doctors, Health Records, My Profile, Notifications.
- Receptionist: Overview, Doctor Schedules, Appointments, Patients & Registration, Doctors, Walk-in Queue, Notifications.

Four additional landscape overviews produce the 184-view total. Visible data is synthetic, including deliberately long person/doctor names, appointments, notifications, leave and walk-in records. Authentication, provider and API traffic is fulfilled locally; only local frontend assets are allowed through. No OTP is sent.

Measurements verify document width against the viewport. Wide clinical/appointment tables scroll inside their panels; internal table scrolling is intentional and is not counted as page overflow. Final table checks additionally scroll to the last column and verify adequate name width.

Drawer tests cover four roles at 320×640, 390×844 and 844×390. Sidebar logos load at 136px on short screens and 152px on tall screens; navigation scrolls independently. Closed drawer checks use settled visibility. Toggle buttons identify their sidebar and report the correct expanded state.

Authentication tests cover login/registration at all six standard sizes. All ten/twelve visible controls are reachable by ordinary vertical scrolling. The loaded login logo measures 104/112/144/156/156/208px across the six sizes; the campus background is visible in inspected mobile/desktop screenshots. The final four-view circular-logo check separately verifies login/registration at 320×640 and 1366×768: loaded images, 50% border radius, square 104/156px geometry, zero document overflow and no runtime errors.

At 320/390px, the programme popup selects Accounting for EMS. Mocked Photon address suggestions select Long Street/New Park and remain within the viewport. These are visual/provider simulations, separate from the real public address checks.

### Artifact history

Artifacts are local, ignored by Git, and may be removed by a later Playwright command. They are not permanent published release evidence:

- Main responsive measurements: 184 dashboard views, 12 auth views, 12 drawers and mobile dropdown results. Historical path `test-results/responsive-final/measurements.json` is currently unavailable.
- Menu/modal measurements: all four ARIA checks, invitation modal and earlier transition snapshots. Historical path `test-results/responsive-final/modal-menu-measurements.json` is currently unavailable.
- Final readable table/menu measurements: 25 final checks superseding the earlier table/settled-menu observations. Historical path `test-results/responsive-tables-final/measurements.json` is currently unavailable.
- Final circular auth logo measurements: four final mobile/desktop login/registration views and logo screenshots. Historical path `test-results/rounded-auth-logo/measurements.json` is currently unavailable.
- Original manual-address timeout: the initial failed browser case. Historical path `test-results/registration-unavailable-a-aa9b8--manual-residential-address/error-context.md` is currently unavailable.
- `test-results/.last-run.json` retains the first failed full-run status. The successful single-case rerun used a separate output directory; a stale failed summary is not overwritten to pretend the first run passed.
- `test-results/ui-account-release/` retains the eight first-attempt account-release failures. Corrections run separately under `test-results/ui-account-corrections/`; these are not relabelled as application bugs or erased.
- Screenshots in `test-results/responsive-final/` and `test-results/responsive-tables-final/` include mobile/desktop dashboards, drawers, login/registration, both popups and invitation modal top/bottom.

## 7. Live checks and provider limitations

### Account deletion and retained clinical identity

The current account-change work distinguishes reversible suspension from deletion
of a login identity. Supabase documents `deleteUser(id, true)` as privileged,
server-only Auth soft deletion that cannot be reversed. This must not be described
as a temporary suspension. [Supabase deleteUser reference](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser).

The existing profile foreign key cascades when its Auth user row is hard-deleted.
The new patient-login deletion path therefore uses Auth soft deletion while preserving the
profile UUID and clinical/audit history, recording deletion markers, filtering
deleted accounts from operational user lists, and freeing the profile email with
a UUID-based tombstone plus a protected `deleted_email` archive. A later signup
with that email receives a fresh account identity; this is not an automatic merge
of historical patient records into the new account. Server deletion-policy and
isolated SQL regressions pass. All seven deletion UI cases passed in the focused
correction run, the full isolated database command passed 3/3, and migration 019
was applied successfully to the configured application database. Read-only live
metadata confirms all four required columns and two deletion constraints. No
existing account was deleted during these checks.

### Established

- Earlier API/database health returned HTTP 200. The current check returns HTTP 503 with a database dependency; the frontend still returns HTTP 200 and protected routes reject unauthenticated requests. See section 11b for the live connection blocker.
- The full Resend key was accepted by the read-only domain API. It is held only in ignored configuration, not in the browser.
- Real Photon and application address queries for Long Street, New Park and Bultfontein Road returned Kimberley/Northern Cape OSM features/coordinates. This requires no GPS permission or map key.
- Hosted Supabase URL configuration was saved/read back on 13 October. Default/signup/invite/recovery probes using deliberately invalid tokens returned HTTP 303 to port 5173. An independent fresh invalid-token default probe agreed.
- Additive migrations 015/016/017/018/019 were reported applied successfully for email binding, manual logout, registration coordinates, NAS correction and patient-login deletion/history retention. No destructive database reset or existing-account deletion is recorded.

### Outstanding

1. University IT must approve/publish the actual records in [RESEND_UNIVERSITY_DNS.md](../RESEND_UNIVERSITY_DNS.md), and `clinic.spu.ac.za` must verify.
2. The active development sender remains the owner-only Resend test sender. A verified university sender such as `SCCPMS <login@clinic.spu.ac.za>` must be configured before university recipients are accepted.
3. An authorized university user must actually receive an OTP and use that message's code to open the assigned dashboard. Wrong/expired/replayed codes and resend behavior must then be accepted with the real channel.
4. Supabase Auth invitations, email confirmation and password recovery require their own SMTP/template/redirect acceptance. Setting application OTP credentials does not establish Auth SMTP delivery.
5. Localhost points to the email recipient's device. Production/mobile users need a reachable HTTPS frontend and matching API/Auth origins, not the developer machine's localhost.
6. Hosting HTTPS, database TLS, monitoring, backup/restore acceptance, operational/security review and sustained provider capacity remain deployment gates.
7. The public Photon demo has no availability guarantee. A dedicated endpoint/shared quota is needed for sustained deployment; manual addresses remain available during outages.
8. Restore PostgreSQL connectivity from the API computer on transaction port 6543 and session port 5432, require health 200, and complete real authorized login acceptance. Supabase HTTPS responding does not establish PostgreSQL TCP access.

A successful provider domain lookup or invalid-token redirect probe does not establish inbox delivery. No real confirmation, invitation, recovery or OTP email round trip was accepted during the checks summarized here.

## 8. Commands and scripts

Commands below are an inventory/reproduction guide, not a statement that every command ran in the latest session. Provider/production settings require their configured environment; do not run setup/migration/deployment commands merely to reproduce read-only tests.

| Command/script | Purpose | Recorded execution |
| --- | --- | --- |
| `npm run typecheck` | Frontend TypeScript checks | Passed |
| `npm run build` | Production Vite build | Passed |
| `npm run lint` | Active frontend/config/browser-test lint | Zero errors; one existing Fast Refresh warning plus `.eslintignore` deprecation notice |
| `npm run typecheck --prefix server` | API TypeScript checks | Earlier no-emit command passed; latest successful TypeScript build also checks API types |
| `npm run build --prefix server` | Compile/typecheck API | Latest build passed |
| `npm test --prefix server` | Node test runner, all `server/tests/*.test.ts`, concurrency 1 | Latest CI: 307 total, 301 passed/six deliberate DB skips/zero failures |
| `npm run test:database --prefix server` | Opt-in isolated workflow/registration/deletion/serverless suites | Latest CI: 5/5 passed, zero skips/failures, 2.704s; local network failures remain documented |
| `node --import tsx --test tests/trusted-auth.test.ts` from `server/` | Focused trusted Auth/provider/profile/ban behavior and safe timeout diagnostics | Latest 28/28 passed |
| `npm --prefix server run connections:check` | Local frontend/API/CORS and upstream Auth/PostgreSQL connection checks; no messages/account changes | Expected exit 1 while database ports are unreachable; stable health 503 recorded |
| `npm run test:ui` | Chrome Playwright browser regression suite against preview 5178 | First 55-case attempt: 54 pass/one timeout |
| Latest full 67-case account-release Playwright command | Existing 55 plus seven patient-deletion and five suspension regressions | First attempt: 59 passed/eight assertion/fixture failures retained |
| Focused account-release correction command | Two disabled-account callbacks plus all seven deletion cases; separate output directory | 9/9 passed in 11.6s; all 67 distinct current browser cases verified across runs |
| Focused suspension Playwright command | Five provider/account suspension, invalid-credential and restoration/retry cases | First 3/5 passed; after fixture/application fixes 5/5 passed in 8.8s |
| `npx --no-install playwright test tests/ui/registration.spec.ts -g "unavailable address search" --output test-results-ui-review` | Isolated manual-address timeout rerun | One passed, about 1.9s |
| `node test-results/visual-review.mjs` | Ignored one-browser responsive matrix/auth/drawer/popup script | 184 dashboard + 12 auth + 12 drawer checks completed |
| `node test-results/modal-menu-review.mjs` | Ignored invitation modal and four menu state/target checks | Passed final geometry/ARIA; raw early visibility snapshots retained |
| `node test-results/table-final-review.mjs` | Ignored readable patient/doctor table and settled receptionist menu checks | 25 passed |
| `npm run env:validate` | Active environment/config shape and production constraints | Recorded pass; eight mocked environment scenarios also passed |
| `npm run email:check --prefix server` | Authenticated read-only Resend domain lookup, no mail | Key/domain lookup accepted |
| `npm run email:check --prefix server -- --production` | Exact production sender/domain/sending-capability acceptance | University verified-domain gate remains incomplete |
| `npm run auth:check-redirects --prefix server` | Read-only hosted default/action redirect probes | Passed after hosted repair |
| `npm run auth:configure-redirects --prefix server` | Mutating hosted Site URL/allow-list helper, preserves existing entries/readback | Authorized hosted repair completed; not a read-only test |
| `npm run email:prepare-university --prefix server` | Prepare domain/tracking/TLS handoff; does not publish DNS/send mail | Pending university domain prepared |
| `npm run db:migrate --prefix server` | Apply actual tracked migrations transactionally | Recorded additive migration setup passed; do not treat as a unit test |
| `npm run auth:sync-claims --prefix server` | Repair server-managed account claims | Available maintenance script; no latest-run pass claimed |
| `node scripts/audit-connected-databases.mjs` | Check configured application/DB project consistency without printing secrets | Available; no new execution claimed in this report |
| `node scripts/check-realtime.mjs` | Session connection LISTEN/NOTIFY connection check | Available; no independent latest live multi-user SSE acceptance claimed |
| `npm run security:audit` | Basic configuration/dependency/permission audit | Available; not a penetration test; no new complete security certification claimed |
| `npm run performance:test` | Endpoint timing script | Available; no production load/scale acceptance result recorded |
| `docker compose config`, checker syntax and workflow inspection | Static deployment/configuration validation | Recorded syntax/YAML/Compose checks passed |
| GitHub CI workflow / hosted Vercel deployment | Remote pipeline and release execution | Backend/security CI pass and frontend deploy READY; initial failures and current release checks in section 11d; Docker publishing is optional/manual |
| `sms:check` / `sms:configure` | Historical SMS helpers | Retained; not required by the active email OTP runtime |

Use one browser at a time when local resources are constrained. Playwright's default output directory can remove earlier ignored review scripts/artifacts; use a separate `--output` when preserving evidence.

## 9. Release acceptance gates

| Gate | Status |
| --- | --- |
| Latest application builds/typechecks | Pass; latest server TypeScript build checks API types |
| Latest unit/policy/route regressions | Pass: 301/six explicit opt-in DB skips/zero failures on Node22 |
| Real isolated database regressions | Latest stable CI 5/5 passed; intermittent local connection-reset attempts remain recorded; temporary schemas cleaned |
| Browser behavior and responsive acceptance under mocks | Latest full 95-test run passed; 128 earlier fixed-pane/readable-text views passed; prior failures retained |
| New deletion/suspension final verification | Server and database pass; all 67 distinct browser cases verified through initial/focused correction runs; first full-command failures retained |
| Deletion migration 019 on configured application database | Applied; four columns/two constraints verified read-only; no existing account deleted |
| Current live API/database health | Pass: deployed API `/healthz`200 with verified database TLS; campus-network failures remain separately recorded |
| Circular-logo visual smoke | Four actual production desktop/mobile login/register views pass; loaded 172.8px/120px logos and no viewport overflow/runtime errors |
| Hosted Auth redirect routing | Pass: production default/signup/invite/recovery redirects 4/4; prior local allow-list entries preserved |
| University sender DNS/custom-domain verification | Blocked pending university IT/provider verification |
| Received university OTP, invitation, confirmation and recovery acceptance | Pending |
| Hosted HTTPS/production origin/API routing and database TLS acceptance | Pass: both production deployments READY, frontend calls the deployed API; protected GET/POST 401, CORS 204, unknown-route JSON 404 |
| Monitoring, backup/restore, real concurrent user/load and institutional clinical/privacy acceptance | Not established by this report |

The current results support continued development and a reviewable demonstration using the stated fixtures. A sale/pilot/live university rollout must complete the outstanding provider and deployment gates; passing tests does not justify a 100% production-readiness claim.

## 10. Source test inventory

The inventory below is read from the active test source files. It includes the actual named tests and describe-group headings. Template/variable titles represent parameterized cases, not one literal execution each; describe headings are not tests. Executed totals come from the run summaries above. Four opt-in database files now provide five cases, including the two serverless integration cases added in section 11c. Earlier inventories retain their historical case counts.

### [server/tests/account-deletion-database.test.ts](../server/tests/account-deletion-database.test.ts)

Opt-in real private-schema migration 019, reservation/retry, finalization rollback, retained clinical history, original-email reuse, idempotent audits and targeted OTP cleanup. Passed in the final three-suite command.

- patient deletion preserves database history, safely retries and frees the original email in an isolated schema

### [server/tests/account-updates.test.ts](../server/tests/account-updates.test.ts)

Account/provider rollback and clinic transaction compensation.

- failed account archive restores provider phone, profile and ban while rolling back clinic changes

### [server/tests/address-search.test.ts](../server/tests/address-search.test.ts)

Realistic Photon result parsing, geographic bounds, caching/coalescing, request cadence and safe manual fallback.

- Photon returns actual address parts, coordinates and OSM identifiers with New Park first
- addresses reject out-of-area/country and malformed results without fabricating replacements
- private accommodation results remain available and repeated address parts are deduplicated
- shared autocomplete caches equivalent queries and coalesces concurrent requests
- provider requests set South African bounds and a New Park location bias
- provider errors and invalid responses produce a safe manual-entry fallback
- autocomplete starts provider requests at the configured global interval

### [server/tests/appointment-policy.test.ts](../server/tests/appointment-policy.test.ts)

Role transition policy and timezone/hours/holiday constraints.

- patients can cancel their own pending appointment only
- doctor status changes follow the visit lifecycle
- reception staff and admins can confirm pending and cancel active bookings
- clinic hours use the configured timezone and reject past dates and holidays

### [server/tests/appointments.test.ts](../server/tests/appointments.test.ts)

Legacy controlled appointment validation/policy fixtures.

- **Group:** Appointment Policy
- **Group:** allowedPreviousAppointmentStatuses
- should return correct transitions for patient role
- should return empty array for invalid transitions
- **Group:** Appointment Validation
- should validate appointment time slots
- should prevent overlapping appointments

### [server/tests/auth-callbacks.test.ts](../server/tests/auth-callbacks.test.ts)

Server signup/invitation callback URLs and actual provider request redirect parameters.

- auth callbacks distinguish signup, invitation and recovery at the configured frontend origin
- signup passes its confirmation callback through the actual Supabase HTTP redirect_to parameter
- ${role} invitation carries the setup callback and leaves password selection to the invited user _(parameterized title)_
- admin-created patient invitations use the same password setup callback
- administrators cannot supply a password while inviting staff
- local Supabase settings allow the explicit development callbacks on port 5173

### [server/tests/auth-redirect-settings.test.ts](../server/tests/auth-redirect-settings.test.ts)

Hosted settings merge/credential guard and safe redirect probe behavior.

- hosted URL repair preserves existing allowed URLs and changes only redirect settings
- missing management credentials cannot attempt a hosted settings mutation
- safe redirect probes distinguish the wrong project default from accepted callbacks

### [server/tests/auth.test.ts](../server/tests/auth.test.ts)

Authorization-header and role middleware denial fixtures.

- **Group:** Authentication Middleware
- **Group:** requireAuth
- should reject requests without authorization header
- should reject requests with invalid token format
- **Group:** allowRoles
- should allow requests with matching role
- should reject requests without matching role
- should reject requests without auth context

### [server/tests/clinical.test.ts](../server/tests/clinical.test.ts)

Controlled clinical/vitals/prescription/lab/walk-in/leave validation fixtures.

- **Group:** Clinical Workflows
- **Group:** Patient Visit Validation
- should validate required visit fields
- should validate vital signs ranges
- **Group:** Prescription Validation
- should validate required prescription fields
- should validate field length constraints
- **Group:** Lab Order Validation
- should validate required lab order fields
- should validate lab order status transitions
- **Group:** Walk-in Validation
- should validate required walk-in fields
- should validate urgency levels
- **Group:** Leave Request Validation
- should validate leave request dates
- should validate leave types

### [server/tests/events-shutdown.test.ts](../server/tests/events-shutdown.test.ts)

Event listener shutdown, pending connection release and rejection of new streams.

- event shutdown releases pending listener once and rejects new streams

### [server/tests/integration.test.ts](../server/tests/integration.test.ts)

Controlled pool/response/serialization/error/performance/security fixtures; not a full live application run.

- **Group:** Integration Tests
- **Group:** Database Connection
- should handle connection pool management
- should handle connection timeout
- **Group:** API Response Format
- should validate success response format
- should validate error response format
- should handle pagination response format
- **Group:** Data Serialization
- should handle date serialization
- should handle UUID validation
- should handle phone number validation
- **Group:** Error Handling
- should handle timeout errors
- should handle connection errors
- should handle validation errors
- **Group:** Performance
- should measure response time
- should handle concurrent requests
- **Group:** Security
- rejects malformed tokens and requires a session-bound UUID claim
- should sanitize user input
- should validate rate limit headers

### [server/tests/lifecycle.test.ts](../server/tests/lifecycle.test.ts)

HTTP/stream/database shutdown ordering and failure cleanup.

- shutdown completes pending HTTP work before closing database access
- a streaming cleanup failure still drains HTTP and closes database access

### [server/tests/migrations.test.ts](../server/tests/migrations.test.ts)

Migration SQL failure rollback and client release.

- production migration runner rolls back failed SQL and releases its database client

### [server/tests/otp-delivery.test.ts](../server/tests/otp-delivery.test.ts)

Resend request/response contract, safe failure, binding, persistence, rate limits and concurrency.

- email OTP uses Resend and retains its accepted message reference
- 'email provider rejects ' + name _(parameterized title)_
- 'email provider HTTP ' + status + ' produces a safe ' + reason + ' error' _(parameterized title)_
- missing credentials, test sender and malformed email fail before any provider call
- email normalization and masking preserve one destination and reject injected sender headers
- 'provider ' + name + ' does not leak its request, destination, key or code' _(parameterized title)_
- resend cooldown applies across login sessions and sends no second email
- persisted hourly email cap prevents repeated sends despite new sessions or server restart
- OTP send saves its email binding and accepted reference and ignores a recipient override
- missing email configuration returns an actionable safe unavailable response
- database connection failures return a safe unavailable response for send and verify
- provider rejection remains safe when failed-challenge cleanup also loses the database
- an old email verification cannot restore or authorize a changed email
- a phone-only change leaves email OTP restoration and authorization valid
- OTP hashes bind the account, auth session and normalized email destination
- concurrent requests from two sessions share the account lock and send only one email

### [server/tests/otp-flow.test.ts](../server/tests/otp-flow.test.ts)

Correct/wrong/expired/replayed challenge behavior and session-bound verification.

- correct OTP creates only the authenticated database verification session and consumes the challenge
- wrong OTP records an attempt without granting dashboard access
- ${name} OTP challenge cannot authenticate _(parameterized title)_
- malformed email OTP input is rejected before opening a database transaction
- email OTP uses Resend with the authenticated email and challenge idempotency key

### [server/tests/otp-status.test.ts](../server/tests/otp-status.test.ts)

Database-derived restoration and unavailable-store denial.

- session restoration reports verified=${verified} from the database _(parameterized title)_
- session restoration never grants access when the database is unavailable

### [server/tests/patient-deletion.test.ts](../server/tests/patient-deletion.test.ts)

Twenty deletion-policy/transaction/provider/concurrency/directory-filter cases, included in the 188 passing server tests.

- only administrators can delete patient login accounts
- the deletion handler also rejects non-admin callers when middleware is bypassed
- invalid account IDs and self deletion are rejected before provider or database work
- the patient deletion route rejects ${role} profiles _(parameterized title)_
- a staff Auth role cannot be deleted through a patient profile
- an active patient must be deactivated before deletion
- PATCH deactivation stays reversible and distinct from permanent DELETE
- deletion refuses active ${conflict} even on an already inactive patient _(parameterized title)_
- patient deletion irreversibly removes Auth credentials, revokes OTP and archives history identity
- failed Auth deletion retains an inactive nonreactivatable reservation and can be retried
- an audit failure before reservation commit performs no Auth deletion or OTP revocation
- failed finalization keeps a retryable marker and rolls back archived email and completion together
- completed deletion retries do not call Auth again or duplicate its audit event
- an in-flight deletion blocks a concurrent reactivation before Auth credentials can be restored
- a reactivation that holds the account row first makes concurrent deletion reject the active account
- concurrent deletion retries finish exactly one completion audit event
- the operational patient directory exposes pending state and excludes completed deletions

### [server/tests/phone.test.ts](../server/tests/phone.test.ts)

Contact telephone normalization/validation; phone is not the active login OTP channel.

- explicit international phone formatting produces a single canonical destination
- ambiguous local numbers, extensions and multiple recipients cannot be normalized
- registration and administrative invitations persist canonical phone numbers

### [server/tests/production-config.test.ts](../server/tests/production-config.test.ts)

Production credential/origin/sender/database TLS configuration acceptance/rejection.

- production accepts Resend credentials, a custom-domain sender, exact HTTPS origin and certificate-verified database
- production refuses ${name} _(parameterized title)_

### [server/tests/profile-address.test.ts](../server/tests/profile-address.test.ts)

Coordinate preservation/clearing on address edits.

- editing residential address removes coordinates from the previously selected location
- unrelated profile edits preserve address coordinates
- removing an address clears its coordinate source as well

### [server/tests/registration-database.test.ts](../server/tests/registration-database.test.ts)

Opt-in real private-schema signup persistence, coordinate constraints and faculty migration.

- registration address and academic details persist in an isolated database schema with coordinate constraints

### [server/tests/registration-persistence.test.ts](../server/tests/registration-persistence.test.ts)

Signup-trigger profile completion, obfuscated-identity protection and save rollback.

- registration persists map and exact academic selections even when the signup trigger already created its profile
- manual registration stores trimmed free-form address with null coordinates and no legacy city requirement
- obfuscated or unknown signup identities cannot write existing accounts (${omitIdentities ? 'missing' : 'empty'} identities) _(parameterized title)_
- a failed registration-details save removes the newly created account and never grants access

### [server/tests/registration.test.ts](../server/tests/registration.test.ts)

Public role/identity/mailbox/address/catalogue/coordinate validation.

- patient registration rejects privilege fields and invalid identity details
- staff patient registration requires staff identity and normalizes email
- all registration paths reject personal and lookalike university emails
- student email matches the student number and invitations require identity details
- students must supply a residential address, faculty and programme without requiring legacy address fields
- registration accepts every exact catalogue programme and rejects programmes from a different faculty
- staff registration preserves optional address and programme but validates any selected faculty
- map coordinates are finite bounded pairs associated with the selected address

### [server/tests/trusted-auth.test.ts](../server/tests/trusted-auth.test.ts)

Trusted server metadata, confirmation, active accounts, provider/profile transient versus permanent error classification.

- editing a client-visible profile cannot change account role or OTP destination
- a database timeout during account-status validation fails closed with safe stage diagnostics
- deactivated accounts cannot reach any protected workflow
- an unconfirmed email cannot access clinic APIs even with a valid session token
- a provider-suspended account returns ACCOUNT_DISABLED on ${status} without clinic access _(parameterized title)_
- Auth provider ${status}/${code ?? 'no code'} preserves the session with 503 _(parameterized title)_
- a non-JSON Auth gateway outage preserves the session with 503
- a network failure preserves the session without exposing diagnostics
- a temporary ${problem} profile lookup failure remains retryable with 503 _(parameterized title)_
- a genuinely missing profile remains a permanent 403 after successful provider authentication
- an invalid trusted role remains a permanent 403 even when a profile exists
- invalid Auth session ${status}/${code ?? 'legacy response'} still returns 401 _(parameterized title)_

### [server/tests/walk-in-accounts.test.ts](../server/tests/walk-in-accounts.test.ts)

Inactive registered patient denial and serialization against account changes.

- walk-in ${method} rejects inactive registered patients without modifying the queue _(parameterized title)_
- walk-in ${method} serializes account activation with queue changes _(parameterized title)_

### [server/tests/workflow-policy.test.ts](../server/tests/workflow-policy.test.ts)

Clock/lab transition/concurrency error policy.

- clinic time validation rejects impossible clock values
- lab updates allow results and cancellation only before terminal states
- schedule concurrency failures are conflicts rather than partial success

### [server/tests/workflows.integration.test.ts](../server/tests/workflows.integration.test.ts)

Opt-in real private-schema clinic workflow/OTP/ownership/migration persistence.

- database workflows persist changes and enforce scheduling and clinician ownership

### [tests/ui/auth-callback.spec.ts](../tests/ui/auth-callback.spec.ts)

Password setup, confirmation, stale/invalid callbacks, trusted-account gates and reload/retry behavior.

- ${kind} password setup survives reload after callback tokens leave the URL _(parameterized title)_
- expired account links show safe recovery guidance and scrub callback details
- malformed invitations leave password setup and explain how to get a new link
- password reset waits for delivery and prevents duplicate recovery requests
- stored setup intent cannot apply to a different signed-in user
- marked ${role} invitation opens password creation after its account is checked _(parameterized title)_
- marked recovery without fragment type still opens password reset
- successful signup confirmation returns to sign-in with a clear notice and keeps OTP required
- a ${kind} marker alone cannot use an older login as password setup _(parameterized title)_
- an unexchanged code callback cannot replace an already verified dashboard session
- a PKCE callback needs the local verifier and uses the supported invitation marker
- an account check outage keeps the consumed invitation retryable after reload
- a denied account check cannot acknowledge ${kind} or open password setup _(parameterized title)_
- stored setup for the same user cannot apply to another authentication session
- password creation waits for the trusted account response
- a failed password update keeps invitation setup available after reload
- an old callback account rejection cannot sign out a newer login
- a signup account-check outage gives an existing-password recovery path without claiming confirmation

### [tests/ui/auth-suspension.spec.ts](../tests/ui/auth-suspension.spec.ts)

The original five banned/disabled-account, invalid-credential and restoration/profile-outage regressions passed after the earlier three-pass/two-failure attempt was corrected. The connectivity update adds initial profile 503/network retry, selected-role retry denial and stale successful OTP regressions, with a fresh session ID on each password login. The full 77-test command includes all nine cases present at that milestone; a subsequent focused command passed both newly added sign-in profile race cases. Eleven cases are now present in this file.

- a Supabase user_banned credential response shows the suspension contact without public account lookups
- a trusted disabled profile blocks sign-in and preserves its contact alert after credential cleanup
- restoring a disabled account returns to login with the suspension contact instead of a dashboard
- invalid credentials keep their ordinary error and do not claim an account was suspended
- a transient profile service failure during restoration retains the session and its real error
- a transient profile failure after valid credentials preserves the session for a sign-in retry
- a temporary profile network failure retains credentials and retries under a new session without skipping OTP
- a profile-outage retry still rejects a selected role that does not match the trusted account
- an older successful OTP response cannot verify a new session for the same user
- an old sign-in profile permanent403 response cannot replace or sign out a newer login
- an old sign-in profile mismatchedPatient response cannot replace or sign out a newer login

### [tests/ui/auth.spec.ts](../tests/ui/auth.spec.ts)

Four-role OTP flow, role mismatch, email failure/retry, registration, empty analytics, schedule API and logout-related guards.

- ${role} must verify OTP before its real dashboard opens and survives reload _(parameterized title)_
- incorrect role leaves an actionable error on the login form
- failed email delivery preserves the retry verification screen
- ${role} signs in with an email code without a phone number on file _(parameterized title)_
- an older restoration result cannot undo successful email verification
- self registration sends university details to the actual registration route
- wrong OTP keeps the verification form available for another attempt
- empty admin analytics are zero and incoming changes refresh database totals
- receptionist schedule creates a real API slot in the clinic timezone
- self registration blocks personal email before submitting to the server

### [tests/ui/patient-deletion.spec.ts](../tests/ui/patient-deletion.spec.ts)

Seven admin patient-login deletion/confirmation/role/conflict/retry/history-facing UI cases, all passed in the focused nine-case correction command.

- admin must deactivate before confirming permanent patient account deletion
- cancelling patient deletion preserves the inactive account without a DELETE request
- a failed deletion keeps the account suspended and exposes a working retry
- receptionists cannot deactivate, reactivate or delete a patient account
- a pending deletion cannot expose account editing or reactivation
- pending deletion blocks reactivation even when the directory refresh fails
- confirmed deletion removes the row even when the directory refresh fails

### [tests/ui/registration.spec.ts](../tests/ui/registration.spec.ts)

Faculty/programme selection, address suggestions/coordinates, keyboard behavior and manual/stale-response fallback.

- student registration requires a residential address without separate location fields
- all four faculties show only their matching programmes
- programme search is case insensitive and keyboard selection commits the programme
- changing faculty clears the chosen programme and hidden signup value
- selecting a public map result saves its address and coordinates in signup
- unavailable address search still permits signup with a manual residential address
- editing a selected map address removes obsolete coordinates before signup
- address suggestions support keyboard selection without prematurely submitting signup
- an older lookup cannot replace the latest residential address results

### [tests/ui/session-persistence.spec.ts](../tests/ui/session-persistence.spec.ts)

Expired-token/shared renewal, idle/focus/reload, outages, manual logout and stale account/OTP response protection.

- an expired access token refreshes and retries its API request without logging out
- concurrent expired-token responses share one refresh and preserve the same authenticated session
- eleven minutes of idle time and a focus refresh keep the dashboard signed in
- a failed SDK token renewal preserves credentials and never sends anonymous clinic requests
- a transient API outage preserves the dashboard and recovers without another login
- the sidebar Sign Out button ends verification and stays signed out after reload
- a delayed invalid response from the previous account cannot logout or replay under a new account
- a delayed verification error cannot revoke a fresh OTP for the same user and access token

### [tests/ui/password-visibility.spec.ts](../tests/ui/password-visibility.spec.ts)

Six browser cases cover registration, invited doctors/receptionists, recovery and login. The final assertions also require exact input accessible names before and after revealing or masking the password.

- registration password eyes act independently without submitting or changing FormData and disable while saving
- revealing registration confirmation keeps the original password mismatch validation
- doctor invite password eyes preserve independent values, accessible controls and the chosen password
- receptionist invite password eyes preserve independent values, accessible controls and the chosen password
- patient recovery password eyes preserve independent values, accessible controls and the chosen password
- login uses the same keyboard-accessible password toggle without submitting and disables it while signing in

## 11. Password visibility, fixed panes and readability update

The existing login, registration, OTP and invited-account/password recovery screens now use a viewport-sized shell. At widths of at least 960px, branding occupies the left half and the form occupies the right half. Narrower screens use the top half for branding and the bottom half for the form. Long content scrolls inside the pane; it does not enlarge or move the outer page. Short branding panes can also scroll internally. Input text is 17px, field labels and ordinary form instructions are 16px, and form headings are 30–40px. Dashboard navigation/actions/body text are approximately 16px, table text is 15px, support text is 13–14px, and primary headings are 24–30px.

Password and confirmation inputs start masked. Each has an independent 44px eye button with a field-specific Show/Hide name, `aria-pressed`, `aria-controls` and `type="button"`. Revealing a password does not submit the form, clear or trim the input, change its validation/autofill attributes, or change the password sent to the server. The buttons disable during the corresponding request. Explicit input labels keep the eye button's name separate from the input's accessible name.

| Check | Result and evidence |
| --- | --- |
| Frontend build and typecheck | Passed after the final markup/heading change |
| Frontend lint | Zero errors; the existing Fast Refresh warning and `.eslintignore` deprecation notice remain |
| Focused password visibility | 6/6 passed against the first completed layout build; the final full run includes strengthened exact-name assertions |
| First full 73-test attempt | **66 passed, 7 failed**. Partial `getByLabel('Confirm password')` selectors matched both the input and its new eye button. Browser diagnostics also showed that nesting the button in the label contaminated the input's accessible name |
| Correction | Moved all five password inputs to explicit labels with sibling eye controls; changed three old partial confirmation selectors to exact matching; added exact accessible-name assertions before/after toggles |
| Final full 73-test attempt | **73/73 passed**, zero failures, approximately 1.4 minutes; earlier failing artifacts remain separate |
| Authentication geometry/access | **28/28 views passed**: login, registration, OTP and invitation setup at seven viewports, including 844×390 landscape; exact half-pane geometry, no outer horizontal/vertical overflow, every visible control reachable inside the form pane |
| Keyboard interaction | **35 password-toggle checks passed** and programme/address keyboard selection passed at all seven sizes |
| Dashboard typography/access | **100/100 selected views passed**: five sections per role, four roles, five widths; no document overflow, clipped controls, inaccessible last table columns or runtime errors |
| Schedule heading review | The matrix identified the direct Doctor Schedules heading still using 16px. Its direct-child selector was added; **5/5 final views passed** with 24px at 320/390/768, 27.32px at 1366 and 30px at 1920; controls/table columns reachable, no overflow or runtime errors |

All Auth/API/provider responses in these browser checks are intercepted fixtures. No real account was created or deleted and no email was sent. This update changes frontend controls/layout only; the previously recorded server/database acceptance remains the separate backend evidence.

Commands and local artifacts:

- `npm run test:ui -- --output test-results/ui-readable-fixed-panels` — first 66-pass/7-failure run.
- `npm run test:ui -- --output test-results/ui-readable-fixed-panels-final` — final complete 73-pass run, preserving earlier failures.
- Fixed pane/font measurements — 28 auth and 100 dashboard views; historical path `test-results/fixed-panels-final/measurements.json` and its accompanying screenshots are currently unavailable.
- Final schedule heading measurements — five affected views rechecked after the heading correction; historical path `test-results/schedule-heading-final/measurements.json` is currently unavailable.
- `test-results/ui-password-visibility/` — the six focused password visibility cases.
- `test-results/ui-readable-fixed-panels/` — the seven initial failure contexts.
- `test-results/ui-readable-fixed-panels-final/` — final full-run result.

## 11b. Login dependency, port and HTTP-method incident

On 13 October, live `/auth/profile` requests failed with **503** and the displayed
message “Unable to validate your session right now.” The account-status query
could not open a database connection. The initial Sign In error handler also
signed out valid SDK credentials on that temporary failure, causing subsequent
requests to return 401. That handler now preserves retryable failures and keeps
the selected role; a successful retry still checks the trusted profile and role
and requires OTP. Permanent role/account failures remain denied.

Captured session/request guards now protect sign-in, profile loading/refresh,
OTP sending and successful verification from delayed responses belonging to an
older login. The server logs a safe validation stage, standardized error code
and timeout category, without raw connection details or tokens.

| Check | Completed result |
| --- | --- |
| Local frontend GET | Port 5173, HTTP 200 |
| API GET/POST security checks | Port 4000; profile/status GET and OTP send/verify POST return expected 401 without credentials; no email sent |
| CORS preflight | OTP POST OPTIONS returns 204 with matching configured frontend origin and expected methods/headers |
| Local API health | Stable check returns 503 with dependency `database`, about 10.1 seconds |
| Hosted Supabase Auth/profile read checks | HTTP 200 with the appropriate configured credentials; anonymous profile access remains denied |
| Hosted project/pooler/network checks | Project active; configured pooler host/user match; IPv4 allowed; zero IP bans |
| Hosted read-only SQL over HTTPS | `SELECT 1` succeeds, HTTP 201; no clinic data changed |
| Pooler TCP | All three resolved IPv4 addresses time out on both 5432 and 6543; HTTPS transport remains reachable |
| Direct database IPv6 | DNS returns an IPv6 address; local connection fails with `ENETUNREACH` |
| First connection-check command | An in-flight health request reset during an API watch restart; dependency checks still reported TCP timeouts |
| Subsequent stable connection-check command | Exit 1, correctly reports health503/database TCP timeouts; sanitized [recorded output](../test-results/login-connections.json) retained |
| Full server regression command | 192 total, 189 passed, 3 opt-in database skips, zero failures |
| Final focused trusted Auth command | 28/28 passed after final logging changes |
| Complete browser regression command | **77/77 passed**, zero failures, approximately 1.5 minutes; [result directory](../test-results/ui-login-connectivity-final/) |
| Two added profile race regressions | **2/2 passed**, 8.0s, after the full 77-test run; [result directory](../test-results/ui-login-profile-races/); old permanent403 and old mismatching profile cannot sign out/replace a newer session |
| Frontend typecheck/build and lint | Passed; lint has zero errors and the existing Fast Refresh/deprecation warnings |
| Server typecheck/build | Passed |
| Diagnostic artifact parsing | PowerShell's initial UTF16 file could not be parsed as UTF8; converted to UTF8, parsed successfully and verified recorded health 503/TCP timeouts |

The user confirmed university Wi-Fi. Results establish a database connection-path
failure from this computer; a different-network comparison or university IT
investigation is still needed to establish which network device/policy blocks
the connection. No cloud restart, firewall-policy change, account-check bypass or
credential change was used. The previous isolated database passes are historical
evidence; those suites were not rerun while TCP is unreachable.

**Open live acceptance gate:** restore outbound PostgreSQL access on 6543 for
clinic queries and 5432 for the session listener, rerun
`npm --prefix server run connections:check`, require health 200, and complete an
authorized real login with its received email OTP. The passing browser fixtures
do not resolve this live connectivity blocker. See the [port/session diagnostic
guide](session-connectivity.md) for the exact endpoint and recheck steps.


## 11c. Repository organization and Vercel preparation

The active frontend remains root `src/` and `public/`; the active API remains
`server/`. Older applications were moved intact to `legacy/frontend/` and
`legacy/backend/`. Supplied screenshot/reference folders were moved intact to
`design-references/`, and previous deployment documentation was archived in
`legacy/`. No active application was rebuilt or replaced. The old tracked ZIP
is preserved locally but removed from the publishing index. Private environment
files, hosting link metadata, builds and test artifacts are excluded.

Two separate Vercel configurations use the same GitHub repository: Vite at the
root, and Express with Root Directory `server`. The API exports `src/app.ts`
without opening a local port, while `src/index.ts` retains local/container startup.
The Node22 runtime, region dub1, bounded60-second function limit, TLS verification,
managed small PostgreSQL pool and retained asynchronous audit work are configured.
On Vercel, shared request counters and provider budgets persist in PostgreSQL;
bounded50-second SSE streams observe committed metadata across instances and
recheck auth/OTP every15seconds. Local LISTEN behavior remains available.

| Check | Completed result |
| --- | --- |
| Frontend/server TypeScript and builds | Passed; frontend build also passed using official checksum-verified Node22.23.3 |
| Frontend lint | Zero errors; existing Fast Refresh/deprecation warnings remain |
| Backend baseline during preparation | 212 total,209 passes,3 opt-in skips,zero failures on Node24 |
| Final backend run on deployment runtime | **214 total,209 passes,5 opt-in skips,zero failures**,75.5s on Node22.23.3 |
| Full browser suite | **79/79 passed**,1.9 minutes; service responses intercepted, no real emails/accounts |
| Vercel JSON schemas | Both configurations validate against the current official schema; reviewed includeFiles array corrected to a glob string |
| Frontend configuration guard | Six checks pass: valid public env, missing env, localhost/path rejection and private-key rejection; missing Vercel variables stop an unusable build |
| Initial private SQL fixture | Failed on UTC rollover assertion; one expression read the pre-call count via a PostgreSQL subquery init plan |
| Corrected private SQL fixture | **Nine checks passed** using actual020/021 and application SQL; sequential reserve/read assertion fixed the harness; schema dropped |
| Hosted migrations020/021 | Applied transactionally under migration advisory lock and version records verified; existing account/clinical rows untouched |
| Additional PostgreSQL integration cases | Two opt-in cases added for real concurrent limits/permissions and late older-ID commits; skipped locally while raw TCP is unavailable; included in CI database runner |
| Publication checks | Native index scanner plus seven focused checks pass; full source/history/archive review found no active credentials; final complete index check required before push |

GitHub CI checks source and fixtures; Vercel builds from the connected repository.
The old mandatory Docker Hub publishing job was removed so a Vercel release does
not require unrelated Docker Hub secrets. Containers remain supported manually.
Production frontend configuration has only three public variables; API credentials
are configured separately. School-domain verification and received university
mail remain separate live acceptance gates. Generated artifacts are local and
excluded from Git. Deployment URLs/acceptance are recorded after publication.

## 11d. GitHub publication and first cloud builds

Source was published to [LAP777-hub/SCCPMS](https://github.com/LAP777-hub/SCCPMS)
on `main`. Remote README changes were merged without rewriting history, retaining
the team-members table. The first push was rejected because new remote commits
arrived during preparation; merging those commits allowed the next push to
succeed. Commit `a55cf2b` triggered both Git-connected Vercel projects.

The frontend uses the repository root; the API uses `server`. Both use Node 22.
Three frontend and fifteen API production variables were stored through Vercel's
standard environment commands. Read-back confirmed the key names, production
scope and sensitive storage; private values were not logged or committed. An
earlier combined temporary-credential-file command was rejected by automatic
approval review and did not run. The standard environment commands completed
the configuration successfully.

| Check/attempt | Result and correction |
| --- | --- |
| First frontend Vercel build | Failed during `npm ci`: the lockfile's optional WASM dependency graph lacked bundled emnapi metadata. Reproduced under Node 22/npm 10 in an empty install directory |
| Frontend lock repair | Added two missing bundled emnapi entries; preserved all 233 existing package versions. Clean Linux x64/glibc-target install passed with 186 packages; native cloud build still supplies actual Linux execution |
| First API Vercel build | Dependency install and `tsc` passed, then Vercel's compiler rejected Helmet's default import as non-callable |
| Helmet correction | Namespace import with explicit `.default` preserves middleware options. Node 22 typecheck, ESM/CommonJS runtime creation and alternate TypeScript module-resolution checks passed |
| First GitHub workflow | Security job passed. Frontend install failed on the same lockfile. Four of five real database cases passed; the workflow case failed because vanilla CI PostgreSQL has no Supabase `auth.audit_log_entries` table |
| Database fixture isolation | Added a private Auth-audit fixture and actual UNION/filter/pagination assertions. Socket failures still fail the test; a separate cleanup connection releases clients and removes only the temporary schema. Node 22 typecheck passed |
| Focused local workflow rerun | Auth-audit assertions passed, then the university connection reset during scheduling SQL. The run failed with `ECONNRESET`; retained as a network failure, with a full CI rerun required |
| Real Vercel database integration | Both concurrency/permissions and late-commit invalidation cases passed against isolated temporary schemas: 2/2, zero skips/failures, 28.35s; cleanup completed |

Cloud rebuild, HTTP/database health, deployed browser checks and production Auth
redirect results are recorded after these corrections. University-domain DNS and
actual received OTP/invitation mail remain separate acceptance requirements.

Commit `e6dbaec` reached GitHub after selecting the saved GitHub account explicitly
when its credential manager stalled. The frontend deployment reached READY and
four actual public browser views passed: desktop/mobile login/registration, loaded
logos, no viewport overflow/runtime errors, and NAS faculty labels. The API's
second cloud compilation still rejected Helmet despite local module checks. A
native JavaScript entry (`server/app.mjs`) now loads the API's existing compiled
output, preserving the full `tsc` build and existing clinic middleware.

The final local five-case database command on Node 22 completed in 177.25s:
three passed, two failed, zero skipped. The corrected workflow case passed all
private Auth-audit assertions; the two Vercel cases lost their database connections
with `ECONNRESET` during cleanup. Their earlier focused 2/2 result is retained;
neither failed run is presented as a full pass. CI's isolated PostgreSQL run is
the stable release check for all five cases.

GitHub run `38441263323` completed backend and security jobs successfully:
214 unit cases, 209 passes and five intentional database skips in 41.407s;
all five real PostgreSQL cases passed with zero skips/failures in 2.704s.
Its browser run passed 78/79: the held-restoration regression exposed a real
race when successful OTP verification changed the request generation before
the same account's delayed profile response arrived. The valid profile was
discarded. A deterministic rerun against the old bundle failed in 8.2s with
"Account profile unavailable". Both delayed responses are now held explicitly
while the source correction preserves current-account successes across OTP changes.

The corrected profile/OTP regression passed in 1.5s against the rebuilt Node 22
frontend. A focused Auth/callback/suspension/session run passed 56/57; the remaining
network-retry test inspected its exact send count before the asynchronous send
completed. It now waits for the fixture's accepted-delivery status before checking
the same exact send/session/logout counts. Existing account-switch and delayed
error guards remain asserted. The JavaScript API entry also passed four local
HTTP checks: service identity, protected 401, CORS 204 and JSON 404/security headers.

### Completed hosted release checks

Commit `ddc456ab6e43398dc7b436326b540237126145d4` is published on GitHub and
both connected Vercel projects reached READY. The focused suspension correction
passed 11/11 in 19.3s; the full [GitHub workflow](https://github.com/LAP777-hub/SCCPMS/actions/runs/38443989130)
then passed all three jobs, with [79/79 browser cases](https://github.com/LAP777-hub/SCCPMS/actions/runs/38443989130/job/115457477617)
in 1.2 minutes. No live Auth accounts or emails were created by those tests.

| Actual hosted check | Completed result |
| --- | --- |
| [Frontend](https://sccpms.vercel.app) | READY; built assets reference the deployed API and correct Supabase project, with no localhost API |
| [API](https://sccpms-api.vercel.app) | READY; service identity JSON 200; function region `dub1` |
| [Database health](https://sccpms-api.vercel.app/healthz) | HTTP 200, status `ok`, using verified TLS and the configured transaction pooler |
| Seven HTTP assertions | All pass: frontend home/assets/deep link/invite callback; API identity/health; three protected GET/POST 401 checks; CORS 204; JSON 404 |
| Actual responsive browser | Four views pass: desktop 1440×900 and phone 390×844 login/register; loaded square logos 172.8px/120px, no overflow/runtime errors, NAS labels |
| Deployed real Kimberley address searches | HTTP 200 from Photon for both queries: Long Street returned two results and New Park one; each supplies coordinates within Kimberley |
| Hosted Auth settings | Production Site URL saved; all five production allow-list URLs present; previous local entries preserved |
| Auth redirect propagation | Immediate probe still saw cached localhost default and failed; subsequent read-only probe passed 4/4 HTTP 303 default/signup/invite/recovery to production |
| Resend read-only domain check | First request timed out; successful HTTP 200 retry confirms `clinic.spu.ac.za` remains `not_started`; no mail sent |
| Publication security | Final implementation index: 453 files, zero credential/private-archive findings; GitHub security job also passes |

No application changes remain for this deployment correction. The school must
complete sender DNS verification and production SMTP/inbox acceptance before
email onboarding/OTP can be declared working. The public Photon provider's
availability and sustained usage policy, backups, clinical/privacy review and
real operator/load acceptance remain documented operational requirements.

## 11e. Email timing, confirmation landing and staff passwords (14 October)

The production OTP error was investigated using provider configuration and runtime diagnostics. A live send failure recorded HTTP 403 at 12:47:10 UTC on 14 October. The exact raw provider body was not exposed; the unverified sender is independently established by Resend's domain status. `clinic.spu.ac.za` was `not_started`, its DKIM/SPF records were unpublished, and click/open tracking was disabled. Supabase custom SMTP was absent; production Site URL and redirects were already correct. Eleven earlier accepted messages had delivered events, but no new message or measured university inbox latency was established by this check. No emails were sent during this work.

SPU does not grant the user school-domain DNS access. The user has requested help with a subdomain and is waiting for SPU. IT can publish provider records without granting DNS access. A separately owned verified sender would also work with university recipients. Sender verification and recipient university-email enforcement are separate requirements.

Implemented changes:

- OTP expiry starts after provider acceptance, defaults to ten minutes, and is returned to the UI. Resend cooldown defaults to 30 seconds. Failed resends preserve a prior valid code; a new accepted code atomically replaces it. Pending challenges reuse their secret-derived code and idempotency key after ambiguous delivery, without storing plaintext codes.
- Provider calls have a ten-second total budget and at most one retry for transient errors. Permanent sender/quota errors return promptly. Accepted acknowledgements survive a database-finalization retry; per-user reservations and failed-challenge limits are durable across instances. Late HTTP completion cannot write another response.
- Confirmation/invitation/recovery emails open the live application before following their one-use Supabase verification link. An explicit Continue protects against email prefetching. Staff create and confirm their own passwords, then sign in using their trusted email/role and complete OTP; patients return to sign-in after confirmation. Authentication requests and logout have deadlines.
- A fresh, provider-confirmed invitation with temporarily missing role/profile setup returns a bounded retry response, while invalid roles still fail closed. Callback SDK network errors offer retry; malformed implicit links retain invalid-link guidance. Late sign-in hints fill untouched inputs without replacing user typing.
- A guarded operator runner prepares two-hour Auth link settings independently of SMTP. Branded template installation requires custom SMTP. SMTP changes require the exact Resend sender domain to be verified, sending enabled and tracking disabled. The runner preserves existing redirects and verifies saved configuration without printing secrets.

| Completed check | Result and boundary |
| --- | --- |
| Actual Node22 full server suite | **265 total: 259 passed, six intentional database skips, zero failed**, 82.579s; precedes the eight operational configuration tests below |
| Additional SMTP/template configuration tests | **8/8 passed**, zero skips; mocked providers, no hosted mutation or mail |
| Provider resilience checks | **10/10 passed**; retry identity/budgets, safe 403/429 classification, actual loopback stalled-body abort; no Resend mail |
| New OTP real PostgreSQL case | **1/1 passed**, 25.308s; isolated schema cleanup, migration repeatability, cooldown/leases, rollback/recovery, concurrent finalization and code limits |
| Live additive migration022 | Applied transactionally under migration lock; version and all six added columns verified; no account/clinical row edits |
| Vercel runtime timing variables | Production API configured with `OTP_VALIDITY_SECONDS=600` and `OTP_RESEND_COOLDOWN_SECONDS=30`; obsolete university email-domain setting subsequently removed |
| Frontend typecheck/build | Passed on Node22 after final corrections |
| Initial full browser run | **88/92 passed; four failures retained**, 2.3min; artifacts in ignored `test-results/ui-email-performance/` |
| Corrected focused browser run | **35/35 passed**, 43.1s; all 22 callback and 13 new email-flow cases; artifacts retained separately |

The initial browser failures exposed two source issues and one duplicated test-fixture issue: Supabase's implicit-link exception has a synthetic status500 and was misclassified as a temporary outage; a late trusted signup hint did not fill an already mounted input; two staff tests assumed the password-update payload omitted the SDK's nullable PKCE fields. Error classification now uses the API error type, untouched inputs respond to late hints, and tests allow those known SDK fields while verifying exactly one password update and no role mutation. All four cases pass on the corrected run. The complete initial run is not relabelled as a full uninterrupted pass.

Read-only review found that the SDK can retain an in-memory session after a failed logout when browser storage is blocked. An explicit shared storage adapter and targeted regression address that fallback. Normal sign-in/password requests have a 12-second HTTP deadline; SDK token-refresh retries can take roughly 37 seconds during a stalled Auth service, so the per-request timeout is not a promise of a 12-second overall restoration. Provider acknowledgement and browser tests do not guarantee university inbox arrival within seconds.

Cloud publication and template readback results follow below. Real received mail, inbox timing and staff onboarding remain unverified until SPU supplies and verifies the sender subdomain and custom SMTP is activated. [Email setup and live acceptance](email-delivery.md).

### Later recipient-email policy correction

The user then requested that every email be acceptable. The active frontend, staff invitation form, public/admin patient schemas and trusted login validation now accept any valid email address. The student-email prefix no longer has to match the student number; required student/staff identity numbers, academic/address data, trusted roles, suspension checks, confirmation and OTP are retained. The old `UNIVERSITY_EMAIL_DOMAINS` runtime setting, examples, CI setting and environment validation were removed. Earlier university-only tests remain historical evidence of the superseded policy.

The corrected registration/Auth/persistence/phone regression command passed **63/63**, with no skips, on actual Node22 in 33.803s. It includes Gmail/Outlook/Yahoo/custom-domain acceptance, all four role authentications, malformed-address rejection, unconfirmed/suspended accounts and identity requirements. A real database fixture now uses a personal email unrelated to its student number and verifies the persisted email/number alongside its address/programme. Full browser/cloud results are recorded below as they complete.

The subsequent full browser run passed **94/95** in 2.7 minutes, including the blocked-storage/logout recovery case. Its single failure was the new doctor's invitation fixture using an exact accessible-name selector for a wrapped specialty select; the actual label includes option text. The fixture now uses the existing label's supported substring match. This failed run remains in `test-results/ui-email-policy/`; its correction is checked separately before cloud publication.

### Publication, provider restrictions and fixture corrections

Implementation commit [`f361feb`](https://github.com/LAP777-hub/SCCPMS/commit/f361feb5b918ba420450b4f0470428724b36c72d) was published to GitHub. Both Vercel production projects reached READY for that commit. The local corrected staff-invitation tests passed **2/2** in 10.9s. Its [cloud workflow](https://github.com/LAP777-hub/SCCPMS/actions/runs/38616990188) passed frontend **95/95** and security checks; server units passed **279 total, 273 passed, six explicit database skips**. The separate database command passed **4/6**, failing two test fixtures: a repeated profile SELECT omitted the newly asserted email/number columns, and the older workflow's migration list omitted022. The assertions and migration fixture were repaired without application code changes. Both affected suites subsequently passed **2/2, no skips**, on actual Node22 with verified TLS in 127.81s; both temporary schemas were cleaned up. The first cloud workflow remains recorded as failed.

Read-only checks against the deployed frontend passed **8/8**: signup, invitation, recovery and foreign-provider rejection at desktop1440x900 and mobile390x844. Continue controls were visible and at least44x44; URLs were scrubbed, with no overflow, runtime errors, verification requests or mutations. Continue was never clicked. The deployed HTTP suite passed **7/7**, including API/database health200, protected GET/POST401, production CORS204, frontend assets/deep links and JSON404.

The hosted template PATCH returned **HTTP400**: Supabase's free-tier default email provider does not allow template customization until custom SMTP is configured. No templates were saved. The runner now makes that prerequisite explicit, provides a separate `--apply-links` operation, and retries only bounded GET reads when management configuration briefly lags after an accepted PATCH. Its corrected configuration suite passed **11/11**, zero skips, 5.807s under mocked providers.

Hosted link settings were saved: Site URL remains `https://sccpms.vercel.app`, old redirects are retained, confirmation remains enabled, and new Auth links expire after **7200 seconds**. The immediate readback was temporarily stale and reported a mismatch; later readback and an idempotent runner check verified all four link fields, unchanged SMTP and saved7200s. The prepared branded scanner-resistant templates remain unapplied. SMTP activation returned `blocked/domain_pending` with zero SMTP mutation; Resend still reports `clinic.spu.ac.za` as `not_started`. No real messages or Auth accounts were created by these checks. Full Git index publication scan passed **466 files, zero private-credential/archive findings**.

Final implementation commit [`e5a6d82`](https://github.com/LAP777-hub/SCCPMS/commit/e5a6d82e8ac0845d22e15825d7c2e5720db65190) is published, and both connected Vercel production deployments are READY. Its [full cloud workflow](https://github.com/LAP777-hub/SCCPMS/actions/runs/38618624563) passes all three jobs: browser **95/95** in 1.4 minutes, server unit **282 total / 276 passed / six intentional database skips / zero failures**, isolated PostgreSQL **6/6 with no skips/failures**, and publication/security checks. Runtime application code is unchanged by the final documentation update. Actual university/personal-inbox delivery remains blocked by the external sender/SMTP requirements above.

## 11f. Restore the Resend owner's administrator OTP

The new screenshot again showed `OTP_EMAIL_UNAVAILABLE`. Read-only inspection confirmed that the main `clinic.spu.ac.za` sender remained `not_started`, custom SMTP was absent, and production Site URL/two-hour Auth link settings were correct. The user explicitly confirmed that the existing administrator's email is the Resend account email. Official provider documentation permits its default sender only to that owner; this cannot serve other users.

The API now has a narrowly bound temporary owner route. Production mail from `SCCPMS <onboarding@resend.dev>` is permitted only for the configured confirmed active administrator with an exact trusted Auth ID, `admin` role, and matching authenticated email/recipient. Account lookup confirmed one eligible existing administrator and its profile/status; no role, password or account was created or changed. Two private production settings enable that binding. All other users retain the main sender; the global production sender restrictions, real OTP verification, single-use HMAC hashes, session/email binding, attempt limits and cooldowns remain in force.

Additive migration023 stores the exact sender with a challenge. Pending retries preserve it alongside their original code, expiry payload and provider idempotency key. Legacy uncertain requests retain the main sender; cached acknowledgements finalize without another send. The production migration was applied under the migration advisory lock; its version, column and validation constraint were verified without editing account/clinical rows.

| Completed owner-route check | Result and boundary |
| --- | --- |
| Focused owner-sender and resilience cases | **30/30 passed**, zero skips; 20 new sender-policy cases plus ten earlier transport cases, Node22, 1.98s, mocked providers |
| Full server suite | **307 total: 301 passed, six intentional database skips, zero failed**, Node22, 88.101s; includes route acknowledgement, identity policy, sender persistence and existing workflows |
| Updated real OTP PostgreSQL case | **1/1 passed**, no skips, 32.2s runner; migrations022/023 applied twice, sender persistence/replay, expiry preservation, failure/rollback recovery and cleanup |
| Server TypeScript | Passed |
| Production binding | Both values configured as Sensitive on the API project; actual account ID and values kept out of Git/output |
| Actual Resend delivery check | HTTP200 accepted in **4338ms**, then provider event `delivered`; one email to the confirmed owner, containing **no login code**, no OTP/account rows edited |

The delivered diagnostic establishes that the owner's sender route can reach that mailbox. It is not a completed live OTP/login round trip; a usable code is generated only when the owner requests it through the normal authenticated live sign-in flow. General signup/invitation/other-role mail remains blocked until an owned sender domain is verified and Supabase custom SMTP is configured. [Owner-route operation and removal](email-delivery.md).

Owner implementation commit [`a53f3df`](https://github.com/LAP777-hub/SCCPMS/commit/a53f3dff4c0525437365579d8b071fadf8da36ed) is published and both Vercel projects are READY for that code. Its [cloud workflow](https://github.com/LAP777-hub/SCCPMS/actions/runs/38636184567) passes all three jobs: **301 server passes / six explicit unit database skips**, separate real PostgreSQL **6/6 without skips**, browser **95/95**, and security/publication checks. The final index scan covers **468 files with zero findings**. Deployed HTTP checks pass **7/7**, including database health200, protected GET/POST401 and production CORS204. Read-only owner OTP state showed two failed recent requests, no pending draft or valid code, and room below the ten/hour cap; no counters, sessions or challenge rows were reset. The user was instructed to request a fresh code through the live system.

## 11g. Cancel SPU sender setup and preserve all-email acceptance

On 14 October 2026 the user canceled the SPU email domain and confirmed that no
replacement sending domain or SMTP account is available yet. Registration,
admin-created patient accounts, doctor/receptionist invitations and trusted
login validation already accept all valid recipient domains. Gmail, Outlook,
Yahoo and custom-domain cases remain covered; required identities and role
authorization are retained. The unused university-domain setting was also
removed from Docker Compose.

The primary Resend sender now defaults to empty, with no automatic test-domain
fallback. Production permits that state only with the complete valid binding
for the existing Resend-owner administrator; malformed bindings, global test
senders, missing full API keys and insecure database settings still fail
validation. Other accounts receive `OTP_EMAIL_UNAVAILABLE` before a challenge
reservation or provider request. Existing accepted codes remain usable, and a
missing sender does not spend hourly code allowances. The normal authenticated
owner route still stores its exact sender and commits provider acknowledgements.
Docker/environment checks now describe this limited state consistently.

| Completed cancellation check | Result and boundary |
| --- | --- |
| Focused registration, trusted Auth, config, owner and resend checks | **111/111 passed**, no skips, Node22, 20.929s; provider/database fixtures isolated |
| Full server suite before the new administrative-readiness case | **311 total: 305 passed, six intentional database skips, zero failed**, Node22, 74.651s |
| Missing-sender administrative readiness | **1/1 passed**, no skips, Node22, 0.606s; missing/blank senders in both modes cannot report ready or call the provider |
| Server TypeScript | Passed |

The previous university DNS handoff is retained as historical evidence and is
no longer a required setup step. Accepting an email address does not establish
delivery: other-role OTPs and general confirmation/invitation/recovery mail
remain unavailable until a replacement sender and Supabase custom SMTP are
configured. No new messages, users or account/clinical data were created by
this change.

Implementation commit [`0c413b1`](https://github.com/LAP777-hub/SCCPMS/commit/0c413b15e7031ac0f49a2d17c07cc193028a1eee)
is published. Its [cloud workflow](https://github.com/LAP777-hub/SCCPMS/actions/runs/38639060199)
passes all three jobs: server **312 total / 306 passed / six explicit database
skips / zero failures**, separate isolated PostgreSQL **6/6 without skips**, browser
**95/95** in 1.4 minutes, and security checks. The index publication scan passed
**469 files, zero findings**. Both production projects are READY for that code.
The API was redeployed after removal of the former primary sender; its 17
remaining production settings retain the private owner binding and production
mode. The ignored local primary sender is also empty. No school DNS or account
records were changed.

The post-removal HTTP check passed **7/7**, including frontend/API/database health
200, protected GET/POST401, production CORS204 and JSON404. Environment syntax
validation passed and explicitly reports general delivery unavailable. The
read-only production sender check returned its expected configuration-unavailable
result with no provider lookup or message. This is the honest current setup
boundary, not a successful general-email delivery test. The final documentation
update changes no application code.

## 11h. Staff account deletion, retained Records and operational reports — 15 October 2026

The administrative changes add permanent doctor/receptionist login deletion
after deactivation, alongside the existing patient deletion flow. Pending
deletions cannot be edited or reactivated, and retained account records expose
contact details to administrators. Inviting a deleted account back creates a
separate login; historical clinical records remain attached to the original
identity. Reports use server aggregates for the selected dates, with daily
appointment trends, outcomes, doctor workload and clinical counts. Current
active/inactive/deleted account totals are labeled separately from activity
within the chosen date range; empty datasets remain zero or explicit empty
states. None of these changes establishes general email delivery readiness.

| Completed check | Result and boundary |
| --- | --- |
| Full server unit command | **329 total: 323 passed, six intentional database skips, zero failed**, Node22, **84.520s** |
| Focused staff/patient deletion checks | **25/25 passed** |
| Focused invitation/Records and report checks | **8/8 passed** |
| Initial affected PostgreSQL run | **1/2 passed, one failed**: the new notification helper used category `user`, outside the database's allowed `system`/`appointment` categories |
| Corrected affected PostgreSQL run | **2/2 passed**, no skips, **140.625s** after changing the helper's default category to `system`; the patient case took20.76s |
| Initial affected browser run | **44/45 passed, one failed**: the test expected `Confirmed`, while the doctor's rendered appointment status was lowercase `confirmed`; the mocked SSE update had reached the doctor view |
| Final full browser run | **99/99 passed**, zero failures, **2.3 minutes**; includes separate admin/doctor/patient sessions receiving the mocked stream, Records contacts/reinvite, password setup and mobile plot readability |
| Final complete server suite | **348 total: 342 passed, six intentional database skips, zero failures**, Node22, **85.007s** |
| Expanded all-role deletion PostgreSQL case | **1/1 passed**, no skips, **35.831s**; patient/doctor/receptionist credentials removed under isolated provider fixtures, actual database histories retained, doctor appointment conflict refused, directory unpublished and deletion notices persisted |
| Initial/repeat invitation safety and identity checks | **92/92 focused checks passed**, **24.38s**, including atomically rejecting an existing unconfirmed email without overwriting or deleting it |
| Records route scope and invitation acknowledgement | **20/20 passed**, **1.902s**; a native local HTTP router check confirms that the Records admin guard preserves doctor access to unrelated APIs |
| Retained contact notices and archive lookup | **39/39 passed**, **2.082s** after adding identifiable deletion messages and account-reference search |
| Server and frontend TypeScript; frontend build | Passed |
| Frontend lint | Zero errors; the existing Fast Refresh warning and ESLint ignore-file deprecation remain |
| Publication scan | **482 indexed files, zero findings** |
| Actual production SQL report check | Read-only transaction passed:30 daily dates, matching totals/series/doctor workload and nonnegative account counts; no personal rows printed or provider calls |
| Migrations024/025 | Applied under the migration lock and verified:version ledger, RLS and durable change triggers; invitation state backfilled without changing authentication or clinical rows; no emails sent |
| GitHub cloud release checks | Application commit `da399a923597f52ce61f712c79135396ba5bdec9`: **348 total unit checks / 342 passed / six intentional skips / zero failures** in 57.116s; separate **six real PostgreSQL cases passed** in 3.410s; **99 browser cases passed** in 1.2 minutes; frontend/backend builds, typechecks and security jobs succeeded |
| Vercel release | Frontend `sccpms` and backend `sccpms-api` both READY for the exact application commit `da399a9`; no new live user accounts were created or deleted for acceptance |
| Deployed read-only HTTP acceptance | **7/7 passed**: frontend assets/API origin, invitation callback deep link, API root, PostgreSQL health with verified TLS, unauthenticated GET/POST rejection, production CORS and JSON 404; checked at 00:08 UTC / 02:08 SAST on 15 October |

The browser/provider fixtures do not send emails, delete real users or prove a
live multi-user clinic session. The isolated PostgreSQL cases exercise real
SQL in temporary schemas. The failed notification category and browser
assertion are retained here rather than counted as successful original runs.
The invitation API can reuse an existing unconfirmed identity. Review caught
that risk before release; new invitations and reinvitations now atomically
create their own identity first. Existing emails return409, cleanup is limited
to that fresh UUID, doctor publication follows successful provisioning, and
the emailed invitation must acknowledge the same identity. Password acceptance
notices follow a real provider acknowledgement and commit once with their audit
record. A provider-confirmed invitation racing its provisioning transaction can
retry briefly without losing the password setup screen.

The Records administrator guard is scoped to `/account-records`; its local HTTP
regression verifies other role APIs still pass through. Mobile plots scroll
within their card to preserve readable labels. Background refreshes retain
unapplied report filters, and stalled stream readers reconnect while polling
remains available.

The application release is published at
[commit da399a9](https://github.com/LAP777-hub/SCCPMS/commit/da399a923597f52ce61f712c79135396ba5bdec9).
Its [GitHub workflow](https://github.com/LAP777-hub/SCCPMS/actions/runs/38657985344)
completed successfully. The hosted application is
[SCCPMS](https://sccpms.vercel.app), using the
[deployed API](https://sccpms-api.vercel.app). This final evidence update changes
documentation only. The verified replacement sender, Supabase custom SMTP and
live clinical/inbox acceptance remain outstanding; the SPU sender plan remains
canceled. A successful invitation API/provider acknowledgement is not a promise
of inbox delivery.

## 11i. Brevo non-admin mail and Resend administrator isolation — 15–16 October 2026

The user supplied Brevo API and SMTP credentials and requested that Resend serve
only the existing administrator. Keys were saved in ignored configuration and
the runtime API key in Vercel's Sensitive production environment;
the encoded MCP credential is not used as an API/SMTP password. No real user
accounts, clinical records or mail messages were created for this work.

| Check | Observed result and boundary |
| --- | --- |
| Initial live Brevo access | Both `GET /v3/account` and `GET /v3/senders` returned **401 IP authorisation blocked**; no sender/relay inspection or SMTP change was possible |
| Requested IP recheck and later recheck | Both endpoints still returned **401 IP authorisation blocked**; this establishes an access failure, not inbox delay or a confirmed bad key |
| Focused dispatch/config/resilience checks | **68/68 passed**, zero failures, 3.410s; strict admin identity, six non-admin role variants, Brevo payload/message references, retry identity, safe provider errors and production configuration |
| OTP route / SMTP helper focused checks | **51/51 passed**, zero failures, 9.916s; provider acknowledgement and SQL lifetime, current-code preservation, no Resend fallback, IP rejection as503, verified-sender/relay/username gates, redirects and templates |
| Final complete local backend suite | **379 total:373 passed, six intentional opt-in database skips, zero failures**, Node22, **84.444s**; public dummy credentials used throughout |
| Backend TypeScript and production build | Passed |
| Credential publication guard | Added raw Brevo API/SMTP and encoded MCP detection, exact active-key checks and three passing negative/placeholder regressions; final indexed scan passed **487 files, zero findings** |
| Administrative helper live inspection | Safe `brevo_ip_authorization`, HTTP401; no emails sent and Supabase SMTP left unchanged |
| Cloud unit/database/browser checks | Commit `418028c`: **379 total / 373 unit passes / six intentional skips / zero failures**, 56.173s; separate **6/6 real database passes**, 3.024s; **99/99 browser passes**, 1.3 minutes; builds/typechecks/security jobs passed |
| Vercel source deployment | Both frontend and API verified READY for exact commit `418028c22ffd874a94368650bf0dfb3c3c541539`; Brevo API key stored as Sensitive, no unverified sender configured |
| Deployed read-only checks | **7/7 passed**, 16 October at00:07SAST: frontend/configuration, invitation callback, API root, PostgreSQL/TLS health, protectedGET/POST rejection, CORS and JSON404 |

Resend now requires the configured owner's exact Auth UUID, trusted admin role
and normalized email in every environment. Non-admin roles use Brevo only;
unknown roles, other administrators, recipient overrides, provider overrides
and incompatible stored senders fail closed. Missing provider setup does not
consume a new challenge. Provider IP failures return safe service-unavailable
responses, not incorrect-password/session errors. The existing database
single-use code, accepted-only verification, session binding, expiry and attempt
limits are preserved.

Brevo retries reuse the exact challenge UUID and payload. A duplicate response
without a message reference remains unknown; it cannot activate a code or
fabricate an acknowledgement. Such an uncertain draft may remain pending until
its 15-minute lifetime ends. The tests establish controlled provider contracts,
not guaranteed receipt time during real outages.

The new `auth:configure-brevo` helper performs sender/relay inspection and guarded
Supabase SMTP/template setup. SMTP username must match the provider account,
the SMTP key is distinct from the API key, and changes are read back while
preserving redirects/confirmation. It sends no emails. Real SMTP authentication,
link tracking, inbox delivery, invitation password setup and multi-role live
login must still be accepted after Brevo permits the hosting connections.
At this initial milestone IP access was unresolved. Section 11j records the later
successful recheck and configuration. No IP/security setting was silently
changed by the setup scripts. Historical domain/Resend SMTP instructions are superseded by
[the current Brevo setup](email-delivery.md).

Published [application commit](https://github.com/LAP777-hub/SCCPMS/commit/418028c22ffd874a94368650bf0dfb3c3c541539)
and [successful cloud workflow](https://github.com/LAP777-hub/SCCPMS/actions/runs/38814706084).
This final result update changes documentation only. Passing hosting checks do
not establish Brevo inbox delivery at that milestone; see the subsequent
actual delivery evidence below.

## 11j. Brevo access restored, SMTP enabled and real delivery — 16 October 2026

The continuation recheck returned 200 from both Brevo account/sender endpoints.
One active sender, an enabled transactional relay and its SMTP username were
discovered and saved privately. Runtime API key and sender are Sensitive Vercel
production settings; SMTP credentials remain administrative secrets.

| Check | Actual result |
| --- | --- |
| Access after initial IP failures | Account and sender requests both **200**, relay enabled, sender active and username matched; no provider IP-security switch changed by these scripts |
| Real SMTP authentication | **Passed**, verified TLS on port 465; **1.086s**, no email sent by this authentication-only check |
| Cutover review finding | An older unknown Resend draft could cross providers if its sender exactly matched Brevo's sender; migration 026 retires only unacknowledged pending non-admin drafts |
| Real isolated SQL cutover regression | **1/1 passed**, no skips, **41.678s**; 11 synthetic controls cover retirement, admin/accepted/known-ack preservation, unchanged verified sessions, audit attribution and idempotency |
| Production migration 026 | Applied under the migration lock, version ledger and retired-draft state verified; no emails, account credentials or clinical records changed |
| Initial SMTP settings readback | Failed with `management_readback_mismatch` after a successful update: Supabase returns a write-only SMTP secret marker rather than the plaintext password |
| Corrected settings helper | Verifies successful password-write acknowledgement and stored presence separately from nonsecret field equality; exact password match is not claimed for opaque readback; **9/9 focused tests passed**, 1.237s |
| SMTP and templates | Applied/read back: Brevo host/587, username/sender, password stored, confirmation enabled, live Site URL, existing redirects retained and 7200-second Auth links |
| Real Brevo API diagnostic | **201 accepted in 634ms**, sent only to the confirmed owner administrator; contains no login code; provider events reported **delivered** |
| Real Supabase SMTP recovery diagnostic | **200 accepted in 716ms**, same confirmed owner; provider events reported **delivered**; reset token was not redeemed or used to change credentials |
| Delivered email redirect inspection | Initial direct-href check did not find the wrapper because Brevo tracked the link. A manual tracking redirect resolved to the live wrapper, correct Supabase verification origin/path, recovery action and live password-setup callback. No verification URL was requested or token printed/consumed |
| Updated backend TypeScript | Passed |
| Final publication scan | **488 indexed files, zero findings**; credentials, private environment and email-link data remain outside Git |
| Final cloud regression | Commit `255e535`: **380 total / 374 server passes / six intentional unit-command skips / zero failures**, 56.776s; separate real PostgreSQL **6/6**, 3.273s; browser **99/99**, 1.6 minutes; frontend/backend builds, typechecks and security scan passed |
| Final Vercel application release | Both frontend and API verified READY for exact commit `255e53552e6e3fd277e154d7c4f68047557a12ef`, with verified Brevo sender and API credentials installed in the API production environment |
| Final live HTTP checks | **7/7 passed**, 16 October at03:48SAST: frontend and assets/configuration, email callback route, API root, verified-TLS PostgreSQL health, protected GET/POST rejection, production CORS and JSON404 |
| Final live email-wrapper checks | **8/8 passed**, 16 October at03:49SAST: desktop/mobile signup, invitation, recovery and foreign-origin rejection; no horizontal overflow or runtime errors. Synthetic link values only; no Auth verification or mutation requests and no Continue button clicked |

Two actual setup emails were sent in this stage; no patient/doctor/receptionist
accounts or fictional clinical records were created. The successful SMTP Auth
request establishes delivery from Supabase's hosted service, beyond a local
SMTP login. Provider “delivered” events do not establish that the recipient read
the message, its inbox folder or a universal delivery-time guarantee.

The preserved administrator login OTP still uses Resend. Non-admin OTP dispatch
uses Brevo, with confirmations/invitations/recovery through Supabase SMTP.
Actual signup, staff invitation password completion and OTP entry with real
authorized users remain acceptance work; automated role flows use fixtures.

Published [application commit](https://github.com/LAP777-hub/SCCPMS/commit/255e53552e6e3fd277e154d7c4f68047557a12ef)
and [successful final workflow](https://github.com/LAP777-hub/SCCPMS/actions/runs/38836967389).
This final evidence update changes documentation only.

## 11k. Five-minute OTPs, residences, staff popups and profile photos — 16 October 2026

The user requested delivery within one minute, a five-minute login code,
separate calling-code selection, working residence search, Records popups,
signup confirmation returning to login, staff invitation password popups,
reception-only departments and profile-photo uploads. Administrator OTPs remain
on Resend; non-admin codes and hosted Auth SMTP remain on Brevo.

| Check or finding | Recorded result |
| --- | --- |
| Five-minute code configuration | Default and validated setting are exactly 300 seconds; local and Vercel production setting updated; the acknowledged server deadline drives the UI countdown |
| Delivery target evidence | Read-only Brevo events for two prior setup messages show request-to-delivered intervals of **617ms** and **1626ms**; both below60 seconds. No new email sent by this check; this does not guarantee every recipient's inbox or prove a real non-admin OTP round trip |
| Focused timing/provider/address regressions | **70/70 passed**, 18.590s; covers five-minute default, Brevo payload duration, acknowledgement timing, all published residence names and provider bounds/fallback |
| Focused photo/department checks | **8/8 passed**, 6.725s; pixel decoding/re-encoding/metadata removal, input limits, own-user storage paths, persistence/audit, rollback cleanup, uncertain commit and reception department policy |
| Real isolated migration/persistence checks | **2/2 passed**, no skips, 55.222s; migration027 photo path/reception constraints and idempotency; migration028 legacy pending retirement, accepted deadline cap, no extension of shorter codes, unchanged verified sessions and audit idempotency |
| Live migrations | 027 and028 applied under the migration lock; ledger, photo column, receptionist mapping and legacy draft retirement verified. No clinical records or passwords changed |
| Actual private Storage acceptance | Bucket configured privately with 2MB/WebP restrictions; real synthetic-object upload and signed download passed, unsigned public access denied, diagnostic object removed; no real user profile changed |
| Initial full local server attempt | **390 total:382 passed, two failures, six opt-in DB skips**, 306.184s. One HTTP deadline test process stalled and was stopped; the other failure used an outdated receptionist fixture with a doctor specialty |
| Server test correction | Receptionist fixture no longer supplies a clinical specialty. Deadline-test HTTP cleanup now closes the listener before destroying connections, unrefs the server and has a five-second test timeout; corrected registration/HTTP subset **20/20 passed**, 4.653s |
| Second full local server attempt | **390 total:383 passed, zero assertion failures, one cancelled, six DB skips**, 263.168s. The same stalled-body check reached its five-second test timeout; its process remained active and was stopped. This is not recorded as a clean full pass or a proven cleanup-only problem |
| Explicit email deadline | Native cancellation alone was insufficient in the intermittent test. Fetch and JSON consumption now race an explicit deadline, abort on timeout and retain safe unknown-delivery semantics. Two tests cover transports that ignore cancellation; timing/provider/OTP subset **53/53 passed**, 15.899s |
| Final complete local backend rerun | **400 total:394 passed, six intentional opt-in DB skips, zero failures/cancellations**, 97.493s; includes the final deadline race and photo timeout guards |
| Independent photo review | Found that late storage completions could send another response after a request timeout. Guarded responses and pre-upload/end checks added, acknowledged uploads still persist/clean up safely, and Storage fetch receives a ten-second cancellation deadline. Eight additional timeout/cancellation cases passed in the final full suite |
| Independent phone review and correction | Foreign international prefixes could be rewritten under ZA, Italian significant zeroes were rejected, and formatted pastes could be clipped. Mismatched prefixes/letters now block submission with an explanation, significant foreign zeroes are retained and raw paste length is40. Final registration subset **15/15 passed**, 34.0s, including both new cases |
| Initial browser attempt | Interrupted before cases ran because Playwright tried to clear the diagnostic-tools parent folder. Its output now uses `test-results/playwright`; private diagnostics remain ignored |
| Full browser rerun | **112/112 passed**, 2.5minutes: signup confirmation/login for all patient categories, doctor/receptionist password popup, five-minute deadline, ZA number persistence, residence names without fake coordinates, address retry, Records modal, reception-only choices and all-role photo upload/reload |
| Lint | Initial unused receptionist Avatar helper removed; rerun passed with zero errors. The existing Fast Refresh warning and `.eslintignore` notice remain |
| Typechecks/builds | Frontend/backend typechecks and production builds passed; frontend fixture build16.78s |
| Final fixture frontend build | Passed after phone correction, 20.42s; final lint/typechecks passed |
| Final publication scan | **506 indexed files, zero findings**; provider credentials, private environments and diagnostic data remain outside Git |
| Final cloud regression | Exact application commit `27d2cfa`: **400 total / 394 server passes / six intentional unit-command skips / zero failures or cancellations**, 58.685s; separate real PostgreSQL **6/6**, 3.083s; browser **114/114**, 1.8 minutes; frontend/backend builds, typechecks and security scan passed |
| Final Vercel application release | Both frontend and API verified READY for exact commit `27d2cfa2cb4d2169b0ac2d1266ed3c8eec97e65d`; five-minute OTP setting and private profile bucket configured |
| Final live HTTP checks | **9/9 passed**, 16 October at15:21SAST: frontend, invitation callback route, API root, PostgreSQL health, protected photo GET/PUT and OTP POST rejection, production CORS and JSON404 |
| Final live address searches | **10/10 passed**, 16 October at15:22SAST: Long Street and New Park returned real map coordinates; Rathaga, Massouh, Rise Student Living, Long Street Lofts, My Studend SA, Sea Of Mountains, Ntabiseng Courts and Lawson resolved through the expected catalogue source without invented coordinates |
| Deployed frontend assets | **4/4 passed**, 16 October at15:22SAST: production script loaded and contains the profile-photo workflow, calling-code control and correct production API origin |

Search combines the seven university halls and sixteen published off-campus
names/clusters with the administrator's Ntabiseng Courts/Lawson additions and
supplied spelling aliases. Catalogue names have no invented street address or
map coordinates and retain manual-entry fallback. Photo uploads use the private
own-user API and real Storage, not browser-only persistence. The invitation
popup preserves validated callback/session gates and chosen-password login.

The one-minute mail target remains dependent on provider and recipient delivery.
The cloud checks and live searches above passed for the published
[application commit](https://github.com/LAP777-hub/SCCPMS/commit/27d2cfa2cb4d2169b0ac2d1266ed3c8eec97e65d)
and [successful workflow](https://github.com/LAP777-hub/SCCPMS/actions/runs/38906863196).
Live human signup/invitation/OTP completion remains acceptance work. This final
evidence update changes documentation only.

## 11l. Admin overview from the supplied dashboard reference — 16 October 2026

The requested overview has four statistic cards with actual seven-date
sparklines; a Monday–Sunday appointments chart, recent bookings and today's
timeline; and demographics, financial statistics, quick actions and notifications
below. Existing SPU branding, registration, invitation, account and scheduling
workflows remain in use. No operational sample data is seeded.

| Check or finding | Recorded result |
| --- | --- |
| Administrator overview endpoint | New admin-only, OTP-protected, no-store endpoint; one SQL snapshot covers totals, date series, demographic groups and appointment lists |
| Metric definitions | Patients/doctors count active nondeleted accounts; appointments include retained cancelled bookings; medical records count clinical encounters once; chart dates use the saved clinic timezone |
| Focused authorization/error checks | **5/5 passed**, 12.398s; unauthenticated/non-admin denial, OTP requirement, no-store success, settings failure and safe database outage |
| Real isolated SQL regression | **1/1 passed**, no skips, 9.776s; empty database, seven zero dates, Monday/Sunday bounds, active demographic classification, suspended/deleted/pending exclusions, retained medical history and an extreme UTC+14 clinic date; private schema removed |
| Production data consistency read | Read-only at21:31SAST: **7 active patients, 2 doctors, 0 appointments, 0 medical records**; demographic sum matches the patient total, four series each contain seven dates, and the week starts on Monday. No names/contact data or clinical content printed |
| Financial source inspection | No income/expense ledger exists in the current backend/schema. The financial panel explicitly displays unavailable totals rather than inventing amounts or presenting unknown finances as measured zero revenue |
| Initial frontend lint | Two obsolete overview imports were unused; removed. Final lint has zero errors, with the pre-existing Fast Refresh warning and `.eslintignore` notice retained |
| Initial build size finding | Eager overview code increased the entry script to512.12kB, triggering the standard500kB advisory. Lazy-loading the new overview reduces the entry to**498.68kB /133.93kB gzip**; overview code is14.09kB /4.28kB gzip; final fixture build passed in1.85s |
| Initial focused browser run | **5 passed, 2 failed**, 1.3minutes. Zero/populated statistics, polling/error recovery, preserved patient form and quick/search actions passed. Two mobile checks timed out trying to use the obscured header menu toggle while the drawer was open |
| Mobile correction | Added an explicit Close menu button within the sidebar; mobile tests now use the visible close control. No forced clicks or disabled interaction checks |
| Desktop visual review | Actual browser screenshot reviewed against the reference; four top cards, three middle panels and four lower panels present. The empty chart is flat at zero and the empty donut has no fabricated segments |
| Complete local backend regression | **406 total:399 passed, seven intentional opt-in database skips, zero failures/cancellations**, 97.911s |
| Final full local browser regression | **121/121 passed**, 2.7minutes; includes the corrected mobile drawer, empty/populated overview, actual15-second polling, outage recovery, preserved unsaved form, existing quick-action forms, real-shaped search, desktop/tablet/mobile grids and all prior role/session/email/profile checks |
| Final typechecks/builds | Frontend no-emit TypeScript, backend TypeScript/build and frontend production fixture build passed |
| Publication scan | **518 indexed files, zero findings**; environments, diagnostic logs and screenshots remain ignored |
| Final cloud regression | Exact application commit `c4a20ca`: **406 total /399 server passes /seven intentional unit-command skips /zero failures or cancellations**, 59.651s; separate real PostgreSQL **7/7**, 5.375s; browser **121/121**, 1.9minutes; frontend/backend builds, typechecks and security scan passed |
| Final Vercel application release | Frontend and API both verified READY for exact commit `c4a20ca05b515e4e9c9930af74e9ed515378c772` |
| Final live overview checks | **7/7 passed**, 16 October at21:34SAST: frontend/header assets, correct live API endpoint, separate overview bundle, genuine empty/unavailable states, unauthenticated endpoint denial and production CORS |
| Final existing runtime checks | **9/9 passed**, 16 October at21:34SAST: frontend, email callback route, API root, PostgreSQL health, protected photo GET/PUT and OTP POST denial, production CORS and JSON404 |

The existing15-second polling/live-event mechanism updates the data in place.
Opening a new appointment or patient form uses the existing workflow directly;
background updates do not change its component identity or discard its fields.
Search opens the real patient/staff directory with the selected account filter.

No real accounts, appointments or clinical records were created or modified for
this overview validation. The isolated database fixture is kept separate from
the production consistency read. Published
[application commit](https://github.com/LAP777-hub/SCCPMS/commit/c4a20ca05b515e4e9c9930af74e9ed515378c772)
and [successful cloud workflow](https://github.com/LAP777-hub/SCCPMS/actions/runs/38955867246).
This final evidence update changes documentation only. Authenticated live-user
workflow acceptance remains distinct from fixture browser tests and the
read-only production aggregate check.

## 11m. Centred popups and five-megabyte profile images — 17 October 2026

The user requested every popup in the centre of the viewport, a 5 MB image limit
and four photo operations: select, upload, remove and view larger. The enlarged
view toggles back to the smaller preview within the same popup. Closing the
dialog is a separate standard dismissal control.

| Check or finding | Recorded result |
| --- | --- |
| Root cause of top-left dialogs | Tailwind's universal margin reset overrode the browser dialog's default centring. The shared dialog now explicitly uses fixed positioning, `inset: 0`, auto margins, fit-content height and viewport-bounded scrolling |
| Other popup review | Staff invitation overlays and invited-staff password dialogs already had explicit viewport centring; their actual desktop/mobile geometry is included in regression coverage |
| Source image allowance | UI, server raw-image limit, exact photo-route request guard and private Storage bucket now use **5,242,880 bytes**; normal JSON limits remain 256 KiB |
| Hosted upload compatibility | The browser validates the 5 MB source and original 16 MP dimensions, then optimises the image before upload with a 4 MiB transport cap; server pixel decoding/re-encoding and metadata stripping remain mandatory. Decode/encode failures never upload the original unoptimised file |
| Four photo actions | Select previews a pending image, Upload saves it, Remove clears a pending selection or deletes the saved photo, and View larger expands the preview inside the centred popup |
| Saved-photo removal | Own-user row lock, transactional path clearing and audit, database-derived object path, post-commit owned-object cleanup, idempotent empty retries and preservation on uncertain commit |
| Focused photo backend checks | **25/25 passed**, no skips/failures/cancellations, 3.369s; includes a real valid ~4.2 MB PNG accepted/re-encoded, real over 5 MB input rejected, deletion ownership, rollback, lost commit, repeated removal and timeout handling |
| Focused size/HTTP guards | **4/4 passed**, no skips/failures/cancellations, 15.637s; exactly 5 MiB accepted, next byte rejected, other routes retain 256 KiB and unauthenticated DELETE returns 401 |
| Initial focused browser checks | **14/14 passed**, 31.0s; all-role upload/delete persistence across reload, five-megabyte inclusive boundary, invalid selection preservation, larger view/reopen state, and actual centred geometry over scrolled photo/Records/staff pages and password setup at desktop/mobile sizes |
| Image preparation failure regression | Added a browser case where encoding returns no image: no original-file fallback request, visible actionable error, selected image retained and controls become available again |
| Live private bucket setting | Updated/read back at 05:03 SAST: private, 5,242,880-byte limit, allowed type only normalised WebP; zero real profiles changed and zero files uploaded by the settings check |
| Builds and static checks | Frontend/backend TypeScript and backend build pass; ESLint zero errors with the existing Fast Refresh warning and `.eslintignore` notice. Frontend fixture build 1.75s, 502.56kB entry/135.15kB gzip; standard 500kB advisory retained |
| Complete local backend regression | **419 total: 412 passed, seven intentional opt-in database skips, zero failures or cancellations**, 99.377s |
| Complete local browser regression | **132/132 passed**, 2.9 minutes; includes all new photo/popup cases and the encoder-failure recovery case, plus prior role, OTP, registration, overview, Records, reports and session workflows |
| Publication scan | **521 indexed files, zero findings**; private configuration, provider responses and diagnostic artifacts remain ignored |

No live profile image or account was changed by the automated photo tests. Real
pixels are decoded in the browser/server fixtures; provider and profile writes
are isolated mocks. Full regression and hosted release results follow after
their commands complete.

## 12. Supporting documents

- [Operations](../OPERATIONS.md)
- [Email timing, sender setup and SMTP](email-delivery.md)
- [Readiness history](../PRODUCTION_READINESS.md)
- [Auth email callbacks and hosted redirects](auth-email-links.md)
- [Registration catalogue and NAS correction](academic-catalogue.md)
- [Address provider configuration and limitations](residential-address-search.md)
- [Private profile photos and storage](profile-photos.md)
- [Admin overview metric definitions and refresh behavior](admin-dashboard-overview.md)
- [Historical university Resend DNS handoff](../RESEND_UNIVERSITY_DNS.md)
- [Login session and port diagnostics](session-connectivity.md)
- [GitHub/Vercel deployment](vercel-deployment.md)

This report is maintained from recorded command results, source inventory and retained local artifacts. Hosting/database connectivity, Brevo access, sender/relay, SMTP credentials and actual API/Supabase SMTP delivery checks pass. Real recipient signup/invitation/OTP completion and institutional operational acceptance remain outstanding; local university-network instability is separately documented.
