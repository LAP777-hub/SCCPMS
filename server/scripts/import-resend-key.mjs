import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

// Accept a key through a pipe, never a shell argument or echoed terminal input.
// This setup only reads provider configuration; it never sends an email.
const environmentFile = fileURLToPath(new URL('../.env', import.meta.url));
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const input = await new Promise(resolve => {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    buffer += chunk.replace(/\r/g, '\n');
    if (buffer.includes('\n')) { process.stdin.pause(); resolve(buffer.split('\n')[0].trim()); }
  });
  process.stdin.on('end', () => resolve(buffer.trim()));
});
if (process.stdin.isTTY) process.stdin.setRawMode(false);
let key = input;
const half = key.length / 2;
const duplicated = Number.isInteger(half) && key.slice(0, half) === key.slice(half) && key.startsWith('re_');
if (duplicated) key = key.slice(0, half);
if (!/^re_[A-Za-z0-9_-]{20,}$/.test(key)) {
  console.error('A full unmasked Resend API key is required. Configuration unchanged.');
  process.exitCode = 1;
} else {
  try {
    const response = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => null);
    const restricted = response.status === 403 && data?.name === 'restricted_api_key';
    if (!response.ok && !restricted) {
      console.error(`Resend rejected the credential check (HTTP ${response.status}). Configuration unchanged.`);
      process.exitCode = 1;
    } else {
      const current = await readFile(environmentFile, 'utf8');
      const existing = parse(current);
      const verified = Array.isArray(data?.data) ? data.data.filter(domain =>
        domain.status === 'verified' && domain.capabilities?.sending !== 'disabled' &&
        typeof domain.name === 'string' && /^[a-z0-9.-]+$/i.test(domain.name)
      ) : [];
      const configuredDomain = existing.RESEND_FROM_EMAIL?.match(/@([^<>\s]+)>?$/)?.[1]?.toLowerCase();
      const domain = verified.find(item => item.name.toLowerCase() === configuredDomain)
        ?? verified.find(item => item.name.toLowerCase() === 'spu.ac.za') ?? verified[0];
      const from = domain
        ? configuredDomain === domain.name.toLowerCase() ? existing.RESEND_FROM_EMAIL : `SCCPMS <login@${domain.name.toLowerCase()}>`
        : existing.RESEND_FROM_EMAIL || 'SCCPMS <onboarding@resend.dev>';
      function set(content, name, value) {
        const expression = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=.*$`, 'gm');
        const line = `${name}=${JSON.stringify(value)}`;
        return expression.test(content) ? content.replace(expression, () => line) : `${content.trimEnd()}\n${line}\n`;
      }
      await writeFile(environmentFile, set(set(current, 'RESEND_API_KEY', key), 'RESEND_FROM_EMAIL', from), { mode: 0o600 });
      console.log(JSON.stringify({ credentialsSaved: true, duplicatedInputCorrected: duplicated, credentialCheck: restricted ? 'sending-only key; domain access restricted' : 'accepted', verifiedSendingDomains: verified.length, senderMode: domain ? 'verified domain' : 'existing sender or owner-only test sender', emailsSent: 0 }));
    }
  } catch {
    console.error('Resend configuration could not complete. Check network and file access; no email sent.');
    process.exitCode = 1;
  }
}
