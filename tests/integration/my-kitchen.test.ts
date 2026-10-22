import { startCookSession } from '@/lib/services/cooking-service';
import {
  changeCookingSessionRecipe,
  readCookingSessionRecipe,
} from '@/lib/services/cooking-session-recipe-service';
import { getCookSessionPantryPreview } from '@/lib/services/pantry-grocery-cooking-service';
import {
  readCookingPreferences,
  saveCookingPreferences,
} from '@/lib/services/cooking-preferences-service';
import { getProfile } from '@/lib/services/household-service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { resetDatabaseForTests, getDatabase } from '@/lib/db/client';
import { user, profileAuthLinks, kitchenResourceClaims } from '@/lib/db/schema';
import { completeSetup } from '@/lib/services/household-service';
import {
  executeKitchenCommand,
  readKitchenInventory,
  previewKitchenPlan,
  manageKitchenPhase,
} from '@/lib/services/kitchen-inventory-service';
import { equipmentInputSchema, kitchenPhaseSchema } from '@/lib/domain/kitchen';
import { checkKitchenPlan } from '@/lib/domain/kitchen-feasibility';
import { recipeInputSchema } from '@/lib/domain/recipe';
import {
  createRecipe,
  getRecipe,
  recipePayloadFromDetail,
  updateRecipe,
} from '@/lib/services/recipe-service';
import {
  addMealPlanEntry,
  getRecipeForPlannedMeal,
  updateMealPlanEntry,
  getPlannedMeal,
} from '@/lib/services/planning-service';
import { mealPlanEntrySchema, mealPlanEntryUpdateSchema } from '@/lib/domain/planning';
import { getAiDataPolicy, updateAiSettings } from '@/lib/services/ai-settings-service';
import { buildAiEquipmentContext } from '@/lib/services/ai-equipment-context-service';
import type { RequestPrincipal } from '@/lib/services/auth-service';
vi.mock('server-only', () => ({}));
let p: RequestPrincipal;
function add(typeKey: string, count = 1, extra: Record<string, unknown> = {}) {
  return executeKitchenCommand(p, {
    kind: 'add',
    operationId: randomUUID(),
    expectedRevision: readKitchenInventory(p).revision,
    count,
    item: { typeKey, name: typeKey, ...extra },
  });
}
function phase(id: string, capability: string, extra: Record<string, unknown> = {}) {
  return kitchenPhaseSchema.parse({
    id,
    capability,
    recipeId: randomUUID(),
    recipeRevision: 1,
    stepRefs: ['step'],
    durationMinutes: 15,
    ...extra,
  });
}
beforeEach(() => {
  vi.stubEnv('DATABASE_URL', ':memory:');
  resetDatabaseForTests();
  const profile = completeSetup({
    householdName: 'Kitchen fixture',
    appName: 'Bord',
    profile: {
      displayName: 'Alex',
      color: '#637A45',
      units: 'metric',
      temperatureUnit: 'C',
      locale: 'en-GB',
      timezone: 'Europe/London',
    },
  }).profiles[0]!;
  const id = randomUUID(),
    now = new Date();
  getDatabase()
    .insert(user)
    .values({
      id,
      name: 'Parent',
      email: `${id}@example.test`,
      role: 'parent',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  getDatabase()
    .insert(profileAuthLinks)
    .values({ profileId: profile.id, userId: id, createdAt: now, updatedAt: now })
    .run();
  p = {
    kind: 'session',
    userId: id,
    linkedProfileId: profile.id,
    profileId: profile.id,
    role: 'parent',
    accountRole: 'parent',
    activeProfileRole: 'parent',
    sessionId: 'fixture',
    apiKeyId: null,
  };
});
afterEach(() => {
  resetDatabaseForTests();
  vi.unstubAllEnvs();
});
describe('My Kitchen persisted boundaries', () => {
  it('K01 preserves identical physical IDs and recovers exact replay without a third item', () => {
    const input = {
      kind: 'add',
      operationId: randomUUID(),
      expectedRevision: 0,
      count: 2,
      item: { typeKey: 'electric-pressure-cooker', name: 'Instant Pot' },
    };
    const first = executeKitchenCommand(p, input);
    expect(new Set(first.receipt.itemIds).size).toBe(2);
    expect(executeKitchenCommand(p, input).replayed).toBe(true);
    expect(readKitchenInventory(p).items).toHaveLength(2);
    expect(() => executeKitchenCommand(p, { ...input, count: 3 })).toThrow(/intent/);
    const item = first.kitchen.items[0]!;
    executeKitchenCommand(p, {
      kind: 'update',
      operationId: randomUUID(),
      expectedRevision: 1,
      itemId: item.id,
      expectedItemRevision: 1,
      item: {
        ...equipmentInputSchema.parse({ typeKey: item.typeKey, name: 'Old cooker' }),
        availability: 'archived',
      },
    });
    const remaining = readKitchenInventory(p).items;
    expect(remaining[1]!.id).toBe(first.receipt.itemIds[1]);
    expect(remaining[0]!.availability).toBe('archived');
  });
  it('K02 round-trips entered units and unknown measurements', () => {
    add('saucepan', 1, { measurements: [{ value: 3, unit: 'l', basis: 'nominal-volume' }] });
    add('saucepan');
    const items = readKitchenInventory(p).items;
    expect(items[0]!.measurements[0]).toMatchObject({
      value: 3,
      unit: 'l',
      basis: 'nominal-volume',
    });
    expect(items[1]!.measurements).toEqual([]);
    expect(() =>
      add('saucepan', 1, { measurements: [{ value: 3, unit: 'cm', basis: 'nominal-volume' }] }),
    ).toThrow();
  });
  it('K03/K04 two modes contend for one base, but two real cookers run independently', () => {
    add('pressure-air-multicooker');
    let k = readKitchenInventory(p);
    const phases = [phase('stock', 'pressure-cook'), phase('potatoes', 'air-fry')];
    expect(checkKitchenPlan(k, phases, 'parallel').status).not.toBe('compatible');
    const sequenced = checkKitchenPlan(k, phases, 'sequence');
    expect(sequenced.status).toBe('compatible');
    expect(sequenced.assignments[1]!.start).toBe(15);
    add('pressure-air-multicooker');
    k = readKitchenInventory(p);
    const plan = checkKitchenPlan(k, phases, 'parallel');
    expect(plan.status).toBe('compatible');
    expect(plan.assignments[0]!.resourceIds).not.toEqual(plan.assignments[1]!.resourceIds);
  });
  it('K05 attachments never become a heating base', () => {
    const base = add('pressure-air-multicooker').kitchen.items[0]!;
    add('inner-pot', 1, { parentId: base.id, capabilities: ['pressure-cook', 'air-fry'] });
    expect(
      checkKitchenPlan(
        readKitchenInventory(p),
        [phase('stock', 'pressure-cook'), phase('potatoes', 'air-fry')],
        'parallel',
      ).status,
    ).not.toBe('compatible');
  });
  it('K06 independent zones require explicit confirmation', () => {
    expect(() => add('air-fryer', 1, { independentZones: 2 })).toThrow();
    expect(() =>
      add('pressure-air-multicooker', 1, { independentZones: 2, independentZonesConfirmed: true }),
    ).toThrow();
    add('air-fryer', 1, { independentZones: 2, independentZonesConfirmed: true });
    expect(
      checkKitchenPlan(
        readKitchenInventory(p),
        [phase('one', 'air-fry'), phase('two', 'air-fry')],
        'parallel',
      ).status,
    ).toBe('compatible');
  });
  it('K07 racks do not remove a cavity temperature conflict', () => {
    const oven = add('oven').kitchen.items[0]!;
    add('oven-rack', 2, { parentId: oven.id });
    const phases = [
      phase('bread', 'bake', { temperatureC: 220 }),
      phase('custard', 'bake', { temperatureC: 150 }),
    ];
    expect(checkKitchenPlan(readKitchenInventory(p), phases, 'parallel').status).not.toBe(
      'compatible',
    );
    expect(checkKitchenPlan(readKitchenInventory(p), phases, 'sequence').status).toBe('compatible');
  });
  it('K08 checks vessels and induction rather than just burner count', () => {
    add('induction-hob', 1, { independentZones: 2, independentZonesConfirmed: true });
    add('frying-pan', 1, { induction: 'no' });
    const phases = [
      phase('saute', 'heat-induction', { needsVessel: true, inductionRequired: true }),
    ];
    expect(checkKitchenPlan(readKitchenInventory(p), phases).status).not.toBe('compatible');
    add('saucepan', 1, { induction: 'yes' });
    expect(checkKitchenPlan(readKitchenInventory(p), phases).status).toBe('compatible');
  });
  it('K09 differentiates known insufficiency and unknown fit without inferring nominal working limits', () => {
    add('slow-cooker', 1, { measurements: [{ value: 2, unit: 'l', basis: 'working-liquid' }] });
    const k = readKitchenInventory(p);
    k.coverage = 'confirmed';
    expect(
      checkKitchenPlan(k, [
        phase('soup', 'slow-cook', { amount: { value: 3, unit: 'l', basis: 'working-liquid' } }),
      ]).status,
    ).toBe('conflict');
    expect(
      checkKitchenPlan(k, [
        phase('soup', 'slow-cook', { amount: { value: 3, unit: 'l', basis: 'nominal-volume' } }),
      ]).status,
    ).toBe('needs-information');
  });
  it('K12/K14 rejects stale edits, archives retain history and explicit new additions remain possible', () => {
    const k = add('rice-cooker').kitchen;
    add('saucepan');
    const item = k.items[0]!;
    expect(() =>
      executeKitchenCommand(p, {
        kind: 'update',
        operationId: randomUUID(),
        expectedRevision: k.revision,
        itemId: item.id,
        expectedItemRevision: 1,
        item: { typeKey: 'rice-cooker', name: 'Broken', availability: 'unavailable' },
      }),
    ).toThrow(/changed/);
    add('rice-cooker');
    expect(readKitchenInventory(p).items).toHaveLength(3);
  });
  it('K21 rechecks revoked account rights even if a principal claims parent', () => {
    getDatabase().update(user).set({ role: 'child' }).where(eq(user.id, p.userId)).run();
    expect(readKitchenInventory(p).canManage).toBe(false);
    expect(() => add('saucepan')).toThrow(/cannot/);
  });
  it('K22 defaults sharing off and never borrows consent from an active profile', () => {
    add('electric-pressure-cooker');
    expect(buildAiEquipmentContext(p)).toEqual({ status: 'withheld' });
    const policy = getAiDataPolicy(p.linkedProfileId);
    updateAiSettings(p.linkedProfileId, { dataPolicy: { ...policy, shareKitchenEquipment: true } });
    expect(buildAiEquipmentContext(p).status).toBe('available');
    expect(buildAiEquipmentContext({ ...p, profileId: randomUUID() })).toEqual({
      status: 'withheld',
    });
    expect(buildAiEquipmentContext()).toEqual({ status: 'withheld' });
  });
  it('K11/K24 atomically claims bundles and requires acknowledged release, not timer/chat cancellation', () => {
    add('pressure-air-multicooker');
    const recipe = createRecipe(
      recipeInputSchema.parse({
        title: 'Stock',
        summary: '',
        servings: '2',
        prepMinutes: 0,
        cookMinutes: 15,
        sourceName: '',
        sourceUrl: '',
        tags: [],
        ingredientGroups: [
          { name: '', ingredients: [{ item: 'Water', quantity: 1, unit: 'l', note: '' }] },
        ],
        instructionSections: [{ title: '', steps: ['Cook.'] }],
      }),
      p.profileId,
    );
    const detail = getRecipe(recipe.id)!;
    const ph = phase('stock', 'pressure-cook', {
      recipeId: recipe.id,
      recipeRevision: detail.currentRevision,
      stepRefs: [detail.instructionSections[0]!.steps[0]!.id],
    });
    const plan = { expectedRevision: readKitchenInventory(p).revision, phases: [ph] };
    const episodeId = randomUUID();
    expect(previewKitchenPlan(p, plan).status).toBe('compatible');
    expect(getDatabase().select().from(kitchenResourceClaims).all()).toHaveLength(0);
    manageKitchenPhase(p, { operation: 'start', episodeId, phaseId: 'stock', plan });
    expect(() =>
      manageKitchenPhase(p, {
        operation: 'start',
        episodeId: randomUUID(),
        phaseId: 'stock',
        plan,
      }),
    ).toThrow(/in use/);
    expect(getDatabase().select().from(kitchenResourceClaims).all()).toHaveLength(1);
    expect(() =>
      manageKitchenPhase(p, { operation: 'release', episodeId, phaseId: 'stock' }),
    ).toThrow(/Confirm/);
    manageKitchenPhase(p, {
      operation: 'release',
      episodeId,
      phaseId: 'stock',
      acknowledged: true,
    });
    expect(getDatabase().select().from(kitchenResourceClaims).all()).toHaveLength(0);
  });
  it('K16 meal-only method/equipment/timing override projects consistently and preserves the library', () => {
    const input = recipeInputSchema.parse({
      title: 'Potatoes',
      summary: '',
      servings: '2',
      prepMinutes: 5,
      cookMinutes: 20,
      cookingMethod: 'Air fry',
      equipment: ['Air fryer'],
      sourceName: '',
      sourceUrl: '',
      tags: [],
      nutritionCalories: 100,
      ingredientGroups: [
        { name: '', ingredients: [{ item: 'Potatoes', quantity: 500, unit: 'g', note: '' }] },
      ],
      instructionSections: [{ title: '', steps: ['Air fry potatoes.'] }],
    });
    const recipe = createRecipe(input, p.profileId);
    const meal = addMealPlanEntry(
      mealPlanEntrySchema.parse({
        plannedFor: '2026-10-21',
        meal: 'dinner',
        recipeId: recipe.id,
        servings: 2,
        note: '',
        recipeOverride: {
          title: input.title,
          summary: '',
          servings: '2',
          ingredientGroups: input.ingredientGroups,
          instructionSections: [
            { title: '', steps: ['Pan fry potatoes in a skillet until tender.'] },
          ],
          cookingMethod: 'Stovetop',
          equipment: ['Frying pan', 'Hob'],
          prepMinutes: 10,
          cookMinutes: 25,
          restMinutes: 2,
        },
      }),
      p.profileId,
    );
    const effective = getRecipeForPlannedMeal(recipe.id, meal.id)!;
    expect(effective.cookingMethod).toBe('Stovetop');
    expect(effective.cookMinutes).toBe(25);
    expect(effective.equipment.map((e) => e.name)).toEqual(['Frying pan', 'Hob']);
    expect(effective.nutritionCalories).toBe(100);
    const currentMeal = getPlannedMeal(meal.id)!;
    updateMealPlanEntry(
      meal.id,
      mealPlanEntryUpdateSchema.parse({
        plannedFor: '2026-10-21',
        meal: 'dinner',
        recipeId: recipe.id,
        servings: 2,
        note: 'Unrelated legacy-client edit',
        expectedUpdatedAt: currentMeal.updatedAt.toISOString(),
        recipeOverride: {
          title: 'Potatoes for tonight',
          summary: '',
          servings: '2',
          ingredientGroups: input.ingredientGroups,
          instructionSections: [
            { title: '', steps: ['Pan fry potatoes in a skillet until tender.'] },
          ],
        },
      }),
      p.profileId,
    );
    const preserved = getRecipeForPlannedMeal(recipe.id, meal.id)!;
    expect(preserved.cookingMethod).toBe('Stovetop');
    expect(preserved.cookMinutes).toBe(25);
    expect(preserved.equipment.map((e) => e.name)).toEqual(['Frying pan', 'Hob']);
    expect(getRecipe(recipe.id)!.cookingMethod).toBe('Air fry');
    expect(getRecipe(recipe.id)!.instructionSections[0]!.steps[0]!.body).toBe('Air fry potatoes.');
  });
  it('K18 preserves requirements on unrelated edits and invalidates reordered step references', () => {
    const input = recipeInputSchema.parse({
      title: 'Stock',
      summary: '',
      servings: '2',
      prepMinutes: 0,
      cookMinutes: 15,
      sourceName: '',
      sourceUrl: '',
      tags: [],
      equipmentRequirements: [
        { capability: 'pressure-cook', quantity: 1, steps: [{ section: 0, step: 0 }] },
      ],
      ingredientGroups: [
        { name: '', ingredients: [{ item: 'Water', quantity: 1, unit: 'l', note: '' }] },
      ],
      instructionSections: [{ title: '', steps: ['Cook.', 'Release pressure and transfer.'] }],
    });
    let recipe = createRecipe(input, p.profileId);
    recipe = updateRecipe(
      recipe.id,
      { ...recipePayloadFromDetail(recipe), title: 'New name' },
      p.profileId,
      recipe.currentRevision,
    );
    expect(recipe.equipmentRequirements).toHaveLength(1);
    const payload = recipePayloadFromDetail(recipe);
    payload.instructionSections[0]!.steps.reverse();
    recipe = updateRecipe(recipe.id, payload, p.profileId, recipe.currentRevision);
    expect(recipe.equipmentRequirements).toEqual([]);
  });
  it('K08 allocates two distinct compatible pans and two actual zones', () => {
    add('induction-hob', 1, { independentZones: 2, independentZonesConfirmed: true });
    add('saucepan', 2, { induction: 'yes' });
    const plan = checkKitchenPlan(
      readKitchenInventory(p),
      [phase('meal', 'heat-induction', { needsVessel: true, quantity: 2 })],
      'parallel',
    );
    expect(plan.status).toBe('compatible');
    expect(new Set(plan.assignments[0]!.resourceIds).size).toBe(4);
  });
  it('K23 saves only the account cooking-preference owner and preserves interview/allergy context', () => {
    const before = getProfile(p.linkedProfileId)!;
    const initial = readCookingPreferences(p);
    const saved = saveCookingPreferences(p, {
      expectedRevision: initial.revision,
      preferences: {
        ...initial.preferences,
        methodPreferences: 'Prefer stovetop potatoes',
        priorities: ['less-cleanup'],
        maxHandsOn: 2,
      },
    });
    expect(saved.preferences.methodPreferences).toBe('Prefer stovetop potatoes');
    expect(getProfile(p.linkedProfileId)!.goalContext.kitchenInterview).toEqual(
      before.goalContext.kitchenInterview,
    );
    expect(() =>
      saveCookingPreferences(p, {
        expectedRevision: initial.revision,
        preferences: initial.preferences,
      }),
    ).toThrow(/changed/);
    expect(readKitchenInventory(p).items).toEqual([]);
  });
});

describe('Owned effective cooking recipes', () => {
  it('K16 persists an owned session adaptation and version-aware undo without changing library or another meal', () => {
    const original = createRecipe(
      recipeInputSchema.parse({
        title: 'Potatoes',
        summary: '',
        servings: '2',
        prepMinutes: 5,
        cookMinutes: 20,
        sourceName: '',
        sourceUrl: '',
        tags: [],
        cookingMethod: 'Air fry',
        equipment: ['Air fryer'],
        ingredientGroups: [
          {
            name: '',
            ingredients: [
              {
                item: 'Potatoes',
                quantity: 500,
                unit: 'g',
                note: '',
                shoppingCategory: 'Fresh produce',
              },
            ],
          },
        ],
        instructionSections: [{ title: '', steps: ['Air fry the potatoes.'] }],
      }),
      p.profileId,
    );
    const session = startCookSession(original.id, p.profileId, 2, null, p.userId);
    const request = {
      kind: 'adapt',
      operationId: randomUUID(),
      expectedRevision: 1,
      expectedKitchenRevision: readKitchenInventory(p).revision,
      change: {
        cookingMethod: 'Stovetop',
        equipment: ['Saucepan', 'Hob'],
        equipmentRequirements: [],
        instructionSections: [
          {
            title: '',
            steps: ['Simmer potatoes in water until tender. Drain and return to the pan.'],
          },
        ],
        prepMinutes: 5,
        cookMinutes: 25,
        restMinutes: 0,
      },
    };
    const changed = changeCookingSessionRecipe(p, session.id, request);
    expect(changed.session.effectiveRevision).toBe(2);
    expect(readCookingSessionRecipe(p, session.id).effectiveRecipe?.cookingMethod).toBe('Stovetop');
    expect(getRecipe(original.id)?.cookingMethod).toBe('Air fry');
    expect(changeCookingSessionRecipe(p, session.id, request).replayed).toBe(true);
    expect(() =>
      changeCookingSessionRecipe(p, session.id, { ...request, operationId: randomUUID() }),
    ).toThrow(/changed/);
    expect(() => readCookingSessionRecipe({ ...p, userId: randomUUID() }, session.id)).toThrow();
    expect(() => readCookingSessionRecipe({ ...p, profileId: randomUUID() }, session.id)).toThrow();
    const undo = changeCookingSessionRecipe(p, session.id, {
      kind: 'undo',
      operationId: randomUUID(),
      expectedRevision: 2,
      expectedKitchenRevision: readKitchenInventory(p).revision,
      undoOperationId: request.operationId,
    });
    expect(undo.session.effectiveRevision).toBe(3);
    expect(undo.session.effectiveRecipe?.instructionSections[0]?.steps[0]?.body).toBe(
      'Air fry the potatoes.',
    );
    expect(getRecipe(original.id)?.currentRevision).toBe(1);
  });

  it('K12/K17 rejects active-use and stale kitchen changes, and Pantry follows the session ingredient snapshot', () => {
    const original = createRecipe(
      recipeInputSchema.parse({
        title: 'Potatoes',
        summary: '',
        servings: '2',
        prepMinutes: 5,
        cookMinutes: 20,
        sourceName: '',
        sourceUrl: '',
        tags: [],
        cookingMethod: 'Air fry',
        equipment: ['Air fryer'],
        ingredientGroups: [
          {
            name: '',
            ingredients: [
              {
                item: 'Potatoes',
                quantity: 500,
                unit: 'g',
                note: '',
                shoppingCategory: 'Fresh produce',
              },
            ],
          },
        ],
        instructionSections: [{ title: '', steps: ['Air fry the potatoes.'] }],
        nutritionCalories: 200,
      }),
      p.profileId,
    );
    const session = startCookSession(original.id, p.profileId, 2, null, p.userId);
    const request = {
      kind: 'adapt',
      operationId: randomUUID(),
      expectedRevision: 1,
      expectedKitchenRevision: readKitchenInventory(p).revision,
      change: {
        cookingMethod: 'Stovetop',
        equipment: ['Pan'],
        equipmentRequirements: [],
        instructionSections: [{ title: '', steps: ['Cook carrots in a pan.'] }],
        prepMinutes: 5,
        cookMinutes: 25,
        restMinutes: 0,
        ingredientGroups: [
          {
            name: '',
            ingredients: [
              {
                item: 'Carrots',
                quantity: 600,
                unit: 'g',
                note: '',
                shoppingCategory: 'Fresh produce',
              },
            ],
          },
        ],
      },
    };
    getDatabase()
      .insert(kitchenResourceClaims)
      .values({
        resourceId: 'fixture',
        kitchenId: readKitchenInventory(p).id,
        episodeId: session.id,
        phaseId: 'holding',
        userId: p.userId,
        startedAt: new Date(),
      })
      .run();
    expect(() => changeCookingSessionRecipe(p, session.id, request)).toThrow(/physical release/);
    expect(readCookingSessionRecipe(p, session.id).effectiveRevision).toBe(1);
    getDatabase().delete(kitchenResourceClaims).run();
    add('saucepan');
    expect(() => changeCookingSessionRecipe(p, session.id, request)).toThrow(/kitchen changed/);
    const changed = changeCookingSessionRecipe(p, session.id, {
      ...request,
      expectedKitchenRevision: readKitchenInventory(p).revision,
    });
    expect(changed.session.effectiveRecipe?.nutritionCalories).toBeNull();
    const preview = getCookSessionPantryPreview(session.id, p.profileId);
    expect(preview.availability.ingredients.map((item) => item.item)).toEqual(['Carrots']);
    expect(preview.availability.ingredients[0]?.quantity).toBe(600);
    expect(preview.recommendedConsumptions).toEqual([]);
    expect(getRecipe(original.id)?.ingredientGroups[0]?.ingredients[0]?.item).toBe('Potatoes');
  });
});

describe('Dated episode restrictions and accepted future allocations', () => {
  it('K23 expires tonight in the stated timezone, preserves ownership and never changes another episode', async () => {
    const { changeCookingEpisode, readCookingEpisode } =
      await import('@/lib/services/cooking-episode-service');
    const recipe = createRecipe(
      recipeInputSchema.parse({
        title: 'Roast potatoes',
        summary: '',
        servings: '2',
        prepMinutes: 5,
        cookMinutes: 20,
        sourceName: '',
        sourceUrl: '',
        tags: [],
        ingredientGroups: [
          { name: '', ingredients: [{ item: 'Potatoes', quantity: 500, unit: 'g', note: '' }] },
        ],
        instructionSections: [{ title: '', steps: ['Roast potatoes.'] }],
      }),
      p.profileId,
    );
    add('oven');
    const session = startCookSession(recipe.id, p.profileId, 2, null, p.userId);
    const other = startCookSession(recipe.id, p.profileId, 2, null, p.userId);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-22T03:00:00Z'));
      const command = {
        kind: 'restrictions',
        operationId: randomUUID(),
        expectedContextRevision: 0,
        restrictions: {
          timezone: 'America/Chicago',
          validOn: '2026-10-21',
          excludedEquipmentIds: [readKitchenInventory(p).items[0]!.id],
          excludedCapabilities: [],
        },
      };
      expect(changeCookingEpisode(p, session.id, command).restrictionsActive).toBe(true);
      expect(changeCookingEpisode(p, session.id, command).replayed).toBe(true);
      const request = {
        expectedRevision: readKitchenInventory(p).revision,
        episodeId: session.id,
        episodeContextRevision: 1,
        phases: [
          phase('roast', 'bake', {
            recipeId: recipe.id,
            recipeRevision: 1,
            cookSessionId: session.id,
            cookSessionRevision: 1,
            stepRefs: [session.effectiveRecipe!.instructionSections[0]!.steps[0]!.id],
          }),
        ],
      };
      expect(previewKitchenPlan(p, request).status).not.toBe('compatible');
      expect(readKitchenInventory(p).items[0]?.availability).toBe('available');
      expect(readCookingEpisode(p, other.id).restrictions).toBeNull();
      vi.setSystemTime(new Date('2026-10-22T06:01:00Z'));
      expect(readCookingEpisode(p, session.id).restrictionsActive).toBe(false);
      expect(previewKitchenPlan(p, request).status).toBe('compatible');
      expect(() =>
        changeCookingEpisode(p, session.id, { ...command, operationId: randomUUID() }),
      ).toThrow(/changed/);
    } finally {
      vi.useRealTimers();
    }
  });
  it('K11/K12/K30 saves a future plan without claims, recovers replay, and revalidates before phase start', async () => {
    const { changeCookingEpisode, readCookingEpisode } =
      await import('@/lib/services/cooking-episode-service');
    add('pressure-air-multicooker');
    const recipe = createRecipe(
      recipeInputSchema.parse({
        title: 'Stock',
        summary: '',
        servings: '2',
        prepMinutes: 5,
        cookMinutes: 20,
        sourceName: '',
        sourceUrl: '',
        tags: [],
        ingredientGroups: [
          { name: '', ingredients: [{ item: 'Water', quantity: 1, unit: 'l', note: '' }] },
        ],
        instructionSections: [{ title: '', steps: ['Pressure cook.'] }],
      }),
      p.profileId,
    );
    const session = startCookSession(recipe.id, p.profileId, 2, null, p.userId);
    const request = {
      expectedRevision: readKitchenInventory(p).revision,
      episodeId: session.id,
      episodeContextRevision: 0,
      phases: [
        phase('stock', 'pressure-cook', {
          recipeId: recipe.id,
          recipeRevision: 1,
          cookSessionId: session.id,
          cookSessionRevision: 1,
          stepRefs: [session.effectiveRecipe!.instructionSections[0]!.steps[0]!.id],
        }),
      ],
    };
    const command = {
      kind: 'accept-plan',
      operationId: randomUUID(),
      expectedContextRevision: 0,
      plan: request,
    };
    const accepted = changeCookingEpisode(p, session.id, command);
    expect(accepted.acceptedPlan?.allocation.status).toBe('compatible');
    const scaled = startCookSession(recipe.id, p.profileId, 4, null, p.userId);
    const scaledRequest = {
      ...request,
      episodeId: scaled.id,
      phases: request.phases.map((phase) => ({ ...phase, cookSessionId: scaled.id })),
    };
    expect(previewKitchenPlan(p, scaledRequest).status).toBe('needs-information');
    expect(() =>
      changeCookingEpisode(p, scaled.id, {
        ...command,
        operationId: randomUUID(),
        plan: scaledRequest,
      }),
    ).toThrow(/Resolve the plan constraints/);

    expect(getDatabase().select().from(kitchenResourceClaims).all()).toHaveLength(0);
    expect(changeCookingEpisode(p, session.id, command).replayed).toBe(true);
    expect(readCookingEpisode(p, session.id).acceptedPlan?.id).toBe(command.operationId);
    manageKitchenPhase(p, {
      operation: 'start',
      episodeId: session.id,
      phaseId: 'stock',
      acceptedPlanId: command.operationId,
    });
    expect(getDatabase().select().from(kitchenResourceClaims).all()).toHaveLength(1);
    manageKitchenPhase(p, {
      operation: 'release',
      episodeId: session.id,
      phaseId: 'stock',
      acknowledged: true,
    });
    add('saucepan');
    expect(() =>
      manageKitchenPhase(p, {
        operation: 'start',
        episodeId: session.id,
        phaseId: 'stock',
        acceptedPlanId: command.operationId,
      }),
    ).toThrow(/Kitchen changed/);
    expect(getDatabase().select().from(kitchenResourceClaims).all()).toHaveLength(0);
  });
});
