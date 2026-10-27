/** Local synthetic fixture only. Refuses to run against an existing/non-demo database. */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { getDatabase, closeDatabaseConnection, ensureDatabase } from '@/lib/db/client';
import {
  households,
  pantryProductIdentifiers,
  recipeIngredientGroups,
  recipeIngredientProductMappings,
  recipeIngredients,
  recipes,
} from '@/lib/db/schema';
import { pantryBatchInputSchema, pantryProductInputSchema } from '@/lib/domain/pantry';
import { prepareProfileEnrollment } from '@/lib/services/auth-service';
import { registerScannerStation } from '@/lib/services/scanner-station-service';
import { createManualShoppingList } from '@/lib/services/planning-service';
import { createAdminApiKey } from '@/lib/services/api-key-service';
import { completeSetupWithResult } from '@/lib/services/household-service';
import {
  createPantryBatch,
  createPantryProduct,
  ensureDefaultPantryLocations,
  listPantryLocations,
} from '@/lib/services/pantry-service';

async function main() {
  const demoRoot = resolve('.test-data/scanner-demo');
  const database = resolve(process.env.DATABASE_URL ?? '');
  if (database !== resolve(demoRoot, 'bord.db'))
    throw new Error(
      'Seed requires a fresh .test-data/scanner-demo/bord.db. It never resets an existing database.',
    );
  const bridgeRoot = process.argv[2];
  if (!bridgeRoot) throw new Error('Pass the local scanner project directory.');
  ensureDatabase();
  if (
    getDatabase().select().from(households).get() ||
    existsSync(resolve(bridgeRoot, 'var/dev.env'))
  )
    throw new Error('An existing demo household or scanner configuration will not be overwritten.');
  const passphrase = randomBytes(24).toString('base64url');
  const enrollment = await prepareProfileEnrollment(
    'Scanner demo',
    { email: 'scanner-demo@example.test', passphrase },
    'admin',
  );
  const setup = completeSetupWithResult(
    {
      kitchenName: 'Scanner demo kitchen',
      profile: {
        displayName: 'Scanner demo',
        color: '#637A45',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-US',
        timezone: 'America/Chicago',
      },
    },
    [enrollment],
  );
  const profileId = setup.state.profiles[0]!.id;
  ensureDefaultPantryLocations(profileId);
  const locationId = listPantryLocations().find(
    (location) => location.storageType === 'pantry',
  )!.id;
  const productId = createPantryProduct(
    pantryProductInputSchema.parse({
      displayName: 'Demo lentils',
      defaultInventoryUnit: 'g',
      defaultPackageAmount: 500,
      defaultPackageUnit: 'g',
    }),
    profileId,
  ).id;
  createPantryBatch(
    pantryBatchInputSchema.parse({
      productId,
      locationId,
      quantityRemaining: 10000,
      originalQuantity: 10000,
      unit: 'g',
    }),
    profileId,
  );
  const now = new Date();
  const recipeId = '00000000-0000-4000-8000-000000000201';
  const groupId = randomUUID();
  const ingredientId = randomUUID();
  getDatabase()
    .insert(pantryProductIdentifiers)
    .values({
      id: randomUUID(),
      productId,
      identifierType: 'upc_a',
      value: '012345678905',
      normalizedValue: '00012345678905',
      verified: true,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  getDatabase()
    .insert(recipes)
    .values({
      id: recipeId,
      title: 'Demo lentil soup',
      summary:
        'Synthetic recipe for testing the barcode scanner. Each batch uses 200 g of demo lentils.',
      status: 'active',
      servings: '2',
      prepMinutes: 0,
      cookMinutes: 0,
      restMinutes: 0,
      difficulty: '',
      cuisine: '',
      category: '',
      tips: '',
      sharedNotes: '',
      createdByProfileId: profileId,
      lastEditedByProfileId: profileId,
      currentRevision: 1,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  getDatabase()
    .insert(recipeIngredientGroups)
    .values({ id: groupId, recipeId, position: 0, name: '' })
    .run();
  getDatabase()
    .insert(recipeIngredients)
    .values({
      id: ingredientId,
      recipeId,
      groupId,
      position: 0,
      quantity: 200,
      unit: 'g',
      item: 'Demo lentils',
      note: '',
    })
    .run();
  getDatabase()
    .insert(recipeIngredientProductMappings)
    .values({
      recipeIngredientId: ingredientId,
      productId,
      matchType: 'manual',
      compatibleVariant: true,
      isOptional: false,
      mappedByProfileId: profileId,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const { secret, apiKey } = await createAdminApiKey({
    userId: enrollment.user.id,
    profileId,
    name: 'Local scanner fixture',
    expiresInDays: 30,
    permissions: {
      pantry: ['read', 'create', 'update'],
      recipes: ['read', 'create', 'update'],
      mealPlans: ['read', 'update'],
      shoppingLists: ['read', 'create', 'update'],
    },
  });
  registerScannerStation(
    {
      kind: 'session',
      userId: enrollment.user.id,
      profileId,
      linkedProfileId: profileId,
      role: 'admin',
      accountRole: 'admin',
      activeProfileRole: 'admin',
      sessionId: null,
      apiKeyId: null,
    },
    { id: 'dev-kitchen', name: 'Development kitchen', apiKeyId: apiKey.id, scannerQuota: true },
  );
  createManualShoppingList('Demo groceries', profileId);
  mkdirSync(resolve(bridgeRoot, 'var'), { recursive: true, mode: 0o700 });
  writeFileSync(
    resolve(bridgeRoot, 'var/dev.env'),
    `BORD_URL=https://bord-scanner.dev.app.devbox\nBORD_API_KEY=${secret}\nSTATION_ID=dev-kitchen\nSCANNER_DATABASE=${resolve(bridgeRoot, 'var/dev-scanner.sqlite')}\nSCANNER_DEVICE=/dev/input/by-id/usb-0581_011c-event-kbd\nBORD_CA_FILE=/srv/devbox-data/users/dev/.config/tower/Tower-Caddy-Root.crt\n`,
    { mode: 0o600, flag: 'wx' },
  );
  writeFileSync(
    resolve(bridgeRoot, 'var/demo-access.txt'),
    `Development synthetic Bòrd: https://bord-scanner.dev.app.devbox\nEmail: scanner-demo@example.test\nPassphrase: ${passphrase}\n`,
    { mode: 0o600 },
  );
  writeFileSync(
    resolve(bridgeRoot, 'var/demo-cards.json'),
    JSON.stringify(
      [
        ['DEMO: make lentil soup (2 servings)', `BORD:1:RECIPE:${recipeId}:2:1`],
        ['DEMO: lentils package (500 g)', '012345678905'],
        ['DEMO: pantry location', `BORD:1:LOCATION:${locationId}`],
      ],
      null,
      2,
    ),
  );
  closeDatabaseConnection();
  console.log(
    'Synthetic local Bòrd fixture created. Scanner credentials saved privately; no Tower changes.',
  );
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Demo setup failed');
  process.exitCode = 1;
});
