import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const tsx = fileURLToPath(import.meta.resolve('tsx/cli'));
const playwright = fileURLToPath(import.meta.resolve('@playwright/test/cli'));
function run(args, env = {}) {
  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// Run only after unit/integration gates: this intentionally resets synthetic .test-data.
run([tsx, 'scripts/prepare-e2e.ts']);
run(['--conditions=react-server', '--import', 'tsx', 'tests/fixtures/seed-post-review.ts']);
run(
  [
    playwright,
    'test',
    'tests/e2e/workflow-backlog.spec.ts',
    'tests/e2e/ai-completion.spec.ts',
    'tests/e2e/post-review-chat.spec.ts',
    'tests/e2e/rv-action-review.spec.ts',
    'tests/e2e/rv-shopping-scan.spec.ts',
    'tests/e2e/post-review-core.spec.ts',
    'tests/e2e/post-review-images.spec.ts',
    'tests/e2e/post-review-settings.spec.ts',
    'tests/e2e/settings-nutrition-completion.spec.ts',
    'tests/e2e/catalog-post-review.spec.ts',
    'tests/e2e/recipe-image-review.spec.ts',
    'tests/e2e/offline-update-refinement.spec.ts',
    '--workers=1',
    '--retries=0',
  ],
  { V1_RELEASE_ORACLE: 'true' },
);
// WebAuthn RP IDs must be domains, not the primary oracle's raw IPv4 host.
// Use a fresh synthetic database so the independent sign-in scenario does not
// inherit the main suite's real authentication rate-limit counters.
// Origin and throttling checks stay enabled.
run([tsx, 'scripts/prepare-e2e.ts']);
run(['--conditions=react-server', '--import', 'tsx', 'tests/fixtures/seed-post-review.ts']);
run([playwright, 'test', 'tests/e2e/post-review-auth.spec.ts', '--workers=1', '--retries=0'], {
  V1_RELEASE_ORACLE: 'true',
  BORD_E2E_ORIGIN: 'http://localhost:3100',
});
