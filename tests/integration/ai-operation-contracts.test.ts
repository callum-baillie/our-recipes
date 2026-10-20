import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
const origin = 'http://localhost:3000';
const passphrase = 'synthetic fixture passphrase';
let auth: (typeof import('@/lib/auth/server'))['auth'];
let authentication: typeof import('@/lib/services/auth-service');
let db: typeof import('@/lib/db/client');
let schema: typeof import('@/lib/db/schema');
let actions: typeof import('@/lib/services/ai-app-action-service');
let settings: typeof import('@/lib/services/ai-settings-service');
let principal: import('@/lib/services/auth-service').RequestPrincipal;
let cookie = '';
let threadId = '';
function request(path: string, method = 'POST', body?: unknown, authenticated = true) {
  return new Request(`${origin}/api/v1${path}`, {
    method,
    headers: { origin, 'content-type': 'application/json', ...(authenticated ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function signIn() {
  const response = await auth.api.signInEmail({
    body: { email: 'ai-contracts@example.test', password: passphrase },
    headers: new Headers({ origin }),
    asResponse: true,
  });
  expect(response.status).toBe(200);
  cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  principal = (await authentication.getAuthenticatedSessionPrincipal(
    request('/ai/chat/threads', 'GET'),
  ))!;
}
beforeAll(async () => {
  vi.stubEnv('DATABASE_URL', ':memory:');
  vi.stubEnv('DATA_DIR', '.test-data/ai-operation-contracts');
  vi.stubEnv('BETTER_AUTH_URL', origin);
  vi.stubEnv('APP_ORIGIN', origin);
  vi.stubEnv('COOKIE_SECRET', 'synthetic-cookie-secret-at-least-thirty-two');
  vi.stubEnv('BETTER_AUTH_SECRET', 'synthetic-auth-secret-at-least-thirty-two');
  vi.stubEnv('AUTH_REQUIRE_EMAIL_VERIFICATION', 'false');
  vi.stubEnv('OPENAI_API_KEY', '');
  db = await import('@/lib/db/client');
  db.resetDatabaseForTests();
  ({ auth } = await import('@/lib/auth/server'));
  schema = await import('@/lib/db/schema');
  authentication = await import('@/lib/services/auth-service');
  const enrollment = await authentication.prepareProfileEnrollment(
    'Alex',
    { email: 'ai-contracts@example.test', passphrase },
    'admin',
  );
  const household = await import('@/lib/services/household-service');
  household.completeSetupWithResult(
    {
      kitchenName: 'Synthetic AI kitchen',
      profile: {
        displayName: 'Alex',
        color: '#637A45',
        avatarUrl: '',
        units: 'metric',
        temperatureUnit: 'C',
        locale: 'en-GB',
        timezone: 'Europe/London',
      },
    },
    [enrollment],
  );
  await signIn();
  settings = await import('@/lib/services/ai-settings-service');
  actions = await import('@/lib/services/ai-app-action-service');
  const chat = await import('@/lib/services/ai-chat-service');
  threadId = chat.createAiChatThread(principal.profileId).id;
}, 30_000);
afterAll(() => {
  db?.resetDatabaseForTests();
  vi.unstubAllEnvs();
});
function setSharing(values: Partial<import('@/lib/domain/ai-assistant').AiDataPolicy>) {
  const policy = settings.getAiDataPolicy(principal.profileId);
  settings.updateAiSettings(principal.profileId, { dataPolicy: { ...policy, ...values } });
}
describe('authorized AI operations and prompt contracts', () => {
  it('guards administrative handlers directly before reading archives or executing recovery', async () => {
    const backups = await import('@/app/api/v1/backups/route');
    const preview = await import('@/app/api/v1/backups/[backupId]/route');
    const download = await import('@/app/api/v1/backups/[backupId]/download/route');
    const restore = await import('@/app/api/v1/backups/[backupId]/restore/route');
    const reset = await import('@/app/api/v1/settings/fresh-install/route');
    const diagnostics = await import('@/app/api/v1/diagnostics/route');
    const identity = await import('@/app/api/v1/settings/route');
    const context = { params: Promise.resolve({ backupId: 'unread-fixture-archive' }) };
    const denied = async (authenticated: boolean, status: number) => {
      const r = (path: string, method: string) => request(path, method, {}, authenticated);
      for (const response of [
        await backups.GET(request('/backups', 'GET', undefined, authenticated)),
        await backups.POST(r('/backups', 'POST')),
        await preview.GET(
          request('/backups/unread-fixture-archive', 'GET', undefined, authenticated),
          context,
        ),
        await download.GET(
          request('/backups/unread-fixture-archive/download', 'GET', undefined, authenticated),
          context,
        ),
        await restore.POST(r('/backups/unread-fixture-archive/restore', 'POST'), context),
        await reset.POST(r('/settings/fresh-install', 'POST')),
        await diagnostics.POST(r('/diagnostics', 'POST')),
        await identity.PATCH(r('/settings', 'PATCH')),
      ])
        expect(response.status).toBe(status);
    };
    await denied(false, 401);
    const childEnrollment = await authentication.prepareProfileEnrollment(
      'Child fixture',
      { email: 'admin-boundary-child@example.test', passphrase },
      'child',
    );
    const household = await import('@/lib/services/household-service');
    const { profileOnboardingSchema } = await import('@/lib/domain/setup');
    household.onboardProfileWithEnrollment(
      profileOnboardingSchema.parse({
        profile: {
          displayName: 'Child fixture',
          color: '#637A45',
          units: 'metric',
          temperatureUnit: 'C',
          locale: 'en-GB',
          timezone: 'UTC',
        },
        role: 'child',
        nutrition: { profileType: 'dependent' },
      }),
      childEnrollment,
    );
    const childResponse = await auth.api.signInEmail({
      body: { email: 'admin-boundary-child@example.test', password: passphrase },
      headers: new Headers({ origin }),
      asResponse: true,
    });
    expect(childResponse.status).toBe(200);
    const administratorCookie = cookie;
    cookie = childResponse.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    try {
      await denied(true, 403);
    } finally {
      cookie = administratorCookie;
    }
  });
  it('rejects direct signed-out private AI handlers before reading cookie-derived objects', async () => {
    const threads = await import('@/app/api/v1/ai/chat/threads/route');
    const thread = await import('@/app/api/v1/ai/chat/threads/[threadId]/route');
    const prompts = await import('@/app/api/v1/ai/prompts/route');
    expect((await threads.GET(request('/ai/chat/threads', 'GET', undefined, false))).status).toBe(
      401,
    );
    expect(
      (
        await thread.GET(request(`/ai/chat/threads/${threadId}`, 'GET', undefined, false), {
          params: Promise.resolve({ threadId }),
        })
      ).status,
    ).toBe(401);
    expect((await prompts.GET(request('/ai/prompts', 'GET', undefined, false))).status).toBe(401);
  });
  it('binds a dependent list operation to the acknowledged returned ID with unrelated sharing off', async () => {
    setSharing({
      shareShoppingLists: true,
      sharePantry: false,
      shareSharedRecipes: false,
      shareMealPlans: false,
      shareRecipePreferences: false,
    });
    const source = request('/ai/app-actions');
    const { appAction } = await actions.prepareAppActions(principal, source, threadId, {
      title: 'Create a list and add two requested items',
      actions: [
        {
          operationId: 'createOrGenerateShoppingList',
          parametersJson: '{}',
          bodyJson: JSON.stringify({ kind: 'manual', name: 'Fixture market list' }),
        },
        {
          operationId: 'addShoppingListNamesBulk',
          parametersJson: JSON.stringify({ listId: '' }),
          bodyJson: JSON.stringify({ items: ['Coffee', 'Oats'] }),
          bindings: [{ fromStep: 0, result: 'list.id', target: 'parameters.listId' }],
        },
      ],
    });
    const input = { id: appAction.id, version: appAction.version, decision: 'apply' };
    const result = await actions.confirmAppActions(principal, source, input);
    expect(result.status).toBe('applied');
    expect(result.results).toHaveLength(2);
    const planning = await import('@/lib/services/planning-service');
    const list = planning.listShoppingLists().find((item) => item.name === 'Fixture market list')!;
    expect(
      planning
        .getShoppingList(list.id)
        ?.items.map((item) => item.item)
        .sort(),
    ).toEqual(['Coffee', 'Oats']);
    expect(result.results[0].href).toBe(`/lists/${list.id}`);
    const replay = await actions.confirmAppActions(principal, source, input);
    expect(replay.replayed).toBe(true);
    expect(
      planning.listShoppingLists().filter((item) => item.name === 'Fixture market list'),
    ).toHaveLength(1);
    expect(planning.getShoppingList(list.id)?.items).toHaveLength(2);
  });
  it('executes recipe, collection, product and meal dependencies using actual response IDs', async () => {
    setSharing({ shareSharedRecipes: true, shareMealPlans: true, sharePantry: true });
    const { emptyRecipeInput } = await import('@/lib/domain/recipe');
    const source = request('/ai/app-actions');
    const { appAction } = await actions.prepareAppActions(principal, source, threadId, {
      title: 'Create and connect synthetic records',
      actions: [
        {
          operationId: 'createRecipe',
          parametersJson: '{}',
          bodyJson: JSON.stringify({
            ...emptyRecipeInput,
            title: 'Dependency soup',
            servings: '4',
            ingredientGroups: [
              { name: '', ingredients: [{ quantity: 1, unit: 'can', item: 'tomatoes', note: '' }] },
            ],
            instructionSections: [{ title: '', steps: ['Simmer.'] }],
          }),
        },
        {
          operationId: 'createCollection',
          parametersJson: '{}',
          bodyJson: JSON.stringify({ name: 'Dependency collection' }),
        },
        {
          operationId: 'addRecipeToCollection',
          parametersJson: JSON.stringify({ collectionId: '' }),
          bodyJson: JSON.stringify({ recipeId: '' }),
          bindings: [
            { fromStep: 0, result: 'recipe.id', target: 'body.recipeId' },
            { fromStep: 1, result: 'collection.id', target: 'parameters.collectionId' },
          ],
        },
        {
          operationId: 'createPantryProduct',
          parametersJson: '{}',
          bodyJson: JSON.stringify({ displayName: 'Dependency tomatoes' }),
        },
        {
          operationId: 'updatePantryProduct',
          parametersJson: JSON.stringify({ productId: '' }),
          bodyJson: JSON.stringify({ displayName: 'Dependency tomatoes reviewed' }),
          bindings: [{ fromStep: 3, result: 'product.id', target: 'parameters.productId' }],
        },
        {
          operationId: 'addMealPlanEntry',
          parametersJson: '{}',
          bodyJson: JSON.stringify({
            plannedFor: '2026-11-02',
            meal: 'dinner',
            recipeId: '',
            servings: 4,
            note: '',
          }),
          bindings: [{ fromStep: 0, result: 'recipe.id', target: 'body.recipeId' }],
        },
        {
          operationId: 'updateMealPlanEntry',
          parametersJson: JSON.stringify({ entryId: '' }),
          bodyJson: JSON.stringify({ status: 'skipped' }),
          bindings: [{ fromStep: 5, result: 'meal.id', target: 'parameters.entryId' }],
        },
      ],
    });
    const result = await actions.confirmAppActions(principal, source, {
      id: appAction.id,
      version: appAction.version,
      decision: 'apply',
    });
    expect(result.status, JSON.stringify(result.results)).toBe('applied');
    expect(result.results).toHaveLength(7);
    const recipeService = await import('@/lib/services/recipe-service');
    const saved = recipeService.listRecipes('Dependency soup')[0]!;
    const collections = await import('@/lib/services/collection-service');
    const collection = collections
      .listCollections()
      .find((x) => x.name === 'Dependency collection')!;
    expect(collections.getCollection(collection.id)?.recipes.map((x) => x.id)).toContain(saved.id);
    const pantry = await import('@/lib/services/pantry-service');
    expect(
      pantry.listPantryProducts().some((x) => x.displayName === 'Dependency tomatoes reviewed'),
    ).toBe(true);
    const planning = await import('@/lib/services/planning-service');
    const meal = planning
      .listPlannedMeals('2026-11-02', '2026-11-02')
      .find((x) => x.recipeId === saved.id)!;
    expect(meal.status).toBe('skipped');
    expect(meal.recipeRevision).toBe(1);
    const replay = await actions.confirmAppActions(principal, source, {
      id: appAction.id,
      version: appAction.version,
      decision: 'apply',
    });
    expect(replay.replayed).toBe(true);
    expect(recipeService.listRecipes('Dependency soup')).toHaveLength(1);
  });
  it('pins AI product intake to reviewed nutrition and preserves corrections and acknowledged replay', async () => {
    setSharing({ shareRawDiary: true });
    const pantry = await import('@/lib/services/pantry-service');
    const pantrySchemas = await import('@/lib/domain/pantry');
    const nutrition = await import('@/lib/services/nutrition-recipe-calculation-service');
    const intake = await import('@/lib/services/nutrition-intake-service');
    const { resolveNutritionHouseholdContext } =
      await import('@/lib/services/nutrition-household-profile-service');
    const household = resolveNutritionHouseholdContext({
      profileId: principal.linkedProfileId,
      source: 'auth-session',
    });
    const profileId = household.activeNutritionProfile.id;
    const product = pantry.createPantryProduct(
      pantrySchemas.pantryProductInputSchema.parse({
        displayName: 'AI pinned lentils',
        defaultInventoryUnit: 'g',
      }),
      principal.profileId,
    );
    const record = (amount: number, supersedesRecordId?: string) =>
      nutrition.appendManualProductNutritionRecord(product.id, {
        basisType: 'per_100g',
        basisAmount: 100,
        basisUnit: 'g',
        confidence: 1,
        completeness: 1,
        ...(supersedesRecordId ? { supersedesRecordId } : {}),
        values: [{ nutrientCode: 'energy_kcal', amount }],
      });
    const first = record(100);
    const body = {
      productId: product.id,
      quantity: 50,
      unit: 'g',
      occurredAt: '2026-10-20T18:00:00Z',
      mealSlot: 'dinner',
    };
    const prepare = (extra: Record<string, unknown> = {}) =>
      actions.prepareAppActions(principal, request('/ai/app-actions'), threadId, {
        title: 'Review lentil intake',
        actions: [
          {
            operationId: 'logProductNutrition',
            parametersJson: JSON.stringify({ profileId }),
            bodyJson: JSON.stringify({ ...body, ...extra }),
          },
        ],
      });
    const reviewed = (await prepare()).appAction;
    expect(reviewed.actions[0].body).toMatchObject({ expectedFoodNutritionRecordId: first.id });
    expect(reviewed.actions[0].changeLabel).toContain('basis 100 g');
    const second = record(200, first.id);
    await expect(prepare({ expectedFoodNutritionRecordId: first.id })).rejects.toThrow(
      /record is unavailable or changed/,
    );
    const changed = await actions.confirmAppActions(principal, request('/ai/app-actions'), {
      id: reviewed.id,
      version: reviewed.version,
      decision: 'apply',
    });
    expect(changed).toMatchObject({
      status: 'partial',
      results: [{ ok: false, state: 'failed', message: expect.stringMatching(/record changed/) }],
    });
    expect(
      intake.listNutritionIntakeRevisions(profileId, household.compatibilityPrincipalId),
    ).toHaveLength(0);
    const refreshed = (await prepare()).appAction;
    expect(refreshed.actions[0].body).toMatchObject({ expectedFoodNutritionRecordId: second.id });
    const applied = await actions.confirmAppActions(principal, request('/ai/app-actions'), {
      id: refreshed.id,
      version: refreshed.version,
      decision: 'apply',
    });
    expect(applied.status).toBe('applied');
    const saved = intake.listNutritionIntakeRevisions(
      profileId,
      household.compatibilityPrincipalId,
    )[0]!;
    expect(saved.foodNutritionRecordId).toBe(second.id);
    record(300, second.id);
    const replay = await actions.confirmAppActions(principal, request('/ai/app-actions'), {
      id: refreshed.id,
      version: refreshed.version,
      decision: 'apply',
    });
    expect(replay.replayed).toBe(true);
    expect(
      intake.listNutritionIntakeRevisions(profileId, household.compatibilityPrincipalId),
    ).toHaveLength(1);
    const correction = (
      await prepare({
        supersedesIntakeRevisionId: saved.id,
        revisionReason: 'Reviewed changed amount',
        quantity: 100,
      })
    ).appAction;
    expect(correction.actions[0].body).toMatchObject({ expectedFoodNutritionRecordId: second.id });
    const corrected = await actions.confirmAppActions(principal, request('/ai/app-actions'), {
      id: correction.id,
      version: correction.version,
      decision: 'apply',
    });
    expect(corrected.status).toBe('applied');
    expect(
      intake
        .listNutritionIntakeRevisions(profileId, household.compatibilityPrincipalId)
        .find((entry) => entry.state === 'corrected')?.foodNutritionRecordId,
    ).toBe(second.id);
    const legacy = (await prepare()).appAction;
    const row = db
      .getDatabase()
      .select()
      .from(schema.aiDecisionRecords)
      .where(eq(schema.aiDecisionRecords.id, legacy.id))
      .get()!;
    const legacyPayload = JSON.parse(row.resultJson);
    const legacyBody = JSON.parse(legacyPayload.actions[0].bodyJson);
    delete legacyBody.expectedFoodNutritionRecordId;
    legacyPayload.actions[0].bodyJson = JSON.stringify(legacyBody);
    db.getDatabase()
      .update(schema.aiDecisionRecords)
      .set({ resultJson: JSON.stringify(legacyPayload) })
      .where(eq(schema.aiDecisionRecords.id, legacy.id))
      .run();
    await expect(
      actions.confirmAppActions(principal, request('/ai/app-actions'), {
        id: legacy.id,
        version: legacy.version,
        decision: 'apply',
      }),
    ).rejects.toThrow(/older intake proposal/);
    expect(
      intake.listNutritionIntakeRevisions(profileId, household.compatibilityPrincipalId),
    ).toHaveLength(2);
  });
  it('requires fresh review for persisted legacy entry.id dependencies without applying a step', async () => {
    setSharing({ shareMealPlans: true });
    const source = request('/ai/app-actions');
    const { appAction } = await actions.prepareAppActions(principal, source, threadId, {
      title: 'Legacy dependency fixture',
      actions: [
        {
          operationId: 'addMealPlanEntry',
          parametersJson: '{}',
          bodyJson: JSON.stringify({
            plannedFor: '2026-11-03',
            meal: 'dinner',
            recipeId: '',
            title: 'Legacy meal',
            servings: 1,
            note: '',
          }),
        },
        {
          operationId: 'updateMealPlanEntry',
          parametersJson: JSON.stringify({ entryId: '' }),
          bodyJson: JSON.stringify({ status: 'skipped' }),
          bindings: [{ fromStep: 0, result: 'meal.id', target: 'parameters.entryId' }],
        },
      ],
    });
    const row = db
      .getDatabase()
      .select()
      .from(schema.aiDecisionRecords)
      .where(eq(schema.aiDecisionRecords.id, appAction.id))
      .get()!;
    db.getDatabase()
      .update(schema.aiDecisionRecords)
      .set({ resultJson: row.resultJson.replace('meal.id', 'entry.id') })
      .where(eq(schema.aiDecisionRecords.id, appAction.id))
      .run();
    await expect(
      actions.confirmAppActions(principal, source, {
        id: appAction.id,
        version: appAction.version,
        decision: 'apply',
      }),
    ).rejects.toThrow(/unsupported dependency contract/);
    const planning = await import('@/lib/services/planning-service');
    expect(
      planning.listPlannedMeals('2026-11-03', '2026-11-03').some((x) => x.title === 'Legacy meal'),
    ).toBe(false);
  });
  it('rejects forward or mismatched dependencies before creating any records', async () => {
    const planning = await import('@/lib/services/planning-service');
    const before = planning.listShoppingLists().length;
    await expect(
      actions.prepareAppActions(principal, request('/ai/app-actions'), threadId, {
        title: 'Invalid dependency',
        actions: [
          {
            operationId: 'addShoppingListNamesBulk',
            parametersJson: '{}',
            bodyJson: '{"items":["Coffee"]}',
            bindings: [{ fromStep: 1, result: 'list.id', target: 'parameters.listId' }],
          },
          {
            operationId: 'createOrGenerateShoppingList',
            parametersJson: '{}',
            bodyJson: '{"kind":"manual","name":"Must not exist"}',
          },
        ],
      }),
    ).rejects.toThrow(/earlier step/);
    expect(planning.listShoppingLists()).toHaveLength(before);
  });
  it('revalidates session authority after review and rejects a revoked session without writing', async () => {
    const source = request('/ai/app-actions');
    const { appAction } = await actions.prepareAppActions(principal, source, threadId, {
      title: 'Pending reviewed list',
      actions: [
        {
          operationId: 'createOrGenerateShoppingList',
          parametersJson: '{}',
          bodyJson: '{"kind":"manual","name":"Revoked session must not write"}',
        },
      ],
    });
    db.getDatabase()
      .delete(schema.session)
      .where(eq(schema.session.id, principal.sessionId!))
      .run();
    await expect(
      actions.confirmAppActions(principal, source, {
        id: appAction.id,
        version: appAction.version,
        decision: 'apply',
      }),
    ).rejects.toThrow(/session/);
    const planning = await import('@/lib/services/planning-service');
    expect(
      planning.listShoppingLists().some((item) => item.name === 'Revoked session must not write'),
    ).toBe(false);
    await signIn();
  });
  it('uses explicit read effects for POST catalog lookups and exposes the validated input contract', () => {
    const ops = actions.listAppActions(principal, 'food-data', 'readCatalogMeasures');
    expect(ops[0]).toMatchObject({ method: 'POST', effect: 'read', requiresReview: false });
    expect(ops[0].bodySchema).toHaveProperty('properties.reference');
  });
  it('applies reviewed dinners, generates a Pantry-aware list, and moves the saved meal without duplicate writes', async () => {
    setSharing({
      shareShoppingLists: true,
      sharePantry: true,
      shareSharedRecipes: true,
      shareMealPlans: true,
    });
    const pantry = await import('@/lib/services/pantry-service');
    const pantrySchemas = await import('@/lib/domain/pantry');
    const recipeService = await import('@/lib/services/recipe-service');
    const { recipeInputSchema } = await import('@/lib/domain/recipe');
    const planning = await import('@/lib/services/planning-service');
    const product = pantry.createPantryProduct(
      pantrySchemas.pantryProductInputSchema.parse({
        displayName: 'Grounded lentils',
        defaultInventoryUnit: 'g',
        defaultStorageType: 'pantry',
      }),
      principal.profileId,
    );
    pantry.ensureDefaultPantryLocations(principal.profileId);
    pantry.createPantryBatch(
      pantrySchemas.pantryBatchInputSchema.parse({
        productId: product.id,
        locationId: pantry.listPantryLocations()[0].id,
        quantityRemaining: 50,
        originalQuantity: 50,
        unit: 'g',
        expiryPrecision: 'unknown',
      }),
      principal.profileId,
    );
    const recipe = recipeService.createRecipe(
      recipeInputSchema.parse({
        title: 'Grounded lentil soup',
        summary: 'A synthetic cooked soup.',
        prepMinutes: 5,
        cookMinutes: 20,
        sourceName: '',
        sourceUrl: '',
        tags: [],
        servings: '2',
        ingredientGroups: [
          {
            name: '',
            ingredients: [
              {
                item: 'Grounded lentils',
                quantity: 200,
                unit: 'g',
                note: '',
                pantryProductId: product.id,
              },
            ],
          },
        ],
        instructionSections: [{ title: '', steps: ['Simmer until cooked.'] }],
      }),
      principal.profileId,
    );
    const meal = {
      kind: 'recipe',
      recipeId: recipe.id,
      servings: 2,
      meal: 'dinner',
      note: '',
      profileIds: [principal.profileId],
    };
    const source = request('/ai/app-actions');
    const proposal = await actions.prepareAppActions(principal, source, threadId, {
      title: 'Two reviewed dinners and the missing groceries',
      actions: [
        ...['2027-04-03', '2027-04-04'].map((plannedFor) => ({
          operationId: 'addMealPlanEntry',
          parametersJson: '{}',
          bodyJson: JSON.stringify({ ...meal, plannedFor }),
        })),
        {
          operationId: 'createOrGenerateShoppingList',
          parametersJson: '{}',
          bodyJson: JSON.stringify({
            kind: 'planner',
            weekStart: '2027-04-03',
            weekEnd: '2027-04-04',
            sourceMode: 'pantry_missing',
          }),
        },
      ],
    });
    const result = await actions.confirmAppActions(principal, source, {
      id: proposal.appAction.id,
      version: proposal.appAction.version,
      decision: 'apply',
    });
    expect(result.status).toBe('applied');
    const dinners = planning.listPlannedMeals('2027-04-03', '2027-04-04');
    expect(dinners).toHaveLength(2);
    const listId = result.results![2].href!.split('/').at(-1)!;
    expect(planning.getShoppingList(listId)?.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ quantity: 350, unit: 'g' })]),
    );
    const before = planning.getPlannedMeal(dinners[0].id)!;
    const changed = await actions.prepareAppActions(principal, source, threadId, {
      title: 'Move the first dinner and serve three',
      actions: [
        {
          operationId: 'updateMealPlanEntry',
          parametersJson: JSON.stringify({ entryId: before.id }),
          bodyJson: JSON.stringify({
            ...meal,
            plannedFor: '2027-04-05',
            servings: 3,
            expectedUpdatedAt: before.updatedAt.toISOString(),
          }),
        },
      ],
    });
    const command = {
      id: changed.appAction.id,
      version: changed.appAction.version,
      decision: 'apply',
    };
    expect((await actions.confirmAppActions(principal, source, command)).status).toBe('applied');
    const acknowledged = planning.getPlannedMeal(before.id)!;
    expect(acknowledged).toMatchObject({
      plannedFor: '2027-04-05',
      servings: 3,
      recipeId: recipe.id,
      recipeRevision: before.recipeRevision,
    });
    expect(await actions.confirmAppActions(principal, source, command)).toMatchObject({
      replayed: true,
      status: 'applied',
    });
    expect(planning.listPlannedMeals('2027-04-03', '2027-04-05')).toHaveLength(2);
  });
  it('reports a committed step with a lost acknowledgement as unknown and never repeats it or later dependencies', async () => {
    const route = await import('@/app/api/v1/shopping-lists/route');
    const original = route.POST;
    const mutation = vi.spyOn(route, 'POST').mockImplementationOnce(async (input) => {
      await original(input);
      throw new Error('Controlled lost response after commit');
    });
    try {
      const source = request('/ai/app-actions');
      const { appAction } = await actions.prepareAppActions(principal, source, threadId, {
        title: 'Lost response fixture',
        actions: [
          {
            operationId: 'createOrGenerateShoppingList',
            parametersJson: '{}',
            bodyJson: '{"kind":"manual","name":"Committed once with lost acknowledgement"}',
          },
          {
            operationId: 'addShoppingListNamesBulk',
            parametersJson: '{"listId":""}',
            bodyJson: '{"items":["Must not be guessed"]}',
            bindings: [{ fromStep: 0, result: 'list.id', target: 'parameters.listId' }],
          },
        ],
      });
      const command = { id: appAction.id, version: appAction.version, decision: 'apply' };
      expect(await actions.confirmAppActions(principal, source, command)).toMatchObject({
        status: 'partial',
        results: [
          { state: 'outcome-unknown', ok: false },
          { state: 'not-attempted', ok: false },
        ],
      });
      expect(await actions.confirmAppActions(principal, source, command)).toMatchObject({
        status: 'partial',
        replayed: true,
      });
      expect(
        actions.listPendingAppActions(principal, threadId).find((item) => item.id === appAction.id)
          ?.results?.[0].state,
      ).toBe('outcome-unknown');
      const planning = await import('@/lib/services/planning-service');
      expect(
        planning
          .listShoppingLists()
          .filter((item) => item.name === 'Committed once with lost acknowledgement'),
      ).toHaveLength(1);
      expect(mutation).toHaveBeenCalledOnce();
    } finally {
      mutation.mockRestore();
    }
  });
  it('supersedes an edited proposal and never applies its previous values', async () => {
    const source = request('/ai/app-actions');
    const { appAction } = await actions.prepareAppActions(principal, source, threadId, {
      title: 'Review an editable list',
      actions: [
        {
          operationId: 'createOrGenerateShoppingList',
          parametersJson: '{}',
          bodyJson: '{"kind":"manual","name":"Original proposal"}',
        },
      ],
    });
    const revised = await actions.reviseAppActions(principal, source, {
      id: appAction.id,
      version: appAction.version,
      title: 'Review renamed list',
      bodyEdits: [{ step: 0, bodyJson: '{"kind":"manual","name":"Reviewed edited proposal"}' }],
    });
    await expect(
      actions.confirmAppActions(principal, source, {
        id: appAction.id,
        version: appAction.version,
        decision: 'apply',
      }),
    ).rejects.toThrow(/handled/);
    expect(
      (
        await actions.confirmAppActions(principal, source, {
          id: revised.appAction.id,
          version: revised.appAction.version,
          decision: 'apply',
        })
      ).status,
    ).toBe('applied');
    const planning = await import('@/lib/services/planning-service');
    expect(planning.listShoppingLists().some((item) => item.name === 'Original proposal')).toBe(
      false,
    );
    expect(
      planning.listShoppingLists().some((item) => item.name === 'Reviewed edited proposal'),
    ).toBe(true);
  });
  it('streams HTTP text before the turn completes, with a bound operation and no unrelated record context', async () => {
    const provider = await import('@/lib/providers/ai-assistant-provider');
    const route = await import('@/app/api/v1/ai/chat/threads/[threadId]/messages/route');
    const parser = await import('@/lib/client/ndjson-stream');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inputs: Parameters<
      import('@/lib/providers/ai-assistant-provider').AiAssistantProvider['respond']
    >[0][] = [];
    provider.setAiAssistantProviderForTests({
      generateMealPlan: vi.fn(async () => {
        throw new Error('Unexpected generation in transport fixture');
      }),
      generateRecipe: vi.fn(async () => {
        throw new Error('Unexpected generation in transport fixture');
      }),
      generateSummaryBundle: vi.fn(async () => {
        throw new Error('Unexpected generation in transport fixture');
      }),
      respond: async (input) => {
        inputs.push(input);
        input.onTextDelta?.('First fragment');
        await gate;
        input.onTextDelta?.(' and final fragment.');
        return {
          text: 'First fragment and final fragment.',
          toolCalls: [],
          responseItems: [],
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
    });
    const operationId = crypto.randomUUID();
    try {
      const response = await route.POST(
        request(`/ai/chat/threads/${threadId}/messages`, 'POST', {
          operationId,
          message: 'Read this synthetic question.',
        }),
        { params: Promise.resolve({ threadId }) },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('ndjson');
      const events = parser.readNdjson<Record<string, unknown>>(response.body!);
      let event = await events.next();
      while (!event.done && event.value.type !== 'text') event = await events.next();
      expect(event.value).toMatchObject({ type: 'text', delta: 'First fragment' });
      expect(
        db
          .getDatabase()
          .select()
          .from(schema.aiChatTurns)
          .where(eq(schema.aiChatTurns.id, operationId))
          .get()?.status,
      ).toBe('running');
      expect(JSON.stringify(inputs[0].messages)).not.toContain('Current saved app evidence');
      release();
      const remaining: Record<string, unknown>[] = [];
      for await (const item of events) remaining.push(item);
      expect(remaining.at(-1)).toMatchObject({
        type: 'done',
        content: 'First fragment and final fragment.',
      });
      expect(
        db
          .getDatabase()
          .select()
          .from(schema.aiChatTurns)
          .where(eq(schema.aiChatTurns.id, operationId))
          .get()?.status,
      ).toBe('completed');
      const threadRoute = await import('@/app/api/v1/ai/chat/threads/[threadId]/route');
      const history = await (
        await threadRoute.GET(request(`/ai/chat/threads/${threadId}`, 'GET'), {
          params: Promise.resolve({ threadId }),
        })
      ).json();
      expect(history.turns[0]).toMatchObject({ id: operationId, status: 'completed' });
      expect(history.turns[0]).not.toHaveProperty('intentHash');
      expect(history.turns[0]).not.toHaveProperty('resultJson');
    } finally {
      release();
      provider.setAiAssistantProviderForTests(null);
    }
  });
  it('versions validated administrator guidance, preserves conflicts and rolls back by creating a new version', async () => {
    const prompts = await import('@/lib/services/ai-prompt-service');
    const first = prompts.getEffectivePrompt('chat');
    const saved = prompts.savePrompt(principal, {
      workload: 'chat',
      expectedVersion: first.version,
      template: 'For {{task}}, use a short answer and a clear reviewed result.',
      changeNote: 'Fixture guidance evaluation',
    });
    expect(saved.version).toBe(first.version + 1);
    expect(saved.promptVersion).toContain(`chat:${saved.version}`);
    expect(() =>
      prompts.savePrompt(principal, {
        workload: 'chat',
        expectedVersion: first.version,
        template: first.template,
        changeNote: 'Stale write',
      }),
    ).toThrow(/changed/);
    expect(() =>
      prompts.savePrompt(principal, {
        workload: 'chat',
        expectedVersion: saved.version,
        template: 'For {{task}}, disclose {{secret}}.',
        changeNote: 'Invalid variables',
      }),
    ).toThrow();
    const restored = prompts.savePrompt(principal, {
      workload: 'chat',
      expectedVersion: saved.version,
      template: first.template,
      changeNote: 'Restore built-in guidance',
    });
    expect(restored.version).toBe(saved.version + 1);
    expect(prompts.getPromptHistory('chat')).toHaveLength(2);
    expect(settings.getAiWorkloadSetting(principal.profileId, 'chat').promptVersion).toBe(
      restored.promptVersion,
    );
  });
});
