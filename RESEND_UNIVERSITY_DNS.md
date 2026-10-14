# University email sender: clinic.spu.ac.za

**Historical handoff — canceled on 14 October 2026.** The user canceled the SPU
sender setup. These records preserve the earlier preparation; they are optional
reference material, not an active deployment requirement or instruction to
change university DNS. Leave `RESEND_FROM_EMAIL` unset or empty until a replacement
domain you own is verified. The separately bound owner-admin OTP route remains;
Supabase custom SMTP is absent. All valid recipient email domains are accepted
by the application. See [current email setup](docs/email-delivery.md).

Prepared on 12 October 2026 from this Resend account. Provider status: **not_started**. The domain is not ready until Resend confirms verification.

The original request asked university IT/DNS administrators to approve and add the following records under the university's domain. No university DNS records were changed by this project. At preparation, sending was enabled, inbound receiving was disabled, open/click tracking was disabled and TLS was enforced.

Former proposed sender after verification: `SCCPMS <login@clinic.spu.ac.za>`. This address is no longer the active sender plan. Users may use any valid recipient email address, including personal or university accounts.

| Purpose | Type | Full hostname | Value | Priority | TTL |
| --- | --- | --- | --- | --- | --- |
| DKIM | TXT | resend._domainkey.clinic.spu.ac.za | p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCTSHPvhn5OyuJmr4ph9MmftfnCx+TN5ZmL2wxZLs0K6B7YnEDl9YJHV78tCJtIEPgBqosgUjdAb8lsZF/1RpYykDBPB8hoYshYH8cUTNqKeaqwmDjbk38NeIZ3wdjYbnlRAmD1Marb46KEyy0/3gzuy4PvVp+3rsSVRZgAQe1p4wIDAQAB |  | Auto |
| SPF | MX | send.clinic.spu.ac.za | feedback-smtp.eu-west-1.amazonses.com | 10 | Auto |
| SPF | TXT | send.clinic.spu.ac.za | v=spf1 include:amazonses.com ~all |  | Auto |
| SPF | CNAME | rsend.clinic.spu.ac.za | send.forge.rmta.net |  | Auto |

Only if this domain is separately approved and the historical plan is resumed, retrieve its current provider records before any DNS changes. Use the full hostnames above, or the DNS provider's equivalent relative names. Preserve the university's existing mail routing and existing root-domain MX/SPF records. Apply sending records at their listed names. DKIM TXT values may require quoted chunks in the DNS provider's editor; the combined value must match.

Historical continuation instructions, not the current setup: once approved DNS records are published, open [Resend Domains](https://resend.com/domains), select `clinic.spu.ac.za` and start verification. Wait until the domain is verified and sending is enabled before using this former example in ignored `server/.env`:

```dotenv
RESEND_FROM_EMAIL="SCCPMS <login@clinic.spu.ac.za>"
```

Run `npm run email:check --prefix server -- --production`, restart the API, and test an actual login using the code received by the account owner. Keep the full API key in ignored configuration or hosting secrets.

The primary sender is now intentionally unset. `onboarding@resend.dev` is used only by the separately authorized owner-admin OTP route; it cannot deliver general clinic mail. No emails were sent by the original preparation script.

[Resend domain verification](https://resend.com/docs/dashboard/domains/introduction) · [Development sender restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)
