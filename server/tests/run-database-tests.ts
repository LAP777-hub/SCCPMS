import { spawn } from 'node:child_process';

// Each suite owns its database pool and global provider mocks. Node's test runner
// gives each file a separate process so teardown cannot affect the next suite.
const runner = spawn(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1',
  'tests/workflows.integration.test.ts', 'tests/registration-database.test.ts', 'tests/account-deletion-database.test.ts', 'tests/vercel-database.test.ts', 'tests/otp-challenges-database.test.ts', 'tests/admin-overview-database.test.ts'], {
  env: { ...process.env, RUN_DATABASE_TESTS: '1' }, stdio: 'inherit',
});
process.exitCode = await new Promise<number>(resolve => {
  runner.once('error', () => resolve(1));
  runner.once('close', code => resolve(code ?? 1));
});
