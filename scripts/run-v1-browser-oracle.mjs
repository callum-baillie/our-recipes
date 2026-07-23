import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const specs = [
  'tests/e2e/setup.spec.ts',
  'tests/e2e/a11y.spec.ts',
  'tests/e2e/release-quality.spec.ts',
  'tests/e2e/pantry-inventory-management.spec.ts',
  'tests/e2e/pantry-recipe-planner.spec.ts',
  'tests/e2e/pantry-grocery-intake.spec.ts',
  'tests/e2e/pantry-cooking-confirmation.spec.ts',
  'tests/e2e/pantry-workflow.spec.ts',
  'tests/e2e/planner-redesign.spec.ts',
];
const tsxCli = fileURLToPath(import.meta.resolve('tsx/cli'));
const playwrightCli = fileURLToPath(import.meta.resolve('@playwright/test/cli'));

for (const spec of specs) {
  const prepare = spawnSync(process.execPath, [tsxCli, 'scripts/prepare-e2e.ts'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (prepare.status !== 0) process.exit(prepare.status ?? 1);

  const result = spawnSync(process.execPath, [playwrightCli, 'test', spec, '--workers=1'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, V1_RELEASE_ORACLE: 'true' },
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
