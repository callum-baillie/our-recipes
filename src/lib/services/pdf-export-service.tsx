import 'server-only';

import sharp from 'sharp';
import { readRegularRecipeImage } from '@/lib/storage/recipe-image-storage';
import { getPantryDashboard } from './pantry-service';
import { getShoppingList } from './planning-service';
import { getSupermarketProfile, resolveShoppingAisle } from './list-settings-service';
import { InventoryDocument, type InventoryPrintGroup } from '@/lib/pdf/kitchen-documents';
import type { InventoryPdfExportInput } from '@/lib/domain/pdf-export';
import { renderSerializedDoc } from '@formepdf/core';
import { serialize } from '@formepdf/react';
import { zipSync, strToU8 } from 'fflate';
import { and, eq } from 'drizzle-orm';
import { getDatabase } from '@/lib/db/client';
import { recipeRevisions, recipeImages } from '@/lib/db/schema';
import { recipeInputSchema } from '@/lib/domain/recipe';
import {
  exportDateLabel,
  exportFileStem,
  type RecipePdfExportInput,
  type MealPlanPdfExportInput,
  type PdfExportOptions,
} from '@/lib/domain/pdf-export';
import {
  KitchenDocument,
  type RecipePrintCard,
  type MealPrintSchedule,
} from '@/lib/pdf/kitchen-documents';
import { getRecipe, recipePayloadFromDetail } from './recipe-service';
import { getRecipeForPlannedMeal, listPlannedMeals } from './planning-service';

export class PdfExportError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export type KitchenExport = { bytes: Uint8Array; contentType: string; filename: string };
let tail: Promise<unknown> = Promise.resolve();
let queued = 0;

// Bound concurrent WASM work and memory per server process. No household data is cached.
async function serializedExport(work: () => Promise<KitchenExport>) {
  if (queued >= 4)
    throw new PdfExportError('The print queue is busy. Please try again shortly.', 429);
  queued++;
  const current = tail.catch(() => undefined).then(work);
  tail = current.then(
    () => undefined,
    () => undefined,
  );
  try {
    return await current;
  } finally {
    queued--;
  }
}
function recipeCard(recipeId: string, revision?: number, servings?: number): RecipePrintCard {
  const detail = getRecipe(recipeId);
  if (!detail) throw new PdfExportError('One of the selected recipes no longer exists.', 404);
  let recipe = recipePayloadFromDetail(detail);
  const requestedRevision = revision ?? detail.currentRevision;
  if (requestedRevision !== detail.currentRevision) {
    const saved = getDatabase()
      .select({ snapshot: recipeRevisions.snapshot })
      .from(recipeRevisions)
      .where(
        and(
          eq(recipeRevisions.recipeId, recipeId),
          eq(recipeRevisions.revision, requestedRevision),
        ),
      )
      .get();
    if (!saved)
      throw new PdfExportError(
        'A planned recipe revision is unavailable. Refresh that meal’s recipe before exporting.',
        409,
      );
    try {
      recipe = recipeInputSchema.parse(JSON.parse(saved.snapshot));
    } catch {
      throw new PdfExportError(
        'A planned recipe revision cannot be printed safely. Refresh that meal’s recipe before exporting.',
        409,
      );
    }
  }
  return {
    key: `${recipeId}-${requestedRevision}-${servings ?? 'base'}`,
    recipeId,
    revision: requestedRevision,
    recipe,
    servings,
  };
}
async function render(
  cards: RecipePrintCard[],
  options: PdfExportOptions,
  schedule?: MealPrintSchedule,
) {
  return renderSerializedDoc({
    ...serialize(<KitchenDocument cards={cards} options={options} schedule={schedule} />),
  });
}
async function bundle(
  cards: RecipePrintCard[],
  options: PdfExportOptions,
  stem: string,
  schedule?: MealPrintSchedule,
): Promise<KitchenExport> {
  if (options.format === 'pdf')
    return {
      bytes: await render(cards, options, schedule),
      contentType: 'application/pdf',
      filename: `${stem}.pdf`,
    };
  const files: Record<string, Uint8Array> = {};
  let total = 0;
  if (schedule) {
    files['meal-schedule.pdf'] = await render([], options, schedule);
    total += files['meal-schedule.pdf'].length;
  }
  for (const [index, card] of cards.entries()) {
    const bytes = await render([card], options);
    total += bytes.length;
    if (total > 64 * 1024 * 1024)
      throw new PdfExportError(
        'This print pack is too large. Export fewer recipes at a time.',
        413,
      );
    files[
      `recipes/${String(index + 1).padStart(3, '0')}-${exportFileStem(card.recipe.title)}.pdf`
    ] = bytes;
  }
  files['README.txt'] = strToU8(
    'Bòrd print pack\n\nEach recipe begins in its own PDF. Planned recipe cards use the saved revision and planned serving count. Repeated meals with the same revision and servings share a card.\nMissing nutrition values are unknown, not zero.\n',
  );
  return {
    bytes: zipSync(files, { level: 1 }),
    contentType: 'application/zip',
    filename: `${stem}.zip`,
  };
}
export function exportRecipesPdf(input: RecipePdfExportInput) {
  return serializedExport(async () => {
    const cards = input.recipeIds.map((id) => recipeCard(id, undefined, input.servings));
    await prepareCards(cards, input);
    return bundle(
      cards,
      input,
      cards.length === 1 ? exportFileStem(cards[0]!.recipe.title) : 'bord-recipe-cards',
    );
  });
}
export function exportMealPlanPdf(input: MealPlanPdfExportInput) {
  return serializedExport(async () => {
    const meals = listPlannedMeals(input.start, input.end).filter(
      (meal) => !['cancelled', 'skipped'].includes(meal.effectiveStatus),
    );
    if (meals.length > 500)
      throw new PdfExportError(
        'Choose a smaller date range: this plan contains more than 500 meals.',
        413,
      );
    const cards = new Map<string, RecipePrintCard>();
    const schedule: MealPrintSchedule = {
      start: input.start,
      end: input.end,
      meals: meals.map((meal) => {
        let cardKey: string | null = null;
        if (input.includeRecipes && meal.recipeId) {
          cardKey = meal.recipeOverride
            ? `adapted-${meal.id}`
            : `${meal.recipeId}-${meal.recipeRevision ?? 'current'}-${meal.servings}`;
          if (!cards.has(cardKey))
            cards.set(
              cardKey,
              meal.recipeOverride
                ? {
                    key: cardKey,
                    recipeId: meal.recipeId,
                    revision: meal.recipeRevision ?? 1,
                    recipe: recipePayloadFromDetail(
                      getRecipeForPlannedMeal(meal.recipeId, meal.id)!,
                    ),
                    servings: meal.servings,
                  }
                : recipeCard(meal.recipeId, meal.recipeRevision ?? undefined, meal.servings),
            );
          const card = cards.get(cardKey)!;
          (card.occasions ??= []).push(`${exportDateLabel(meal.plannedFor)} ${meal.meal}`);
        }
        return {
          id: meal.id,
          date: meal.plannedFor,
          slot: meal.meal,
          title: meal.recipeTitle,
          servings: meal.servings,
          note: [
            meal.kind === 'leftover'
              ? 'Leftovers from an earlier meal'
              : meal.kind === 'takeout'
                ? 'Takeout'
                : '',
            meal.recipeOverride ? 'Recipe adapted for this meal' : '',
            meal.note,
          ]
            .filter(Boolean)
            .join(' · '),
          status: meal.effectiveStatus,
          cardKey,
        };
      }),
    };
    if (cards.size > 100)
      throw new PdfExportError(
        'Choose a smaller range or export the schedule only. A pack can include up to 100 recipe cards.',
        413,
      );
    await prepareCards([...cards.values()], input);
    return bundle(
      [...cards.values()],
      input,
      `bord-meal-plan-${input.start}-to-${input.end}`,
      schedule,
    );
  });
}

async function prepareCards(cards: RecipePrintCard[], options: PdfExportOptions) {
  const store =
    options.organizeByStore && options.storeId
      ? getSupermarketProfile(options.storeId, false)
      : null;
  if (options.organizeByStore && !store)
    throw new PdfExportError('Choose an available store for aisle ordering.');
  for (const card of cards) {
    if (store) {
      const groups = new Map<
        string,
        RecipePrintCard['recipe']['ingredientGroups'][number]['ingredients']
      >();
      for (const ingredient of card.recipe.ingredientGroups.flatMap((group) => group.ingredients)) {
        const aisle = resolveShoppingAisle(store.id, { item: ingredient.item }) ?? 'unassigned';
        const items = groups.get(aisle) ?? [];
        items.push(ingredient);
        groups.set(aisle, items);
      }
      card.recipe = {
        ...card.recipe,
        ingredientGroups: [
          ...store.sections
            .filter((section) => groups.has(section.aisleId))
            .map((section) => ({ name: section.name, ingredients: groups.get(section.aisleId)! })),
          ...(groups.has('unassigned')
            ? [{ name: 'Other / aisle not assigned', ingredients: groups.get('unassigned')! }]
            : []),
        ],
      };
    }
    if (options.includeImage) {
      const image = getDatabase()
        .select()
        .from(recipeImages)
        .where(eq(recipeImages.recipeId, card.recipeId))
        .get();
      if (image) {
        try {
          const bytes = await readRegularRecipeImage(image.storageKey);
          card.image =
            'data:image/jpeg;base64,' +
            (
              await sharp(bytes).resize(960, 360, { fit: 'cover' }).jpeg({ quality: 75 }).toBuffer()
            ).toString('base64');
        } catch {
          /* A missing local photo must not prevent printing the recipe. */
        }
      }
    }
  }
}
function groupedInventory(
  rows: Array<{ group: string; label: string; quantity: string; detail?: string; note?: string }>,
): InventoryPrintGroup[] {
  const groups = new Map<string, InventoryPrintGroup>();
  for (const { group, ...row } of rows) {
    const entry = groups.get(group) ?? { name: group, rows: [] };
    entry.rows.push(row);
    groups.set(group, entry);
  }
  return [...groups.values()];
}
async function inventoryExport(
  title: string,
  groups: InventoryPrintGroup[],
  options: InventoryPdfExportInput,
  note?: string,
): Promise<KitchenExport> {
  if (groups.reduce((sum, group) => sum + group.rows.length, 0) > 2000)
    throw new PdfExportError('Print fewer than 2,000 items at a time.', 413);
  const bytes = await renderSerializedDoc({
    ...serialize(<InventoryDocument title={title} groups={groups} options={options} note={note} />),
  });
  return {
    bytes: options.format === 'zip' ? zipSync({ [`${exportFileStem(title)}.pdf`]: bytes }) : bytes,
    contentType: options.format === 'zip' ? 'application/zip' : 'application/pdf',
    filename: `${exportFileStem(title)}.${options.format}`,
  };
}
export function exportPantryPdf(options: InventoryPdfExportInput) {
  return serializedExport(async () => {
    const rows = getPantryDashboard()
      .batches.filter((batch) => !options.locationId || batch.locationId === options.locationId)
      .map((batch) => ({
        group: batch.location.path,
        label: batch.product.displayName,
        quantity: batch.quantityLabel,
        detail:
          options.includeDates && batch.expiry.date
            ? `${batch.expiry.kind.replaceAll('_', ' ')}: ${batch.expiry.date}`
            : '',
        note: batch.notes,
      }));
    return inventoryExport('Pantry inventory', groupedInventory(rows), options);
  });
}
export function exportShoppingListPdf(listId: string, options: InventoryPdfExportInput) {
  return serializedExport(async () => {
    const list = getShoppingList(listId);
    if (!list) throw new PdfExportError('Shopping list not found.', 404);
    const store = getSupermarketProfile(
      options.organizeByStore ? (options.storeId ?? null) : list.supermarketProfileId,
      false,
    );
    if (options.organizeByStore && (!options.storeId || !store))
      throw new PdfExportError('Choose a store before using a store route.', 400);
    const sections =
      store?.sections ?? list.aisles.map((aisle) => ({ aisleId: aisle.id, name: aisle.name }));
    const rows = list.items
      .filter((item) => options.includeChecked || !item.checked)
      .map((item) => {
        const aisle =
          options.organizeByStore && store
            ? resolveShoppingAisle(store.id, { item: item.item })
            : item.aisleId;
        return {
          group:
            sections.find((section) => section.aisleId === aisle)?.name ??
            'Other / aisle not assigned',
          label: item.item,
          quantity: [
            item.quantity === null ? 'Quantity not recorded' : String(item.quantity),
            item.unit,
          ]
            .filter(Boolean)
            .join(' '),
          note: item.note,
        };
      })
      .sort((a, b) => {
        const rank = (name: string) => {
          const index = sections.findIndex((section) => section.name === name);
          return index < 0 ? sections.length : index;
        };
        return rank(a.group) - rank(b.group);
      });
    return inventoryExport(
      list.name,
      groupedInventory(rows),
      { ...options, countColumn: false },
      list.notes,
    );
  });
}
