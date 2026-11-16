import { spawnSync } from 'node:child_process';
const compile = spawnSync(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.test.json'],
  { stdio: 'inherit' },
);
if (compile.status !== 0) process.exit(compile.status ?? 1);
const result = spawnSync(process.execPath, ['--test', '.test-dist/test/integration.test.js'], {
  stdio: 'inherit',
  env: { ...process.env, RUN_GATEWAY_TESTS: 'true' },
});
process.exit(result.status ?? 1);
