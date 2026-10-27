import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { eq } from 'drizzle-orm';
import { resetDatabaseForTests, getDatabase } from '@/lib/db/client';
import { recipeRevisions, mealPlanEntries } from '@/lib/db/schema';
import { completeSetup } from '@/lib/services/household-service';
import { recipeInputSchema } from '@/lib/domain/recipe';
import {
  pantryBatchInputSchema,
  pantryProductInputSchema,
  pantryLocationInputSchema,
} from '@/lib/domain/pantry';
import { startCookSession, completeCookSession } from '@/lib/services/cooking-service';
import { createRecipe, updateRecipe } from '@/lib/services/recipe-service';
import {
  addMealPlanEntry,
  createManualShoppingList,
  addShoppingListItem,
  plannedMealsAsIcs,
} from '@/lib/services/planning-service';
import {
  createPantryProduct,
  createPantryBatch,
  createPantryLocation,
} from '@/lib/services/pantry-service';
import { getAppPreferences, updateAppPreferences } from '@/lib/services/app-preferences-service';
import {
  exportRecipesPdf,
  exportMealPlanPdf,
  exportPantryPdf,
  exportShoppingListPdf,
} from '@/lib/services/pdf-export-service';
import {
  recipePdfExportSchema,
  mealPlanPdfExportSchema,
  inventoryPdfExportSchema,
} from '@/lib/domain/pdf-export';
const recipe = recipeInputSchema.parse({
  title: 'Long-title winter bread with vegetables, herbs and a careful kitchen method',
  servings: '4',
  summary: 'A deterministic recipe fixture.',
  prepMinutes: 10,
  cookMinutes: 30,
  tags: [],
  ingredientGroups: [
    {
      name: 'For the dough',
      ingredients: [{ quantity: 0.5, unit: 'cup', item: 'Flour', note: 'sifted' }],
    },
    { name: 'For the topping', ingredients: [{ quantity: 1, unit: 'g', item: 'Salt', note: '' }] },
  ],
  instructionSections: [
    {
      title: 'Prepare and bake',
      steps: Array.from(
        { length: 28 },
        (_, i) =>
          `Step ${i + 1}: Mix the ingredients carefully, then allow enough time to rest before continuing. Check the dough and keep the equipment ready for the next part of this deliberately long recipe.`,
      ),
    },
  ],
  nutritionCalories: 0,
  nutritionProteinGrams: 12,
  sourceName: 'Fixture kitchen',
  sourceUrl: 'https://example.test/fixture',
  tips: 'Optional fixture notes.',
});
const text = (bytes: Uint8Array) =>
  execFileSync('pdftotext', ['-layout', '-', '-'], { input: Buffer.from(bytes) })
    .toString()
    .replace(/\s+/gu, ' ');
function evidence(name: string, bytes: Uint8Array) {
  const directory = process.env.BORD_PDF_EVIDENCE;
  if (directory) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(`${directory}/${name}`, bytes);
  }
}
let actor: string;
beforeEach(() => {
  vi.stubEnv('DATABASE_URL', ':memory:');
  resetDatabaseForTests();
  actor = completeSetup({
    householdName: 'Export fixture kitchen',
    appName: 'Bòrd',
    profile: {
      displayName: 'Avery',
      color: '#637A45',
      avatarUrl: '',
      units: 'metric',
      temperatureUnit: 'C',
      locale: 'en-GB',
      timezone: 'UTC',
    },
  }).profiles[0]!.id;
});
afterEach(() => {
  resetDatabaseForTests();
  vi.unstubAllEnvs();
});
describe('read-only document exports', () => {
  it('renders A4 and Letter long recipe continuations with original group context and known zero', async () => {
    const saved = createRecipe(recipe, actor);
    for (const paper of ['A4', 'Letter'] as const) {
      const result = await exportRecipesPdf(
        recipePdfExportSchema.parse({
          recipeIds: [saved.id],
          paper,
          servings: 8,
          includeImage: false,
          organizeByStore: true,
          storeId: createManualShoppingList('Route source', actor).supermarketProfileId,
        }),
      );
      const output = text(result.bytes);
      expect(output).toContain('For the dough');
      expect(output).toContain('For the topping');
      expect(output).toMatch(/ENERGY[^|]*CARBS[^|]*0 kcal 12 g not recorded/u);
      expect(output).toContain('not recorded');
      expect(output).toContain('Step 28:');
      expect(output).toContain('Recipe ·');
      evidence(`recipe-${paper.toLowerCase()}.pdf`, result.bytes);
    }
  }, 60000);
  it('keeps custom meal labels, adaptations and saved revisions with notes off and deduplicates cards', async () => {
    const saved = createRecipe(recipe, actor);
    updateAppPreferences(
      {
        category: 'mealPlan',
        values: {
          ...getAppPreferences().mealPlan,
          customMealTypes: [{ value: 'custom-tea', label: 'Afternoon tea' }],
        },
      },
      actor,
    );
    const first = addMealPlanEntry(
      {
        plannedFor: '2026-12-28',
        meal: 'breakfast',
        recipeId: saved.id,
        servings: 4,
        note: 'OPTIONAL NOTE HIDDEN',
        kind: 'recipe',
      },
      actor,
    );
    addMealPlanEntry(
      {
        plannedFor: '2026-12-29',
        meal: 'custom-tea',
        recipeId: saved.id,
        servings: 4,
        note: '',
        kind: 'recipe',
      },
      actor,
    );
    addMealPlanEntry(
      {
        plannedFor: '2026-12-30',
        meal: 'dinner',
        recipeId: saved.id,
        recipeOverride: { ...recipe, title: 'Adapted meal fixture' },
        servings: 4,
        note: '',
        kind: 'recipe',
      },
      actor,
    );
    addMealPlanEntry(
      {
        plannedFor: '2026-12-31',
        meal: 'lunch',
        recipeId: saved.id,
        leftoverSourceId: first.id,
        servings: 1,
        note: '',
        kind: 'leftover',
      },
      actor,
    );
    addMealPlanEntry(
      {
        plannedFor: '2027-01-04',
        meal: 'supper',
        title: 'Restaurant fixture',
        servings: 2,
        note: '',
        kind: 'takeout',
      },
      actor,
    );
    const cooked = startCookSession(saved.id, actor, 4, first.id);
    completeCookSession(cooked.id, actor);
    for (let i = 0; i < 12; i++)
      addMealPlanEntry(
        {
          plannedFor: '2026-12-28',
          meal: ['brunch', 'suhoor', 'iftar', 'supper', 'tiffin', 'snack'][i % 6]!,
          title: `Dense-day meal ${i + 1}: a long description that remains readable across schedule continuation pages`,
          servings: 2,
          note: 'OPTIONAL NOTE HIDDEN',
          kind: 'takeout',
        },
        actor,
      );
    for (const paper of ['A4', 'Letter'] as const) {
      const result = await exportMealPlanPdf(
        mealPlanPdfExportSchema.parse({
          start: '2026-12-28',
          end: '2027-01-04',
          paper,
          includeNotes: false,
          includeImage: false,
        }),
      );
      const output = text(result.bytes);
      expect(output).toContain('Afternoon tea');
      expect(output).not.toContain('custom-tea');
      expect(output).toContain('ADAPTED FOR THIS MEAL');
      expect(output).toContain('Leftovers from an earlier meal');
      expect(output).toContain('Eating out / takeaway');
      expect(output).not.toContain('OPTIONAL NOTE HIDDEN');
      expect(output).toContain('2027');
      expect(output).toContain('SECTION 2 OF 2');
      expect(output).toContain('cooked');
      expect(output).toContain('Dense-day meal 12:');
      evidence(`plan-${paper.toLowerCase()}.pdf`, result.bytes);
    }
    const bundle = await exportMealPlanPdf(
      mealPlanPdfExportSchema.parse({
        start: '2026-12-28',
        end: '2027-01-04',
        includeImage: false,
        format: 'zip',
      }),
    );
    const names = Object.keys(unzipSync(bundle.bytes));
    expect(names).toContain('meal-schedule.pdf');
    expect(names).toContain('README.txt');
    expect(names.filter((name) => name.startsWith('recipes/'))).toHaveLength(3);
    const calendar = plannedMealsAsIcs('2026-12-28', '2027-01-04');
    expect(calendar).toContain('VALUE=DATE');
    expect(calendar).toContain('20270104');
    expect(calendar).not.toContain(`UID:${first.id}@bord.local`);
  }, 60000);
  it('offers schedule-only recovery rather than silently substituting an unavailable saved revision', async () => {
    const saved = createRecipe(recipe, actor);
    addMealPlanEntry(
      { plannedFor: '2026-12-28', meal: 'dinner', recipeId: saved.id, servings: 4, note: '' },
      actor,
    );
    updateRecipe(saved.id, { ...recipe, title: 'New recipe version' }, actor, 1);
    getDatabase().delete(recipeRevisions).where(eq(recipeRevisions.recipeId, saved.id)).run();
    await expect(
      exportMealPlanPdf(mealPlanPdfExportSchema.parse({ start: '2026-12-28', end: '2026-12-28' })),
    ).rejects.toThrow(/schedule only/);
    const result = await exportMealPlanPdf(
      mealPlanPdfExportSchema.parse({
        start: '2026-12-28',
        end: '2026-12-28',
        includeRecipes: false,
      }),
    );
    expect(text(result.bytes)).toContain(recipe.title);
    expect(getDatabase().select().from(mealPlanEntries).all()[0]!.recipeRevision).toBe(1);
  }, 30000);
  it('preserves shopping states, partial cart/substitution amounts and writable outstanding rows', async () => {
    const list = createManualShoppingList('Shopping state fixture', actor);
    for (const [title, state] of [
      ['To-buy flour', 'to_buy'],
      ['Cart flour', 'in_cart'],
      ['Missing flour', 'cant_find'],
      ['Completed flour', 'sourced'],
    ] as const)
      addShoppingListItem(
        list.id,
        {
          item: title,
          quantity: 0.5,
          unit: 'cup',
          note: 'Saved item note',
          checked: state === 'sourced',
          shoppingState: state,
          cartQuantity: state === 'in_cart' ? 0.25 : 0,
          cartLabel: state === 'in_cart' ? 'Substitute flour' : '',
        },
        actor,
      );
    addShoppingListItem(
      list.id,
      {
        item: 'Independent purchase dimension',
        quantity: 2,
        unit: 'each',
        note: '',
        checked: false,
        shoppingState: 'in_cart',
        cartQuantity: 500,
        cartUnit: 'g',
        cartLabel: 'Reviewed food',
      },
      actor,
    );
    addShoppingListItem(
      list.id,
      { item: 'Unknown quantity', quantity: '', unit: 'g', note: '', checked: false },
      actor,
    );
    for (const paper of ['A4', 'Letter'] as const) {
      const result = await exportShoppingListPdf(
        list.id,
        inventoryPdfExportSchema.parse({ paper, includeChecked: true }),
      );
      const output = text(result.bytes);
      expect(output).toContain('Completed / sourced');
      expect(output).toContain("Can't find");
      expect(output).toContain('In cart');
      expect(output).toContain('Substitute flour');
      expect(output).toContain('to buy');
      expect(output).toContain('To buy: not recorded (g)');
      expect(output).toContain('500 g');
      expect(output).not.toContain('500 each');
      evidence(`shopping-${paper.toLowerCase()}.pdf`, result.bytes);
    }
    const incomplete = await exportShoppingListPdf(
      list.id,
      inventoryPdfExportSchema.parse({ includeChecked: false }),
    );
    expect(text(incomplete.bytes)).not.toContain('Completed flour');
  }, 30000);
  it('prints separate batches and effective date precision, and keeps exact location selection', async () => {
    const parent = createPantryLocation(
      pantryLocationInputSchema.parse({ name: 'Long parent pantry', storageType: 'pantry' }),
      actor,
    );
    const child = createPantryLocation(
      pantryLocationInputSchema.parse({
        name: 'Baking shelf',
        parentId: parent.id,
        storageType: 'pantry',
      }),
      actor,
    );
    const product = createPantryProduct(
      pantryProductInputSchema.parse({
        displayName:
          'A long unbroken identifier SUPPLIEDPRODUCTIDENTIFIER1234567890 and baking ingredient',
        shelfLifeAfterOpeningDays: 7,
      }),
      actor,
    );
    for (let i = 0; i < 18; i++)
      createPantryBatch(
        pantryBatchInputSchema.parse({
          productId: product.id,
          locationId: i === 0 ? parent.id : child.id,
          originalQuantity: i === 1 ? null : 2,
          quantityRemaining: i === 1 ? null : i === 2 ? 0 : 1.5,
          unit: 'kg',
          approximateState: i === 1 ? 'half' : null,
          bestBeforeDate: i === 2 ? '2026-12-31' : '',
          expiryPrecision: i === 2 ? 'month_only' : 'unknown',
          openedDate: i === 3 ? '2026-12-20' : '',
          notes: `Batch ${i + 1}: distinct saved notes for the same product.`,
        }),
        actor,
      );
    for (const paper of ['A4', 'Letter'] as const) {
      const result = await exportPantryPdf(inventoryPdfExportSchema.parse({ paper }));
      const output = text(result.bytes);
      expect(output).toContain('18 stock batches');
      expect(output).toContain('Count');
      expect(output).toContain('month only');
      expect(output).toContain('Calculated after opening:');
      expect(output).toContain('Baking shelf');
      expect(output).toContain('Batch 18:');
      evidence(`pantry-${paper.toLowerCase()}.pdf`, result.bytes);
    }
    const exact = await exportPantryPdf(
      inventoryPdfExportSchema.parse({ locationId: parent.id, countColumn: false }),
    );
    const output = text(exact.bytes);
    expect(output).toContain('1 stock batch');
    expect(output).not.toContain('Baking shelf');
    expect(output).not.toContain('Count');
  }, 60000);
});
