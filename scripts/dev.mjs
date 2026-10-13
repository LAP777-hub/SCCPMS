import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(resolve(root, 'server/package.json'));
const env = require('dotenv').parse(readFileSync(resolve(root, 'server/.env')));
const frontend = new URL(env.FRONTEND_ORIGIN);
const children = [
  spawn(process.execPath, ['--watch', '--import', 'tsx', 'src/index.ts'], {
    cwd: resolve(root, 'server'),
    stdio: 'inherit',
  }),
  spawn(
    process.execPath,
    [
      resolve(root, 'node_modules/vite/bin/vite.js'),
      '--port',
      frontend.port || '5173',
      '--strictPort',
      ...process.argv.slice(2),
    ],
    { cwd: root, stdio: 'inherit' }
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const child of children) {
  child.on('error', error => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', code => stop(code ?? 0));
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
