#!/usr/bin/env node

// Scan Git's index, not working copies: unstaged edits cannot hide staged secrets.
// Output contains only paths, line numbers, finding types and aggregate counts.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const privateSetting = /SECRET|PASSWORD|PRIVATE|TOKEN|RESEND_API_KEY|DATABASE(?:_EVENTS)?_URL|SERVICE_ROLE/;
const placeholder = /(?:your[_-]|replace[_-]|placeholder|changeme|change[_-]me|dummy|fixture|example|redacted|masked|\[[^\]]+\]|<[^>]+>)/i;
const testToken = /^(?:re_|sbp_|sb_secret_)(?:test|unit|ci|mock|fake)(?:[_-]|[0-9])/i;
const excludedPublicSetting = /^(?:VITE_|NEXT_PUBLIC_)|ANON|PUBLISHABLE/;

function isPlaceholder(value) {
  return placeholder.test(value) || testToken.test(value);
}

export function forbiddenTrackedPath(path) {
  const normalized = path.replaceAll('\\', '/');
  const filename = basename(normalized);
  if (/(?:^|\/)\.vercel(?:\/|$)/i.test(normalized)) return 'tracked local hosting metadata';
  if (/^\.env(?:$|\.)/i.test(filename) && !/^\.env(?:\.[a-z0-9_-]+)*\.example$/i.test(filename)) {
    return 'tracked private environment file';
  }
  if (/^credentials?(?:[_ -].*)?\.(?:txt|md|json|csv)$/i.test(filename) || /^api-keys-.*\.csv$/i.test(filename)) {
    return 'tracked credential export or note';
  }
  if (/\.(?:zip|7z|rar|tar|tgz|p12|pfx)$/i.test(filename)) return 'tracked archive or credential container';
  if (/\.(?:sqlite3?|db|dump|bak|sql\.gz)$/i.test(filename) || /(?:^|\/)(?:backups?|dumps?)\//i.test(normalized)) {
    return 'tracked database export or backup';
  }
  return undefined;
}

function parseEnvironment(raw) {
  const entries = [];
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    entries.push([match[1], value]);
  }
  return entries;
}

export function privateCredentialReferences(entries) {
  const references = new Map();
  for (const [key, value] of entries) {
    if (!privateSetting.test(key) || excludedPublicSetting.test(key) || !value) continue;
    if (value.length >= 12 && !isPlaceholder(value)) references.set(value, 'exact active private credential');
    if (/DATABASE.*URL/.test(key)) {
      try {
        const password = new URL(value).password;
        for (const representation of [password, decodeURIComponent(password)]) {
          if (representation.length >= 8 && !isPlaceholder(representation)) {
            references.set(representation, 'exact active database password');
          }
        }
      } catch {
        // Invalid local configuration is handled by env validation, without logging it.
      }
    }
  }
  return references;
}

function localPrivateCredentials(root) {
  // CI deliberately uses public/dummy environment values. Exact comparisons
  // use only optional ignored local files; no private env files is valid in CI.
  const entries = [];
  for (const path of ['.env', 'server/.env']) {
    const absolute = resolve(root, path);
    if (existsSync(absolute)) entries.push(...parseEnvironment(readFileSync(absolute, 'utf8')));
  }
  return privateCredentialReferences(entries);
}

export function scanText(path, content, privateCredentials = new Map()) {
  const findings = [];
  if (content.includes('\0')) return findings;
  const add = (line, type) => findings.push({ path, line, type });
  content.split(/\r?\n/).forEach((text, index) => {
    const line = index + 1;
    for (const [credential, type] of privateCredentials) if (text.includes(credential)) add(line, type);
    if (/-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/.test(text)) add(line, 'private key material');
    for (const match of text.matchAll(/\b(?:re_[A-Za-z0-9_-]{20,}|sbp_[A-Za-z0-9]{40,}|sb_secret_[A-Za-z0-9_-]{20,})\b/g)) {
      if (!isPlaceholder(match[0])) add(line, match[0].startsWith('re_') ? 'Resend API credential' : 'Supabase private credential');
    }
    for (const match of text.matchAll(/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16})\b/g)) {
      if (!isPlaceholder(match[0])) add(line, 'provider credential token');
    }
    for (const match of text.matchAll(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g)) {
      try {
        const payload = JSON.parse(Buffer.from(match[0].split('.')[1], 'base64url').toString('utf8'));
        if (payload.role === 'service_role') add(line, 'Supabase service-role JWT');
      } catch {
        // Ordinary text that resembles a JWT is not evidence of a credential.
      }
    }
    for (const match of text.matchAll(/(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s"'<>`]+/g)) {
      try {
        const uri = new URL(match[0]);
        const password = decodeURIComponent(uri.password);
        const developmentHost = /^(?:localhost|127\.0\.0\.1|postgres|db|test_db|host)$/.test(uri.hostname);
        const examplePassword = /^(?:password|db_password|strong_password|secret)$/i.test(password);
        if (password && !isPlaceholder(password) && !examplePassword && !developmentHost) add(line, 'database credential URI');
      } catch {
        // Keep malformed URLs out of output as well.
      }
    }
  });
  return [...new Map(findings.map(finding => [JSON.stringify(finding), finding])).values()];
}

export function checkTrackedIndex(root = repositoryRoot) {
  const git = args => execFileSync('git', args, {
    cwd: root, encoding: undefined, maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const paths = [...new Set(git(['ls-files', '--cached', '-z']).toString('utf8').split('\0').filter(Boolean))];
  const privateCredentials = localPrivateCredentials(root);
  const findings = [];
  for (const path of paths) {
    const forbidden = forbiddenTrackedPath(path);
    if (forbidden) findings.push({ path, line: 0, type: forbidden });
    try {
      const contents = git(['show', `:${path}`]);
      // Certificates remain allowed; private key content is always scanned.
      if (!contents.includes(0)) findings.push(...scanText(path, contents.toString('utf8'), privateCredentials));
    } catch {
      findings.push({ path, line: 0, type: 'index file unreadable or merge unresolved' });
    }
  }
  return { scannedFiles: paths.length, findings };
}

function main() {
  if (process.argv.slice(2).some(argument => argument !== '--tracked')) {
    console.error('Usage: node scripts/check-publish-secrets.mjs [--tracked]');
    process.exitCode = 2;
    return;
  }
  try {
    const result = checkTrackedIndex();
    console.log(JSON.stringify({ status: result.findings.length ? 'failed' : 'passed', ...result }, null, 2));
    if (result.findings.length) process.exitCode = 1;
  } catch {
    console.error(JSON.stringify({ status: 'failed', type: 'publish secret scan unavailable' }));
    process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
