import 'server-only';
import { and, desc, eq, max } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import {
  foodNutrientValues,
  foodNutritionRecords,
  nutrientDefinitions,
  nutritionCalculationVersions,
  nutritionDataSources,
  pantryProducts,
  recipeNutrientValues,
  recipeNutritionCalculations,
  recipeNutritionContributions,
  recipes,
} from '@/lib/db/schema';
import {
  calculationVersionInputSchema,
  foodNutritionRecordInputSchema,
  nutritionSourceInputSchema,
  recipeNutritionCalculationInputSchema,
  type CalculationVersionInput,
  type FoodNutritionRecordInput,
  type NutritionSourceInput,
  type RecipeNutritionCalculationInput,
} from '@/lib/domain/nutrition-record';

type Db = ReturnType<typeof getDatabase>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;
export class NutritionFoundationNotFoundError extends Error {}
export class NutritionFoundationConflictError extends Error {}
export class NutritionFoundationIntegrityError extends Error {}
export type FoodNutritionRecordView = typeof foodNutritionRecords.$inferSelect & {
  source: typeof nutritionDataSources.$inferSelect;
  values: Array<typeof foodNutrientValues.$inferSelect>;
};
export type RecipeNutritionCalculationView = typeof recipeNutritionCalculations.$inferSelect & {
  source: typeof nutritionDataSources.$inferSelect;
  calculationVersion: typeof nutritionCalculationVersions.$inferSelect;
  contributions: Array<typeof recipeNutritionContributions.$inferSelect>;
  values: Array<typeof recipeNutrientValues.$inferSelect>;
};

function db() {
  ensureDatabase();
  return getDatabase();
}
function required<T>(value: T | undefined, message: string): T {
  if (!value) throw new NutritionFoundationNotFoundError(message);
  return value;
}
function source(executor: Executor, id: string) {
  return required(
    executor.select().from(nutritionDataSources).where(eq(nutritionDataSources.id, id)).get(),
    'Nutrition data source was not found.',
  );
}
function foodView(
  executor: Executor,
  record: typeof foodNutritionRecords.$inferSelect,
): FoodNutritionRecordView {
  return {
    ...record,
    source: source(executor, record.sourceId),
    values: executor
      .select()
      .from(foodNutrientValues)
      .where(eq(foodNutrientValues.recordId, record.id))
      .all(),
  };
}
function recipeView(
  executor: Executor,
  calculation: typeof recipeNutritionCalculations.$inferSelect,
): RecipeNutritionCalculationView {
  return {
    ...calculation,
    source: source(executor, calculation.sourceId),
    calculationVersion: required(
      executor
        .select()
        .from(nutritionCalculationVersions)
        .where(eq(nutritionCalculationVersions.id, calculation.calculationVersionId))
        .get(),
      'Nutrition calculation version was not found.',
    ),
    contributions: executor
      .select()
      .from(recipeNutritionContributions)
      .where(eq(recipeNutritionContributions.calculationId, calculation.id))
      .all(),
    values: executor
      .select()
      .from(recipeNutrientValues)
      .where(eq(recipeNutrientValues.calculationId, calculation.id))
      .all(),
  };
}

export function listNutrientDefinitions() {
  return db().select().from(nutrientDefinitions).orderBy(nutrientDefinitions.displayOrder).all();
}
export function createNutritionDataSource(raw: NutritionSourceInput) {
  const input = nutritionSourceInputSchema.parse(raw);
  const id = input.id ?? randomUUID();
  try {
    db()
      .insert(nutritionDataSources)
      .values({ ...input, id, metadata: JSON.stringify(input.metadata), createdAt: new Date() })
      .run();
  } catch (error) {
    throw new NutritionFoundationConflictError(
      `Nutrition data source already exists: ${error instanceof Error ? error.message : 'conflict'}`,
    );
  }
  return db().select().from(nutritionDataSources).where(eq(nutritionDataSources.id, id)).get()!;
}
export function listNutritionDataSources() {
  return db()
    .select()
    .from(nutritionDataSources)
    .orderBy(desc(nutritionDataSources.priority), nutritionDataSources.name)
    .all();
}

export function appendFoodNutritionRecord(raw: FoodNutritionRecordInput): FoodNutritionRecordView {
  const input = foodNutritionRecordInputSchema.parse(raw);
  return db().transaction((transaction) => {
    required(
      transaction
        .select({ id: pantryProducts.id })
        .from(pantryProducts)
        .where(eq(pantryProducts.id, input.productId))
        .get(),
      'Pantry product was not found.',
    );
    source(transaction, input.sourceId);
    const previous = input.supersedesRecordId
      ? required(
          transaction
            .select()
            .from(foodNutritionRecords)
            .where(eq(foodNutritionRecords.id, input.supersedesRecordId))
            .get(),
          'Superseded food nutrition record was not found.',
        )
      : undefined;
    if (previous && previous.productId !== input.productId)
      throw new NutritionFoundationIntegrityError(
        'A food nutrition revision can only supersede a record for the same product.',
      );
    const current =
      transaction
        .select({ value: max(foodNutritionRecords.revision) })
        .from(foodNutritionRecords)
        .where(eq(foodNutritionRecords.productId, input.productId))
        .get()?.value ?? 0;
    if (current > 0 && !previous)
      throw new NutritionFoundationConflictError(
        'A later product record must explicitly identify the revision it supersedes.',
      );
    if (previous && previous.revision !== current)
      throw new NutritionFoundationConflictError(
        'Only the latest product nutrition revision can be superseded.',
      );
    const record = {
      id: randomUUID(),
      productId: input.productId,
      revision: current + 1,
      sourceId: input.sourceId,
      sourceRecordKey: input.sourceRecordKey,
      basisType: input.basisType,
      basisAmount: input.basisAmount,
      basisUnit: input.basisUnit,
      servingWeightGrams: input.servingWeightGrams,
      densityGramsPerMilliliter: input.densityGramsPerMilliliter,
      pieceWeightGrams: input.pieceWeightGrams,
      confidence: input.confidence,
      completeness: input.completeness,
      supersedesRecordId: input.supersedesRecordId,
      recordedByProfileId: input.recordedByProfileId,
      notes: input.notes,
      createdAt: new Date(),
    } satisfies typeof foodNutritionRecords.$inferInsert;
    transaction.insert(foodNutritionRecords).values(record).run();
    transaction
      .insert(foodNutrientValues)
      .values(
        input.values.map((value) => ({
          recordId: record.id,
          nutrientCode: value.nutrientCode,
          amount: value.amount,
          confidence: value.confidence,
          sourceNote: value.sourceNote,
        })),
      )
      .run();
    return foodView(transaction, record);
  });
}

export function getFoodNutritionRecord(id: string) {
  const database = db();
  return foodView(
    database,
    required(
      database.select().from(foodNutritionRecords).where(eq(foodNutritionRecords.id, id)).get(),
      'Food nutrition record was not found.',
    ),
  );
}
export function selectPreferredFoodNutritionRecord(
  productId: string,
): FoodNutritionRecordView | null {
  const database = db();
  const candidate = database
    .select({ record: foodNutritionRecords })
    .from(foodNutritionRecords)
    .innerJoin(nutritionDataSources, eq(foodNutritionRecords.sourceId, nutritionDataSources.id))
    .where(eq(foodNutritionRecords.productId, productId))
    .orderBy(
      desc(nutritionDataSources.priority),
      desc(foodNutritionRecords.revision),
      desc(foodNutritionRecords.createdAt),
    )
    .get();
  return candidate ? foodView(database, candidate.record) : null;
}

export function registerCalculationVersion(raw: CalculationVersionInput) {
  const input = calculationVersionInputSchema.parse(raw);
  const id = input.id ?? randomUUID();
  try {
    db()
      .insert(nutritionCalculationVersions)
      .values({ ...input, id, metadata: JSON.stringify(input.metadata), createdAt: new Date() })
      .run();
  } catch (error) {
    throw new NutritionFoundationConflictError(
      `Nutrition calculation version already exists: ${error instanceof Error ? error.message : 'conflict'}`,
    );
  }
  return db()
    .select()
    .from(nutritionCalculationVersions)
    .where(eq(nutritionCalculationVersions.id, id))
    .get()!;
}

export function appendRecipeNutritionCalculation(
  raw: RecipeNutritionCalculationInput,
): RecipeNutritionCalculationView {
  const input = recipeNutritionCalculationInputSchema.parse(raw);
  return db().transaction((transaction) => {
    const recipe = required(
      transaction.select().from(recipes).where(eq(recipes.id, input.recipeId)).get(),
      'Recipe was not found.',
    );
    if (input.recipeRevision > recipe.currentRevision)
      throw new NutritionFoundationIntegrityError(
        'A nutrition calculation cannot target a future recipe revision.',
      );
    source(transaction, input.sourceId);
    required(
      transaction
        .select({ id: nutritionCalculationVersions.id })
        .from(nutritionCalculationVersions)
        .where(eq(nutritionCalculationVersions.id, input.calculationVersionId))
        .get(),
      'Nutrition calculation version was not found.',
    );
    if (
      transaction
        .select({ id: recipeNutritionCalculations.id })
        .from(recipeNutritionCalculations)
        .where(
          and(
            eq(recipeNutritionCalculations.recipeId, input.recipeId),
            eq(recipeNutritionCalculations.recipeRevision, input.recipeRevision),
            eq(recipeNutritionCalculations.sourceDigest, input.sourceDigest),
          ),
        )
        .get()
    )
      throw new NutritionFoundationConflictError(
        'This recipe revision and source digest were already calculated.',
      );
    const previous = input.supersedesCalculationId
      ? required(
          transaction
            .select()
            .from(recipeNutritionCalculations)
            .where(eq(recipeNutritionCalculations.id, input.supersedesCalculationId))
            .get(),
          'Superseded recipe calculation was not found.',
        )
      : undefined;
    if (previous && previous.recipeId !== input.recipeId)
      throw new NutritionFoundationIntegrityError(
        'A recipe nutrition revision can only supersede a calculation for the same recipe.',
      );
    const current =
      transaction
        .select({ value: max(recipeNutritionCalculations.revision) })
        .from(recipeNutritionCalculations)
        .where(eq(recipeNutritionCalculations.recipeId, input.recipeId))
        .get()?.value ?? 0;
    if (current > 0 && !previous)
      throw new NutritionFoundationConflictError(
        'A later recipe calculation must explicitly identify the revision it supersedes.',
      );
    if (previous && previous.revision !== current)
      throw new NutritionFoundationConflictError(
        'Only the latest recipe nutrition calculation can be superseded.',
      );
    const calculation = {
      id: randomUUID(),
      recipeId: input.recipeId,
      recipeRevision: input.recipeRevision,
      revision: current + 1,
      calculationVersionId: input.calculationVersionId,
      sourceId: input.sourceId,
      sourceDigest: input.sourceDigest,
      servingCount: input.servingCount,
      finalWeightGrams: input.finalWeightGrams,
      confidence: input.confidence,
      completeness: input.completeness,
      supersedesCalculationId: input.supersedesCalculationId,
      calculatedByProfileId: input.calculatedByProfileId,
      notes: input.notes,
      createdAt: new Date(),
    } satisfies typeof recipeNutritionCalculations.$inferInsert;
    transaction.insert(recipeNutritionCalculations).values(calculation).run();
    if (input.contributions.length)
      transaction
        .insert(recipeNutritionContributions)
        .values(
          input.contributions.map((item) => ({
            id: randomUUID(),
            calculationId: calculation.id,
            recipeIngredientId: item.recipeIngredientId,
            productNutritionRecordId: item.productNutritionRecordId,
            amountMultiplier: item.amountMultiplier,
            ediblePortion: item.ediblePortion,
            drainedYield: item.drainedYield,
            optionalIncluded: item.optionalIncluded,
            retentionFactors: JSON.stringify(item.retentionFactors),
            confidence: item.confidence,
            completeness: item.completeness,
            missingReason: item.missingReason,
            createdAt: new Date(),
          })),
        )
        .run();
    transaction
      .insert(recipeNutrientValues)
      .values(
        input.values.map((value) => ({
          calculationId: calculation.id,
          nutrientCode: value.nutrientCode,
          amount: value.amount,
          confidence: value.confidence,
          completeness: value.completeness,
        })),
      )
      .run();
    return recipeView(transaction, calculation);
  });
}
export function getRecipeNutritionCalculation(id: string) {
  const database = db();
  return recipeView(
    database,
    required(
      database
        .select()
        .from(recipeNutritionCalculations)
        .where(eq(recipeNutritionCalculations.id, id))
        .get(),
      'Recipe nutrition calculation was not found.',
    ),
  );
}
export function getLatestRecipeNutritionCalculation(
  recipeId: string,
): RecipeNutritionCalculationView | null {
  const database = db();
  const result = database
    .select()
    .from(recipeNutritionCalculations)
    .where(eq(recipeNutritionCalculations.recipeId, recipeId))
    .orderBy(desc(recipeNutritionCalculations.revision))
    .get();
  return result ? recipeView(database, result) : null;
}
