// Vercel builds must have usable public configuration before publishing assets.
export function frontendEnvironmentErrors(env) {
  const errors = [];
  for (const name of ['VITE_SUPABASE_URL', 'VITE_API_URL']) {
    try {
      const url = new URL(env[name]);
      if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error();
    } catch { errors.push(`${name} must be a public HTTPS origin without a path, credentials or query.`); }
  }
  const key = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!key) errors.push('Set VITE_SUPABASE_ANON_KEY to the public Supabase key.');
  else {
    let privateKey = key.startsWith('sb_secret_');
    try { privateKey ||= JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'service_role'; } catch { /* Publishable keys do not use JWT claims. */ }
    if (privateKey) errors.push('VITE_SUPABASE_ANON_KEY must be public; a service-role/secret key cannot be bundled.');
  }
  return errors;
}

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href && process.env.VERCEL === '1') {
  const errors = frontendEnvironmentErrors(process.env);
  if (errors.length) {
    console.error('Configure the frontend Vercel project environment, then rebuild:');
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  }
}
