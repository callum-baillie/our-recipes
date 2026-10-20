// Deterministic local browser fixture, never a production onboarding shortcut.
import { resolve } from 'node:path';
process.env.DATA_DIR = resolve('.test-data/e2e-data');
process.env.DATABASE_URL = resolve('.test-data/e2e-data/our-recipes.db');
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:3100';
process.env.APP_ORIGIN = 'http://127.0.0.1:3100';
process.env.COOKIE_SECRET = 'test-cookie-secret-that-is-long-enough-for-hmac';
process.env.BETTER_AUTH_SECRET = 'browser-test-auth-secret-with-at-least-32-characters';
process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = 'false';
async function seed() {
  const { getHouseholdState, completeSetupWithResult } =
    await import('../../src/lib/services/household-service');
  const { prepareProfileEnrollment } = await import('../../src/lib/services/auth-service');
  const { defaultProfileInput } = await import('../../src/lib/domain/setup');
  const { closeDatabaseConnection } = await import('../../src/lib/db/client');
  if (!getHouseholdState().household) {
    completeSetupWithResult(
      {
        kitchenName: 'Workflow refinement fixture',
        profile: { ...defaultProfileInput, displayName: 'Maya' },
        firstRecipeChoice: 'example',
      },
      [
        await prepareProfileEnrollment(
          'Maya',
          {
            email: 'workflow-refinement-fixture-maya@example.test',
            passphrase: 'correct horse battery table',
          },
          'admin',
        ),
      ],
    );
  }
  closeDatabaseConnection();
  console.log('Synthetic post-review browser fixture ready.');
}
void seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
