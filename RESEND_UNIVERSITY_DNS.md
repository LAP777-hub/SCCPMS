# University email sender: clinic.spu.ac.za

Prepared on 12 October 2026 from this Resend account. Provider status: **not_started**. The domain is not ready until Resend confirms verification.

This is a request for the university IT/DNS administrators to approve and add the following records under the university's domain. No university DNS records have been changed by this project. Sending is enabled; inbound receiving is disabled. Open and click tracking are disabled; TLS is enforced.

Proposed sender after verification: `SCCPMS <login@clinic.spu.ac.za>`. University users continue using their `@spu.ac.za` accounts.

| Purpose | Type | Full hostname | Value | Priority | TTL |
| --- | --- | --- | --- | --- | --- |
| DKIM | TXT | resend._domainkey.clinic.spu.ac.za | p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCTSHPvhn5OyuJmr4ph9MmftfnCx+TN5ZmL2wxZLs0K6B7YnEDl9YJHV78tCJtIEPgBqosgUjdAb8lsZF/1RpYykDBPB8hoYshYH8cUTNqKeaqwmDjbk38NeIZ3wdjYbnlRAmD1Marb46KEyy0/3gzuy4PvVp+3rsSVRZgAQe1p4wIDAQAB |  | Auto |
| SPF | MX | send.clinic.spu.ac.za | feedback-smtp.eu-west-1.amazonses.com | 10 | Auto |
| SPF | TXT | send.clinic.spu.ac.za | v=spf1 include:amazonses.com ~all |  | Auto |
| SPF | CNAME | rsend.clinic.spu.ac.za | send.forge.rmta.net |  | Auto |

Use the full hostnames above, or the DNS provider's equivalent relative names. Preserve the university's existing mail routing and existing root-domain MX/SPF records. Apply these sending records at their listed names. DKIM TXT values may require quoted chunks in the DNS provider's editor; the combined value must match.

Once DNS records are published, open [Resend Domains](https://resend.com/domains), select `clinic.spu.ac.za` and start verification. Wait until the domain is verified and sending is enabled. Then change ignored `server/.env`:

```dotenv
RESEND_FROM_EMAIL="SCCPMS <login@clinic.spu.ac.za>"
```

Run `npm run email:check --prefix server -- --production`, restart the API, and test an actual login using the code received by the account owner. Keep the full API key in ignored configuration or hosting secrets.

The local sender remains `onboarding@resend.dev` until verification; Resend restricts that sender to the email associated with its account. No emails were sent by this preparation script.

[Resend domain verification](https://resend.com/docs/dashboard/domains/introduction) · [Development sender restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)
