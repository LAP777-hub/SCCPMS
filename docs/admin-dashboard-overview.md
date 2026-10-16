# Admin dashboard overview

The administrator overview follows the supplied dashboard reference while using
the existing SCCPMS accounts, appointments, clinical encounters and notifications.
The university name, campus image and currency belong to this South African
installation; no sample names, profile photographs, amounts or percentages from
the reference are copied into the application.

## What each panel counts

| Panel | Actual source and meaning |
| --- | --- |
| Total Patients | Active patient, student, lecturer and staff profiles, excluding deleted and deletion-pending accounts |
| Doctors | Active clinic doctors with active, nondeleted accounts |
| Appointments | All recorded appointments, including cancelled bookings retained in history |
| Medical Records | Recorded clinical encounters in `patient_visits`; their prescriptions and laboratory orders are linked records rather than extra encounters |
| Four sparklines | Newly created records on each of the last seven clinic dates; account series use the currently active cohort, not a reconstructed historical active-account total |
| Appointments Overview | Counts by scheduled start date, Monday through Sunday of the current week, using the configured clinic timezone; includes all statuses |
| Recent Appointments | Five most recently created bookings, with actual patient name, consultation type, scheduled date/time and status |
| Today's Schedule | Up to eight appointments on the current clinic date, ordered by start time; cancelled bookings and no-shows are excluded; View all opens appointments |
| Patient Demographics | Current active patients grouped as Students, Employees, Faculty or Others; explicit student/staff/lecturer roles take precedence, then existing patient university type |
| Clinic Statistics | Revenue, expenses and net revenue are unavailable because this project has no financial ledger; the panel explains this and does not fabricate cash totals |
| Notifications | Three most recent notifications for the signed-in administrator, with their actual unread state and timestamp |

Every empty date remains zero. An empty demographic chart uses a neutral ring
and a zero total with zero percentages. An unavailable query shows an error and
Retry; previously loaded data stays visible during an outage. There are no random
sparklines, invented growth percentages or seeded operational records.

## Refresh and actions

The existing authenticated live-event system triggers updates after changes.
Visible dashboards also refresh every 15 seconds and on window focus. Updates
replace the data in place; they do not reload the document or reset unsaved forms.
The overview aggregation runs as one SQL statement, so all panels use the same
database snapshot and clinic date. It is administrator-only, requires an OTP-
verified session and returns `Cache-Control: no-store`.

Quick actions open the existing appointment booking, patient registration,
doctor/receptionist invitation, reports and settings screens. The header search
finds existing patient/staff accounts and menu pages; selecting an account opens
the corresponding directory with its email filter already applied. Header date
and time use the clinic timezone. The notification badge counts actual unread
notifications; profile photo controls retain the existing private upload flow.

The layout uses four statistic cards, three middle panels and four bottom panels
on wide desktops, then rearranges into fewer columns on smaller screens. The
mobile sidebar has an explicit close button. The overview chart code loads as a
separate bundle, avoiding extra chart code on other role dashboards.

See [the testing report](TESTING_REPORT.md) for executed tests, failed attempts,
corrections and hosted release verification.
