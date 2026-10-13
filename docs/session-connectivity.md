# Login, HTTP methods and database connectivity

## Confirmed incident: 13 October 2026

The login message **“Unable to validate your session right now.”** is a temporary
API dependency failure. The observed requests reach `/auth/profile`, but the
server cannot connect to PostgreSQL to check `account_status`. The same dependency
causes `/healthz` to return HTTP 503 after approximately ten seconds.

Read-only checks confirmed that Supabase Auth and profile REST requests respond,
the project is active, and the configured pooler host/username match the hosted
configuration. No project IP bans were present. The current IPv4 address is
allowed by the existing database network configuration. `SELECT 1` succeeds
through Supabase's HTTPS management endpoint, while TCP connections from this
computer to every resolved pooler IPv4 address time out on 5432 and 6543.
The direct database resolves to IPv6; this computer reports `ENETUNREACH` on
that route. The user confirmed they are connected to university Wi-Fi.

These observations establish a connection-path failure from this computer.
They are consistent with a network/firewall restriction, but a comparison on
another network is needed to attribute it specifically to university Wi-Fi.
No firewall protections or Supabase network allow-lists were changed.

## Ports and HTTP methods

| Connection | Port | Observed result | Purpose |
| --- | --- | --- | --- |
| Browser → Vite frontend | 5173 | GET `/` → 200 | Login, registration and dashboards |
| Browser → Express API | 4000 | Requests reach the expected routes | Clinic APIs |
| Browser/API → Supabase HTTPS | 443 | Auth health and profile access respond | Identity and profiles |
| API → `aws-0-eu-west-1.pooler.supabase.com` | 6543 | TCP timeout | PostgreSQL transaction pool for clinic queries, account checks and OTP persistence |
| API → same session pooler | 5432 | TCP timeout | PostgreSQL session connection for `LISTEN clinic_changes` and live updates |

| API request without credentials | Observed response | Meaning |
| --- | --- | --- |
| GET `/auth/profile` | 401 `SESSION_INVALID` | Expected rejection of an unauthenticated account check |
| GET `/auth/otp/status` | 401 `SESSION_INVALID` | Expected rejection without an authenticated session |
| POST `/auth/otp/send` | 401 `SESSION_INVALID` | Expected rejection; no email sent |
| POST `/auth/otp/verify` | 401 `SESSION_INVALID` | Expected rejection; no session verified |
| OPTIONS `/auth/otp/send` | 204 | Preflight accepts Authorization/Content-Type and GET, POST, PATCH, PUT, DELETE, OPTIONS |
| GET `/healthz` | 503, dependency `database` | The local API cannot open its configured database connection |

The live responses authorize the configured `http://localhost:5173` CORS origin.
The 401 results above are expected security checks, not broken GET/POST routes.
The hosted Site URL does not repair an unreachable PostgreSQL TCP connection.

## Implemented session recovery

Temporary profile failures (network errors, timeouts, 408/425/429/5xx) preserve
the authenticated SDK session. The login form retains its fields and selected
role so Sign In can retry the account check. A successful retry still validates
the account profile and role and requires email OTP before opening a dashboard.
Permanent account/role failures continue to deny access; suspended accounts
retain the existing administrator contact alert.

Sign-in, profile loading and OTP responses are checked against the current
session and request generation before changing authentication state. An older
request cannot log out, overwrite the profile of, or verify a later login.
Server diagnostics identify token validation, profile lookup or account-status
validation without recording tokens, passwords, connection strings or raw
dependency messages.

## Recheck and restore the connection

With the application running, execute:

```sh
npm --prefix server run connections:check
```

The checker tests frontend/API/HTTPS reachability, authenticated-route rejection,
CORS preflight, both configured PostgreSQL ports, and `SELECT 1` with configured
TLS if the transaction connection is reachable. It prints no keys or account
data and sends no emails. It exits with code 1 while a required dependency is
unavailable; it does not report an unhealthy API as ready.

University IT can allow outbound TCP from the API computer to
`aws-0-eu-west-1.pooler.supabase.com` on **6543 and 5432**. Alternatively, test the
same computer on a phone hotspot or another network. After connection access is
restored, rerun the checker, confirm `/healthz` is 200, then retry Sign In and
complete the received email OTP. Keeping TLS certificate verification enabled
is required. Changing database passwords or loosening account checks does not
address the observed TCP timeout.

An initial diagnostic health request reset during an API watch restart. The
subsequent stable check returned the expected database-dependency 503; its
sanitized local output is retained in `test-results/login-connections.json`.
Live login and database workflow acceptance remain blocked until connectivity
is restored. Browser fixtures demonstrate recovery behavior, not live inbox
delivery or live database access.

References: [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres),
[hosted pooler configuration](https://supabase.com/docs/reference/api/v1-get-pooler-config),
[database network restrictions](https://supabase.com/docs/guides/platform/network-restrictions).
