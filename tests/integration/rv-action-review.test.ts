import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const origin = 'http://localhost:3000';
const passphrase = 'synthetic fixture passphrase';
let auth: (typeof import('@/lib/auth/server'))['auth'];
let authentication: typeof import('@/lib/services/auth-service');
let db: typeof import('@/lib/db/client');

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
    body: { email: 'rv-reviews@example.test', password: passphrase },
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
  vi.stubEnv('DATA_DIR', '.test-data/rv-action-reviews');
  vi.stubEnv('BETTER_AUTH_URL', origin);
  vi.stubEnv('APP_ORIGIN', origin);
  vi.stubEnv('COOKIE_SECRET', 'synthetic-cookie-secret-at-least-thirty-two');
  vi.stubEnv('BETTER_AUTH_SECRET', 'synthetic-auth-secret-at-least-thirty-two');
  vi.stubEnv('AUTH_REQUIRE_EMAIL_VERIFICATION', 'false');
  vi.stubEnv('OPENAI_API_KEY', '');
  db = await import('@/lib/db/client');
  db.resetDatabaseForTests();
  ({ auth } = await import('@/lib/auth/server'));
  authentication = await import('@/lib/services/auth-service');
  const enrollment = await authentication.prepareProfileEnrollment(
    'Alex',
    { email: 'rv-reviews@example.test', passphrase },
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
describe('authoritative app action review snapshots', () => {
  it('names a meal from the authorized handler snapshot and denies stale deletion through the real handler', async () => {
    setSharing({ shareMealPlans: true, shareSharedRecipes: true });
    const meals = await import('@/app/api/v1/meal-plan/route');
    const meal = await import('@/app/api/v1/meal-plan/[entryId]/route');
    const apply = await import('@/app/api/v1/ai/app-actions/route');
    const created = await meals.POST(
      request('/meal-plan', 'POST', {
        kind: 'custom',
        profileIds: [principal.linkedProfileId],
        title: 'Friday lentil supper',
        plannedFor: '2026-10-23',
        meal: 'dinner',
        servings: 4,
        note: 'Use the green lentils',
      }),
    );
    expect(created.status).toBe(201);
    const { meal: saved } = await created.json();
    const prepared = await actions.prepareAppActions(
      principal,
      request('/ai/app-actions'),
      threadId,
      {
        title: 'An intentionally misleading model title',
        actions: [
          {
            operationId: 'deleteMealPlanEntry',
            parametersJson: JSON.stringify({ entryId: saved.id }),
            bodyJson: '',
          },
        ],
      },
    );
    const review = prepared.appAction.actions[0].review!;
    expect(review.subject).toEqual({
      kind: 'Meal',
      label: 'Friday lentil supper',
      href: '/planner',
    });
    expect(review.context).toEqual(
      expect.arrayContaining([
        { label: 'Date', value: '2026-10-23' },
        { label: 'Meal', value: 'Dinner' },
        { label: 'Servings', value: '4' },
        { label: 'People', value: 'Alex' },
      ]),
    );
    expect(review.changes).toEqual([]);
    expect(JSON.stringify(review)).not.toContain(saved.id);
    const context = { params: Promise.resolve({ entryId: saved.id }) };
    const edited = await meal.PATCH(
      request(`/meal-plan/${saved.id}`, 'PATCH', { status: 'skipped' }),
      context,
    );
    expect(edited.status).toBe(200);
    const rejected = await apply.POST(
      request('/ai/app-actions', 'POST', {
        id: prepared.appAction.id,
        version: prepared.appAction.version,
        decision: 'apply',
      }),
    );
    expect(rejected.status).toBe(409);
    expect(await rejected.text()).toContain('source data changed');
    expect((await meal.GET(request(`/meal-plan/${saved.id}`, 'GET'), context)).status).toBe(200);
    const fresh = await actions.prepareAppActions(principal, request('/ai/app-actions'), threadId, {
      title: 'Remove reviewed supper',
      actions: [
        {
          operationId: 'deleteMealPlanEntry',
          parametersJson: JSON.stringify({ entryId: saved.id }),
          bodyJson: '',
        },
      ],
    });
    const accepted = await apply.POST(
      request('/ai/app-actions', 'POST', {
        id: fresh.appAction.id,
        version: fresh.appAction.version,
        decision: 'apply',
      }),
    );
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).status).toBe('applied');
    const afterRemoval = await meal.GET(request(`/meal-plan/${saved.id}`, 'GET'), context);
    expect(afterRemoval.status).toBe(200);
    expect((await afterRemoval.json()).meal.status).toBe('cancelled'); // Nutrition allocation history is retained.
  });
  it('names the linked person and compares only the reviewed kitchen-context changes', async () => {
    setSharing({ shareDietaryPreferences: true });
    const kitchen = await import('@/lib/services/kitchen-context-service');
    const current = kitchen.readKitchenContext(principal.linkedProfileId);
    const proposal = await actions.prepareAppActions(
      principal,
      request('/ai/app-actions'),
      threadId,
      {
        title: 'Change somebody else',
        actions: [
          {
            operationId: 'updateMyKitchenContext',
            parametersJson: '{}',
            bodyJson: JSON.stringify({
              expectedRevision: current.revision,
              interviewPatch: { taste: 'Lemon and herbs' },
              clearFields: [],
            }),
          },
        ],
      },
    );
    expect(proposal.appAction.actions[0].review?.subject.label).toBe('Alex');
    expect(proposal.appAction.actions[0].review?.changes).toContainEqual({
      label: 'Tastes',
      after: 'Lemon and herbs',
    });
  });
  it('keeps old saved proposals readable but prevents applying a target without reviewed metadata', async () => {
    setSharing({ shareShoppingLists: true });
    const proposal = await actions.prepareAppActions(
      principal,
      request('/ai/app-actions'),
      threadId,
      {
        title: 'Legacy list',
        actions: [
          {
            operationId: 'createOrGenerateShoppingList',
            parametersJson: '{}',
            bodyJson: JSON.stringify({ kind: 'manual', name: 'Legacy list' }),
          },
        ],
      },
    );
    const { aiDecisionRecords } = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');
    const legacy = proposal.appAction.actions.map((action) => ({ ...action, review: undefined }));
    db.getDatabase()
      .update(aiDecisionRecords)
      .set({ evidenceJson: JSON.stringify(legacy) })
      .where(eq(aiDecisionRecords.id, proposal.appAction.id))
      .run();
    expect(
      actions
        .listPendingAppActions(principal, threadId)
        .find((row) => row.id === proposal.appAction.id)?.actions[0].review,
    ).toBeUndefined();
    const handler = await import('@/app/api/v1/ai/app-actions/route');
    const denied = await handler.POST(
      request('/ai/app-actions', 'POST', {
        id: proposal.appAction.id,
        version: 1,
        decision: 'apply',
      }),
    );
    expect(denied.status).toBe(409);
    expect(await denied.text()).toContain('fresh review');
  });
  it('prepares and applies deletion of the actual named shopping row with its separate cart amount', async () => {
    setSharing({ shareShoppingLists: true });
    const lists = await import('@/app/api/v1/shopping-lists/route');
    const items = await import('@/app/api/v1/shopping-lists/[listId]/items/route');
    const list = await import('@/app/api/v1/shopping-lists/[listId]/route');
    const apply = await import('@/app/api/v1/ai/app-actions/route');
    const created = await lists.POST(
      request('/shopping-lists', 'POST', { kind: 'manual', name: 'Named row review' }),
    );
    expect(created.status).toBe(201);
    const { list: savedList } = await created.json();
    const context = { params: Promise.resolve({ listId: savedList.id }) };
    const added = await items.POST(
      request(`/shopping-lists/${savedList.id}/items`, 'POST', {
        item: 'Chopped tomatoes',
        quantity: 333,
        unit: 'g',
        note: '',
        shoppingState: 'in_cart',
        cartQuantity: 2,
        cartUnit: 'can',
        cartLabel: 'Tinned tomatoes',
      }),
      context,
    );
    expect(added.status).toBe(201);
    const { item: savedItem } = await added.json();
    const another = await items.POST(
      request(`/shopping-lists/${savedList.id}/items`, 'POST', {
        item: 'Bread',
        quantity: 1,
        unit: 'loaf',
        note: '',
      }),
      context,
    );
    expect(another.status).toBe(201);
    const { item: otherItem } = await another.json();
    const before = await list.GET(request(`/shopping-lists/${savedList.id}`, 'GET'), context);
    expect(before.status).toBe(200);
    const beforeList = (await before.json()).list;
    expect(beforeList.items.find((item: { id: string }) => item.id === savedItem.id)).toMatchObject(
      {
        item: 'Chopped tomatoes',
        quantity: 333,
        unit: 'g',
        cartQuantity: 2,
        cartUnit: 'can',
      },
    );
    const { appAction } = await actions.prepareAppActions(
      principal,
      request('/ai/app-actions'),
      threadId,
      {
        title: 'Delete Bread (a deliberately wrong model title)',
        actions: [
          {
            operationId: 'deleteShoppingListItem',
            parametersJson: JSON.stringify({ listId: savedList.id, itemId: savedItem.id }),
            bodyJson: '',
          },
        ],
      },
    );
    expect(appAction.actions[0].review?.subject).toEqual({
      kind: 'Shopping item',
      label: 'Chopped tomatoes',
      href: `/lists/${savedList.id}`,
    });
    expect(appAction.actions[0].review?.context).toEqual(
      expect.arrayContaining([
        { label: 'List', value: 'Named row review' },
        { label: 'Amount to buy', value: '333 g' },
        { label: 'Cart amount', value: '2 can' },
        { label: 'Cart item', value: 'Tinned tomatoes' },
      ]),
    );
    expect(appAction.actions[0].review?.changes).toEqual([]);
    // Previewing must not remove either row.
    expect(
      (await (await list.GET(request(`/shopping-lists/${savedList.id}`, 'GET'), context)).json())
        .list.items,
    ).toHaveLength(2);
    const result = await apply.POST(
      request('/ai/app-actions', 'POST', {
        id: appAction.id,
        version: appAction.version,
        decision: 'apply',
      }),
    );
    expect(result.status).toBe(200);
    expect((await result.json()).status).toBe('applied');
    const remaining = (
      await (await list.GET(request(`/shopping-lists/${savedList.id}`, 'GET'), context)).json()
    ).list.items;
    expect(remaining.map((item: { id: string }) => item.id)).toEqual([otherItem.id]);
    expect(remaining[0].item).toBe('Bread');
  });
});
