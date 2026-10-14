# Confirmation and invitation email links

Production templates now use an intermediate page at the live frontend with
`email_action=signup|invite|recovery` and an encoded `confirmation_url`. Loading
this page does not verify the token. The recipient clicks Continue to follow a
validated URL at the configured Supabase project, then returns to the existing
`auth_action` callback below. This protects against email prefetching; links are
still single use. New Auth links have a two-hour expiry after template setup.
[Configuration, SMTP and live acceptance](email-delivery.md).

SCCPMS uses the configured `FRONTEND_ORIGIN` for new email links. In development
it is `http://localhost:5173`; the explicit callback destinations are:

- `http://localhost:5173/?auth_action=signup`
- `http://localhost:5173/?auth_action=invite`
- `http://localhost:5173/?auth_action=recovery`

Supabase's verification endpoint confirms the email/invitation and forwards its
session to this application. An invited doctor or receptionist opens **Set your
password**, chooses and confirms a password, then signs in with that password and
completes email OTP verification. The administrator does not assign a password.
Public signup already collects a password; confirmation returns to sign-in with
an acknowledgement that the email is confirmed. Dashboard access still requires
the trusted account role and successful email OTP.

Password setup is tied to the verified account and its current authentication
session. Reloading the page preserves unfinished setup. If the clinic account
service is temporarily unavailable after an invitation has been consumed, the
app retains that session and offers **Retry account link**; password creation
opens only after the account check succeeds. An invalid or disabled account is
denied. A URL marker by itself cannot turn an ordinary login into password setup.

## Hosted Supabase setting

Open the configured project's **Authentication → URL Configuration**:

1. Set **Site URL** to `http://localhost:5173`.
2. Ensure **Redirect URLs** includes the three explicit callback URLs above.
   Preserve any existing production URLs. `http://localhost:5173/**` is a supported
   development alternative when all local application routes are required.
3. Leave confirmation and invitation email templates linked to
   `{{ .ConfirmationURL }}` so Supabase verifies the token before returning to the
   app. A custom template that links only to `{{ .SiteURL }}` does not verify the
   account. [Supabase redirect settings](https://supabase.com/docs/guides/auth/redirect-urls),
   [email template variables](https://supabase.com/docs/guides/auth/auth-email-templates).

On 13 October 2026, the hosted Site URL was saved as `http://localhost:5173`.
Management API readback confirmed that URL and all five required redirect
allow-list entries, preserving existing URLs. The read-only checker exited
successfully with `ok: true`: the project default, signup, invite and recovery
probes all returned HTTP 303 to `http://localhost:5173`. A separate fresh,
uncached invalid-token probe confirmed the same default destination.

These probes deliberately use invalid tokens and create no account, send no
message and consume no real user link. Real confirmation/invitation delivery,
password setup from a received message and email OTP acceptance remain pending.
Re-run the read-only check after changing redirect settings:

```sh
npm run auth:check-redirects --prefix server
```

`supabase/config.toml` also contains the correct local Auth URLs. That file governs
local Supabase and does **not** change the hosted project.

For future programmatic setup, create a personal access token from the
[Supabase access-token page](https://supabase.com/dashboard/account/tokens).
Limit a scoped token to this project and include `auth_config_read`,
`auth_config_write` and `project_admin_write`, as required by the current
[read](https://supabase.com/docs/reference/api/v1-get-auth-service-config) and
[update](https://supabase.com/docs/reference/api/v1-update-auth-service-config)
Auth configuration endpoints. Save it as `SUPABASE_ACCESS_TOKEN` in ignored
`server/.env`, then run:

```sh
npm run auth:configure-redirects --prefix server
```

The helper merges required callback URLs with the existing allow-list, changes
only Site URL/redirect settings, and reads them back. Application anon/service-role
keys cannot modify these management settings. It never logs credentials or SMTP
configuration. [Supabase Auth configuration API](https://supabase.com/docs/reference/api/v1-update-auth-service-config).

A PostgreSQL connection password authenticates database connections; it is not
a Management API access token. Do not put a database password in
`SUPABASE_ACCESS_TOKEN`, and do not change a working database connection to repair
the hosted Site URL.

## Link handling and testing

Use a newly generated confirmation or invitation email after updating redirects.
Previously generated links can contain older redirect destinations and can expire
or be consumed; expired links need a fresh confirmation/invitation, not a copied
token. Opening a link twice does not create another valid confirmation session.

`localhost` points to the device opening the email. Development links work on the
computer running Vite; users opening mail on another device need a reachable
deployed frontend URL configured in `FRONTEND_ORIGIN` and Supabase.

Browser regressions use mocked Auth/provider responses. Hosted redirect probes
establish routing, not delivery or password setup using a real received message.
Supabase Auth SMTP and application Resend OTP delivery remain separate services;
the university sender DNS requirements in `RESEND_UNIVERSITY_DNS.md` still apply.
