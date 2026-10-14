import 'dotenv/config';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

export const developmentEmailSender = 'SCCPMS <onboarding@resend.dev>';

export function validResendKey(value) {
  return typeof value === 'string' && /^re_[A-Za-z0-9_-]{20,}$/.test(value.trim());
}

export function emailSender(value) {
  if (typeof value !== 'string' || value.length > 320 || /[\r\n]/.test(value)) return null;
  const match = value.trim().match(/^[^<>]+<([^<>]+)>$/);
  const address = (match ? match[1] : value).trim().toLowerCase();
  if (!z.string().email().max(254).safeParse(address).success) return null;
  const domain = address.split('@')[1].toLowerCase();
  return { domain, testDomain: domain === 'resend.dev' || domain.endsWith('.resend.dev'),
    reservedDomain: domain === 'localhost' || /\.(invalid|example|test)$/.test(domain) };
}

// GET requests only. No email, DNS mutation, or provider key creation is performed.
export async function checkEmailConfiguration(settings, fetcher = fetch) {
  const sender = emailSender(settings.fromEmail);
  const summary = {
    ok: false,
    keyConfigured: Boolean(settings.apiKey?.trim()),
    keyFormatValid: validResendKey(settings.apiKey),
    senderValid: Boolean(sender),
    testSender: sender?.testDomain ?? false,
    domainAccess: 'not_checked',
    senderDomainVerified: false,
    senderSendingEnabled: false,
    reason: 'configuration',
  };
  if (!summary.keyFormatValid || !sender || (settings.production && (sender.testDomain || sender.reservedDomain))) return summary;
  let cursor;
  const seen = new Set();
  try {
    for (let page = 0; page < 10; page++) {
      const endpoint = new URL('https://api.resend.com/domains');
      endpoint.searchParams.set('limit', '100');
      if (cursor) endpoint.searchParams.set('after', cursor);
      const response = await fetcher(endpoint, {
        method: 'GET',
        headers: { Authorization: `Bearer ${settings.apiKey.trim()}`, Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      summary.httpStatus = response.status;
      if (!response.ok) {
        summary.domainAccess = response.status === 403 ? 'permission_required' : 'rejected';
        summary.reason = response.status === 403 ? 'domain_read_permission' : 'provider_rejected';
        return summary;
      }
      const payload = await response.json().catch(() => null);
      if (!Array.isArray(payload?.data)) {
        summary.reason = 'invalid_provider_response';
        return summary;
      }
      summary.domainAccess = 'accepted';
      const domain = payload.data.find(item => typeof item?.name === 'string' && item.name.toLowerCase() === sender.domain);
      if (domain) {
        summary.senderDomainVerified = domain.status === 'verified';
        summary.senderSendingEnabled = domain.capabilities?.sending === 'enabled';
        summary.ok = summary.senderDomainVerified && summary.senderSendingEnabled;
        summary.reason = summary.ok ? 'ready' : 'sender_domain_not_ready';
        return summary;
      }
      if (payload.has_more !== true) {
        summary.ok = !settings.production && sender.testDomain;
        summary.reason = summary.ok ? 'development_sender_restricted' : 'sender_domain_not_found';
        return summary;
      }
      const last = payload.data.at(-1)?.id;
      if (typeof last !== 'string' || seen.has(last)) {
        summary.reason = 'invalid_provider_response';
        return summary;
      }
      seen.add(last);
      cursor = last;
    }
    summary.reason = 'domain_lookup_incomplete';
  } catch {
    summary.reason = 'network_error_or_timeout';
  }
  return summary;
}

async function main() {
  const summary = await checkEmailConfiguration({
    apiKey: process.env.RESEND_API_KEY,
    fromEmail: process.env.RESEND_FROM_EMAIL,
    production: process.env.NODE_ENV === 'production' || process.argv.includes('--production'),
  });
  // Only readiness/status categories are printed; never keys, addresses, codes or provider payloads.
  console.log(`Resend API key configured: ${summary.keyConfigured ? 'yes' : 'no'}`);
  console.log(`Full API key format: ${summary.keyFormatValid ? 'valid' : 'missing or invalid'}`);
  console.log(`Sender format: ${summary.senderValid ? 'valid' : 'invalid'}`);
  console.log(`Sender kind: ${!summary.senderValid ? 'not configured or invalid' : summary.testSender ? 'development test domain' : 'custom domain'}`);
  console.log(`Domain access: ${summary.domainAccess}${summary.httpStatus ? ` (HTTP ${summary.httpStatus})` : ''}`);
  console.log(`Sender domain verified: ${summary.senderDomainVerified ? 'yes' : 'no'}`);
  console.log(`Sender sending enabled: ${summary.senderSendingEnabled ? 'yes' : 'no'}`);
  console.log(`Readiness status: ${summary.reason}`);
  if (!summary.keyConfigured || !summary.keyFormatValid)
    console.error('Supply the full RESEND_API_KEY in server/.env or hosting secrets. Masked CSV tokens cannot authenticate.');
  if (summary.domainAccess === 'permission_required')
    console.error('A sending-only key cannot read domains. Check the verified sender in the Resend dashboard or use a domain-readable key for this check.');
  if (summary.testSender)
    console.log('The development test sender is limited to the Resend account owner. General delivery needs a verified custom sending domain.');
  console.log('No emails sent. Domain readiness does not prove inbox delivery.');
  if (!summary.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
