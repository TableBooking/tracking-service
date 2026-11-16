import { spawnSync } from 'node:child_process';
if (!process.env.BROKER_TEST_URL)
  throw new Error(
    'Set BROKER_TEST_URL to a development broker; queues/exchanges use an isolated test prefix',
  );
const compile = spawnSync(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.test.json'],
  { stdio: 'inherit' },
);
if (compile.status !== 0) process.exit(compile.status ?? 1);
const result = spawnSync(process.execPath, ['--test', '.test-dist/test/integration.test.js'], {
  stdio: 'inherit',
  env: { ...process.env, RUN_BROKER_TESTS: 'true' },
});
process.exit(result.status ?? 1);
