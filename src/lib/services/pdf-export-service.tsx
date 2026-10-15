import 'server-only';

import { renderSerializedDoc } from '@formepdf/core';
import { serialize } from '@formepdf/react';
import { zipSync, strToU8 } from 'fflate';
import { and, eq } from 'drizzle-orm';
import { getDatabase } from '@/lib/db/client';
import { recipeRevisions } from '@/lib/db/schema';
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
import { listPlannedMeals } from './planning-service';

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
          cardKey = `${meal.recipeId}-${meal.recipeRevision ?? 'current'}-${meal.servings}`;
          if (!cards.has(cardKey))
            cards.set(
              cardKey,
              recipeCard(meal.recipeId, meal.recipeRevision ?? undefined, meal.servings),
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
          note: meal.note,
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
    return bundle(
      [...cards.values()],
      input,
      `bord-meal-plan-${input.start}-to-${input.end}`,
      schedule,
    );
  });
}
