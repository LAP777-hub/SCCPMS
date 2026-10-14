import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { validResendKey } from './check-email.mjs';

// Prepare provider records only. University DNS must be approved and changed by its administrators.
const name = 'clinic.spu.ac.za';
const output = new URL('../../RESEND_UNIVERSITY_DNS.md', import.meta.url);
const key = process.env.RESEND_API_KEY?.trim();
if (!validResendKey(key)) {
  console.error('A full Resend key is required in server/.env. No domain was changed.');
  process.exitCode = 1;
} else {
  async function request(path, method = 'GET', body) {
    const response = await fetch(`https://api.resend.com${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
    return payload;
  }
  try {
    const list = await request('/domains?limit=100');
    if (!Array.isArray(list?.data) || list.has_more) throw new Error('Incomplete domain list');
    let domain = list.data.find(item => item.name === name);
    const created = !domain;
    if (!domain) domain = await request('/domains', 'POST', {
      name, region: 'eu-west-1', tls: 'enforced',
      capabilities: { sending: 'enabled', receiving: 'disabled' },
    });
    if (typeof domain?.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(domain.id)) throw new Error('Invalid domain reference');
    // Tracking is unnecessary for authentication codes.
    await request(`/domains/${domain.id}`, 'PATCH', { open_tracking: false, click_tracking: false });
    domain = await request(`/domains/${domain.id}`);
    if (domain?.name !== name || !Array.isArray(domain.records) || !domain.records.length) throw new Error('Missing DNS records');
    const cell = value => String(value ?? '').replace(/[\r\n]/g, ' ').replace(/\|/g, '\\|');
    const hostname = value => {
      if (typeof value !== 'string' || !/^[a-z0-9_.-]+$/i.test(value)) throw new Error('Invalid record hostname');
      // Resend returns names relative to the parent DNS zone, including "clinic".
      const zone = 'spu.ac.za';
      const full = value === zone || value.endsWith(`.${zone}`) ? value : `${value}.${zone}`;
      if (!full.endsWith(`.${name}`)) throw new Error('Record outside the clinic sender domain');
      return full;
    };
    const rows = domain.records.filter(record => record.record !== 'Tracking').map(record =>
      `| ${cell(record.record)} | ${cell(record.type)} | ${hostname(record.name)} | ${cell(record.value)} | ${cell(record.priority)} | ${cell(record.ttl || 'Auto')} |`
    );
    if (!rows.length) throw new Error('No sending records');
    await writeFile(output, `# University email sender: ${name}\n\nPrepared on 12 October 2026 from this Resend account. Provider status: **${cell(domain.status)}**. The domain is not ready until Resend confirms verification.\n\nThis is a request for the university IT/DNS administrators to approve and add the following records under the university's domain. No university DNS records have been changed by this project. Sending is enabled; inbound receiving is disabled. Open and click tracking are disabled; TLS is enforced.\n\nProposed sender after verification: \`SCCPMS <login@${name}>\`. Users may use any valid recipient email address, including personal or university accounts.\n\n| Purpose | Type | Full hostname | Value | Priority | TTL |\n| --- | --- | --- | --- | --- | --- |\n${rows.join('\n')}\n\nUse the full hostnames above, or the DNS provider's equivalent relative names. Preserve the university's existing mail routing and existing root-domain MX/SPF records. Apply these sending records at their listed names. DKIM TXT values may require quoted chunks in the DNS provider's editor; the combined value must match.\n\nOnce DNS records are published, open [Resend Domains](https://resend.com/domains), select \`${name}\` and start verification. Wait until the domain is verified and sending is enabled. Then change ignored \`server/.env\`:\n\n\`\`\`dotenv\nRESEND_FROM_EMAIL="SCCPMS <login@${name}>"\n\`\`\`\n\nRun \`npm run email:check --prefix server -- --production\`, restart the API, and test an actual login using the code received by the account owner. Keep the full API key in ignored configuration or hosting secrets.\n\nThe local sender remains \`onboarding@resend.dev\` until verification; Resend restricts that sender to the email associated with its account. No emails were sent by this preparation script.\n\n[Resend domain verification](https://resend.com/docs/dashboard/domains/introduction) · [Development sender restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)\n`, 'utf8');
    console.log(JSON.stringify({ domain: name, created, status: domain.status, dnsRecordsPrepared: rows.length, artifact: 'RESEND_UNIVERSITY_DNS.md', universityDnsChanged: false, activeSenderChanged: false, emailsSent: 0 }));
  } catch (error) {
    console.error('University sender preparation did not complete:', error instanceof Error ? error.message : 'Check provider access and network');
    process.exitCode = 1;
  }
}
