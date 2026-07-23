import 'server-only';

import { and, asc, desc, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { z } from 'zod';

import { ensureDatabase, getDatabase, getSqliteDatabase } from '@/lib/db/client';
import {
  foodNutritionRecords,
  nutritionCalculationVersions,
  nutritionDataSources,
  pantryProducts,
  recipeIngredientGroups,
  recipeIngredientProductMappings,
  recipeIngredients,
  recipeNutritionCalculations,
  recipes,
} from '@/lib/db/schema';
import {
  ingredientFoodRecordMultiplier,
  manualFoodNutritionRecordSchema,
  recipeCalculationRequestSchema,
  recipeConsumptionRequestSchema,
  strictRecipeServingCount,
  type ManualFoodNutritionRecordInput,
  type RecipeCalculationRequest,
  type RecipeConsumptionRequest,
} from '@/lib/domain/nutrition-recipe-calculation';
import { presentRecipeNutrition } from '@/lib/domain/nutrition-recipe-presentation';
import type { NutritionMutationActorInput } from '@/lib/domain/nutrition-household';
import {
  DEFAULT_DASHBOARD_NUTRIENTS,
  NUTRIENT_CODES,
  aggregateRecipeNutrition,
  resolveEnergy,
  scaleNutrientAmounts,
  type NutrientAmounts,
  type NutrientCode,
  type NutritionContribution,
} from '@/lib/domain/nutrition';
import {
  appendFoodNutritionRecord,
  appendRecipeNutritionCalculation,
  getFoodNutritionRecord,
  getLatestRecipeNutritionCalculation,
  getRecipeNutritionCalculation,
  selectPreferredFoodNutritionRecord,
  type RecipeNutritionCalculationView,
} from '@/lib/services/nutrition-foundation-service';
import {
  NutritionIntakeIntegrityError,
  appendNutritionIntakeRevision,
  getNutritionIntakeRevisionForUpdate,
} from '@/lib/services/nutrition-intake-service';

const MANUAL_SOURCE_ID = 'bord_manual_food_records_v1';
const CALCULATED_SOURCE_ID = 'bord_recipe_calculator_v1';
const CALCULATION_VERSION_ID = 'bord_recipe_calculator_v2';
const CALCULATION_DIGEST =
  'recipe-calculator-v2-preparation-evidence-final-weight-weighed-portions';

export class NutritionRecipeNotFoundError extends Error {}
export class NutritionRecipeConflictError extends Error {}
export class NutritionRecipeIntegrityError extends Error {}

function db() {
  ensureDatabase();
  return getDatabase();
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new NutritionRecipeNotFoundError(message);
  return value;
}

function stableDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function ensureBuiltInIdentities() {
  const database = db();
  const now = new Date();
  database
    .insert(nutritionDataSources)
    .values({
      id: MANUAL_SOURCE_ID,
      sourceType: 'manual',
      name: 'Household manual food record',
      provider: 'Bòrd',
      version: '1',
      sourceUrl: '',
      citation: 'Nutrition label or value entered by a household member.',
      license: '',
      retrievedAt: null,
      priority: 20,
      metadata: JSON.stringify({ verified: false, manuallyEdited: true }),
      createdAt: now,
    })
    .onConflictDoNothing()
    .run();
  database
    .insert(nutritionDataSources)
    .values({
      id: CALCULATED_SOURCE_ID,
      sourceType: 'calculated',
      name: 'Bòrd ingredient calculation',
      provider: 'Bòrd',
      version: '1',
      sourceUrl: '',
      citation: 'Calculated from immutable product nutrition records and recipe quantities.',
      license: '',
      retrievedAt: null,
      priority: 10,
      metadata: JSON.stringify({ rawIngredientEstimate: true }),
      createdAt: now,
    })
    .onConflictDoNothing()
    .run();
  database
    .insert(nutritionCalculationVersions)
    .values({
      id: CALCULATION_VERSION_ID,
      algorithm: 'bord_recipe_nutrition',
      version: '2',
      energyFactorsVersion: 'general-4-4-9-7-v1',
      retentionFactorsVersion: 'not-applied',
      implementationDigest: CALCULATION_DIGEST,
      metadata: JSON.stringify({
        unitPolicy: 'same-family-or-explicit-density-piece-serving-weight',
        speculativeRetention: false,
        preparationPolicy: 'explicit-exclusion-substitution-edible-drained-evidence',
      }),
      createdAt: now,
    })
    .onConflictDoNothing()
    .run();
  const manualSource = database
    .select()
    .from(nutritionDataSources)
    .where(eq(nutritionDataSources.id, MANUAL_SOURCE_ID))
    .get();
  if (
    !manualSource ||
    manualSource.sourceType !== 'manual' ||
    manualSource.name !== 'Household manual food record' ||
    manualSource.version !== '1'
  ) {
    throw new NutritionRecipeIntegrityError(
      'The built-in manual Nutrition source is inconsistent.',
    );
  }
  const calculatedSource = database
    .select()
    .from(nutritionDataSources)
    .where(eq(nutritionDataSources.id, CALCULATED_SOURCE_ID))
    .get();
  if (
    !calculatedSource ||
    calculatedSource.sourceType !== 'calculated' ||
    calculatedSource.name !== 'Bòrd ingredient calculation' ||
    calculatedSource.version !== '1'
  ) {
    throw new NutritionRecipeIntegrityError(
      'The built-in calculated Nutrition source is inconsistent.',
    );
  }
  const calculationVersion = database
    .select()
    .from(nutritionCalculationVersions)
    .where(eq(nutritionCalculationVersions.id, CALCULATION_VERSION_ID))
    .get();
  if (
    !calculationVersion ||
    calculationVersion.algorithm !== 'bord_recipe_nutrition' ||
    calculationVersion.version !== '2' ||
    calculationVersion.implementationDigest !== CALCULATION_DIGEST
  ) {
    throw new NutritionRecipeIntegrityError(
      'The built-in recipe calculation version is inconsistent.',
    );
  }
}

export function appendManualProductNutritionRecord(
  productId: string,
  raw: ManualFoodNutritionRecordInput,
) {
  const id = z.string().uuid().parse(productId);
  const input = manualFoodNutritionRecordSchema.parse(raw);
  ensureBuiltInIdentities();
  return appendFoodNutritionRecord({
    ...input,
    productId: id,
    sourceId: MANUAL_SOURCE_ID,
    recordedByProfileId: null,
  });
}

export function listProductNutritionRecordHistory(productId: string) {
  const id = z.string().uuid().parse(productId);
  return db()
    .select({ id: foodNutritionRecords.id })
    .from(foodNutritionRecords)
    .where(eq(foodNutritionRecords.productId, id))
    .orderBy(desc(foodNutritionRecords.revision))
    .all()
    .map((row) => getFoodNutritionRecord(row.id));
}

type PreparedContribution = {
  persisted: {
    recipeIngredientId: string;
    productNutritionRecordId: string | null;
    amountMultiplier: number;
    ediblePortion: number;
    drainedYield: number;
    optionalIncluded: boolean;
    retentionFactors: Partial<Record<NutrientCode, number>>;
    confidence: number;
    completeness: number;
    missingReason: string;
  };
  aggregate: NutritionContribution;
  digest: Record<string, unknown>;
};

function calculationSummary(calculation: RecipeNutritionCalculationView | null) {
  if (!calculation) return null;
  let method = 'supplied';
  let warnings: string[] = [];
  try {
    const notes = JSON.parse(calculation.notes) as { energyMethod?: string; warnings?: string[] };
    method = notes.energyMethod ?? method;
    warnings = notes.warnings ?? warnings;
  } catch {
    // Older calculation notes may be plain text.
  }
  return {
    id: calculation.id,
    recipeId: calculation.recipeId,
    recipeRevision: calculation.recipeRevision,
    revision: calculation.revision,
    servingCount: calculation.servingCount,
    finalWeightGrams: calculation.finalWeightGrams,
    servingWeightGrams:
      calculation.finalWeightGrams && calculation.servingCount
        ? calculation.finalWeightGrams / calculation.servingCount
        : null,
    confidence: calculation.confidence,
    completeness: calculation.completeness,
    sourceDigest: calculation.sourceDigest,
    energyMethod: method,
    warnings,
    createdAt: calculation.createdAt.toISOString(),
    values: calculation.values.map((value) => ({
      nutrientCode: value.nutrientCode,
      amount: value.amount,
      perServing: calculation.servingCount ? value.amount / calculation.servingCount : null,
      per100g: calculation.finalWeightGrams
        ? (value.amount / calculation.finalWeightGrams) * 100
        : null,
      confidence: value.confidence,
      completeness: value.completeness,
    })),
    contributions: calculation.contributions.map((item) => ({
      recipeIngredientId: item.recipeIngredientId,
      productNutritionRecordId: item.productNutritionRecordId,
      amountMultiplier: item.amountMultiplier,
      ediblePortion: item.ediblePortion,
      drainedYield: item.drainedYield,
      retentionFactors: item.retentionFactors,
      optionalIncluded: item.optionalIncluded,
      confidence: item.confidence,
      completeness: item.completeness,
      missingReason: item.missingReason,
    })),
    source: {
      id: calculation.source.id,
      name: calculation.source.name,
      provider: calculation.source.provider,
      version: calculation.source.version,
    },
    calculationVersion: {
      id: calculation.calculationVersion.id,
      algorithm: calculation.calculationVersion.algorithm,
      version: calculation.calculationVersion.version,
      energyFactorsVersion: calculation.calculationVersion.energyFactorsVersion,
      implementationDigest: calculation.calculationVersion.implementationDigest,
    },
  };
}

export function calculateRecipeNutrition(recipeId: string, raw: RecipeCalculationRequest = {}) {
  const id = z.string().uuid().parse(recipeId);
  const input = recipeCalculationRequestSchema.parse(raw);
  ensureBuiltInIdentities();
  const database = db();
  const recipe = required(
    database.select().from(recipes).where(eq(recipes.id, id)).get(),
    'Recipe was not found.',
  );
  const includedOptional = new Set(input.includedOptionalIngredientIds);
  const excluded = new Set(input.excludedIngredientIds);
  const substitutions = new Map(
    input.substitutions.map((item) => [item.recipeIngredientId, item.productId]),
  );
  const preparationFactors = new Map(
    input.preparationFactors.map((item) => [item.recipeIngredientId, item]),
  );
  const rows = database
    .select({
      ingredient: recipeIngredients,
      productId: recipeIngredientProductMappings.productId,
      matchType: recipeIngredientProductMappings.matchType,
      compatibleVariant: recipeIngredientProductMappings.compatibleVariant,
      isOptional: recipeIngredientProductMappings.isOptional,
    })
    .from(recipeIngredients)
    .leftJoin(
      recipeIngredientProductMappings,
      eq(recipeIngredientProductMappings.recipeIngredientId, recipeIngredients.id),
    )
    .where(eq(recipeIngredients.recipeId, id))
    .orderBy(asc(recipeIngredients.position))
    .all();

  const ingredientIds = new Set(rows.map((row) => row.ingredient.id));
  for (const requestedId of [
    ...input.includedOptionalIngredientIds,
    ...input.excludedIngredientIds,
    ...substitutions.keys(),
    ...preparationFactors.keys(),
  ]) {
    if (!ingredientIds.has(requestedId)) {
      throw new NutritionRecipeIntegrityError(
        'A preparation adjustment references an ingredient outside this recipe.',
      );
    }
  }

  const prepared: PreparedContribution[] = rows.map((row) => {
    const optional = row.isOptional ?? false;
    const included =
      !excluded.has(row.ingredient.id) && (!optional || includedOptional.has(row.ingredient.id));
    const substitutionProductId = substitutions.get(row.ingredient.id) ?? null;
    const selectedProductId = substitutionProductId ?? row.productId;
    if (substitutionProductId) {
      required(
        database
          .select({ id: pantryProducts.id })
          .from(pantryProducts)
          .where(eq(pantryProducts.id, substitutionProductId))
          .get(),
        'Substitution product was not found.',
      );
    }
    const record = selectedProductId ? selectPreferredFoodNutritionRecord(selectedProductId) : null;
    if (substitutionProductId && !record) {
      throw new NutritionRecipeIntegrityError(
        'A substitution requires a current immutable Nutrition record.',
      );
    }
    const factor = preparationFactors.get(row.ingredient.id);
    const ediblePortion = factor?.ediblePortion ?? 1;
    const drainedYield = factor?.drainedYield ?? 1;
    let multiplier = 0;
    let method = '';
    let missingReason = '';
    if (!included)
      missingReason = optional
        ? 'Optional ingredient excluded from this calculation.'
        : 'Required ingredient explicitly excluded from this preparation.';
    else if (!selectedProductId) missingReason = 'Ingredient is not mapped to a Pantry product.';
    else if (!record) missingReason = 'Mapped product has no nutrition record.';
    else {
      const result = ingredientFoodRecordMultiplier(
        row.ingredient.quantity,
        row.ingredient.unit,
        record,
      );
      if (result.supported) {
        multiplier = result.multiplier;
        method = result.method;
      } else missingReason = result.missingReason;
    }
    const confidence = included && record && multiplier > 0 ? record.confidence : 0;
    const completeness = included && record && multiplier > 0 ? record.completeness : 0;
    const amounts = Object.fromEntries(
      (record?.values ?? []).map((value) => [value.nutrientCode, value.amount]),
    ) as NutrientAmounts;
    return {
      persisted: {
        recipeIngredientId: row.ingredient.id,
        productNutritionRecordId: record?.id ?? null,
        amountMultiplier: multiplier,
        ediblePortion,
        drainedYield,
        optionalIncluded: included,
        retentionFactors: {},
        confidence,
        completeness,
        missingReason,
      },
      aggregate: {
        id: row.ingredient.id,
        amounts,
        included,
        optional,
        amountMultiplier: multiplier * ediblePortion * drainedYield,
        confidence,
      },
      digest: {
        ingredientId: row.ingredient.id,
        quantity: row.ingredient.quantity,
        unit: row.ingredient.unit,
        item: row.ingredient.item,
        note: row.ingredient.note,
        mappedProductId: row.productId,
        selectedProductId,
        substitutionProductId,
        productNutritionRecordId: record?.id ?? null,
        productNutritionRevision: record?.revision ?? null,
        matchType: row.matchType,
        compatibleVariant: row.compatibleVariant,
        optional,
        included,
        multiplier,
        ediblePortion,
        drainedYield,
        preparationEvidenceNote: factor?.evidenceNote ?? '',
        method,
        missingReason,
      },
    };
  });

  const aggregate = aggregateRecipeNutrition(
    prepared.map((item) => item.aggregate),
    NUTRIENT_CODES,
  );
  const amounts = { ...aggregate.amounts };
  const energy = resolveEnergy(amounts);
  if (energy.kcal !== null && amounts.energy_kcal === undefined) amounts.energy_kcal = energy.kcal;
  const included = prepared.filter((item) => item.persisted.optionalIncluded);
  const completeness = included.length
    ? included.reduce((sum, item) => sum + item.persisted.completeness, 0) / included.length
    : 0;
  const confidence = included.length
    ? included.reduce((sum, item) => sum + item.persisted.confidence, 0) / included.length
    : 0;
  const nutrientCompleteness: Partial<Record<NutrientCode, number>> = {};
  const nutrientConfidence: Partial<Record<NutrientCode, number>> = {};
  for (const code of NUTRIENT_CODES) {
    const known = included.filter((item) => item.aggregate.amounts[code] !== undefined);
    nutrientCompleteness[code] = included.length
      ? known.reduce((sum, item) => sum + item.persisted.completeness, 0) / included.length
      : 0;
    nutrientConfidence[code] = known.length
      ? Math.min(...known.map((item) => item.persisted.confidence))
      : 0;
  }
  const warnings = prepared
    .filter((item) => item.persisted.optionalIncluded && item.persisted.missingReason)
    .map((item) => item.persisted.missingReason);
  if (strictRecipeServingCount(recipe.servings) === null) {
    warnings.push('Recipe serving text is ambiguous; per-serving values are unavailable.');
  }
  if (energy.inconsistency) warnings.push('Supplied energy differs materially from macro energy.');
  if (energy.method === 'macro-fallback')
    warnings.push('Energy uses the documented macro fallback.');
  if (input.excludedIngredientIds.length > 0)
    warnings.push('This calculation explicitly excludes one or more recipe ingredients.');
  if (input.substitutions.length > 0)
    warnings.push('This calculation uses server-resolved substitution product records.');
  if (input.preparationFactors.length > 0)
    warnings.push(
      'Edible or drained factors are explicit user evidence; no retention loss is assumed.',
    );
  const sourceDigest = stableDigest({
    algorithm: CALCULATION_DIGEST,
    recipeId: recipe.id,
    recipeRevision: recipe.currentRevision,
    servings: recipe.servings,
    finalWeightGrams: input.finalWeightGrams,
    contributions: prepared.map((item) => item.digest),
  });
  const duplicate = database
    .select({ id: recipeNutritionCalculations.id })
    .from(recipeNutritionCalculations)
    .where(
      and(
        eq(recipeNutritionCalculations.recipeId, id),
        eq(recipeNutritionCalculations.recipeRevision, recipe.currentRevision),
        eq(recipeNutritionCalculations.sourceDigest, sourceDigest),
      ),
    )
    .get();
  if (duplicate) return getRecipeNutritionCalculation(duplicate.id);
  const latest = getLatestRecipeNutritionCalculation(id);
  const fallbackCompleteness = Math.min(
    nutrientCompleteness.protein ?? 0,
    nutrientCompleteness.carbohydrate ?? 0,
    nutrientCompleteness.total_fat ?? 0,
  );
  return appendRecipeNutritionCalculation({
    recipeId: id,
    recipeRevision: recipe.currentRevision,
    calculationVersionId: CALCULATION_VERSION_ID,
    sourceId: CALCULATED_SOURCE_ID,
    sourceDigest,
    servingCount: strictRecipeServingCount(recipe.servings),
    finalWeightGrams: input.finalWeightGrams,
    confidence,
    completeness,
    supersedesCalculationId: latest?.id ?? null,
    calculatedByProfileId: null,
    notes: JSON.stringify({
      rawIngredientEstimate: true,
      finalWeightChangesConcentrationOnly: true,
      preparationFactors: input.preparationFactors,
      substitutions: input.substitutions,
      excludedIngredientIds: input.excludedIngredientIds,
      nutrientRetentionApplied: false,
      energyMethod: energy.method,
      warnings: [...new Set(warnings)],
    }),
    contributions: prepared.map((item) => item.persisted),
    values: Object.entries(amounts).map(([nutrientCode, amount]) => ({
      nutrientCode: nutrientCode as NutrientCode,
      amount,
      confidence:
        nutrientCode === 'energy_kcal' && energy.method === 'macro-fallback'
          ? Math.min(
              nutrientConfidence.protein ?? 0,
              nutrientConfidence.carbohydrate ?? 0,
              nutrientConfidence.total_fat ?? 0,
            )
          : (nutrientConfidence[nutrientCode as NutrientCode] ?? 0),
      completeness:
        nutrientCode === 'energy_kcal' && energy.method === 'macro-fallback'
          ? fallbackCompleteness
          : (nutrientCompleteness[nutrientCode as NutrientCode] ?? 0),
    })),
  });
}

export function getRecipeCalculationHistory(recipeId: string) {
  const id = z.string().uuid().parse(recipeId);
  return db()
    .select({ id: recipeNutritionCalculations.id })
    .from(recipeNutritionCalculations)
    .where(eq(recipeNutritionCalculations.recipeId, id))
    .orderBy(desc(recipeNutritionCalculations.revision))
    .all()
    .map((row) => calculationSummary(getRecipeNutritionCalculation(row.id))!);
}

export function appendConfirmedRecipeConsumption(
  profileId: string,
  actor: NutritionMutationActorInput,
  raw: RecipeConsumptionRequest,
) {
  const input = recipeConsumptionRequestSchema.parse(raw);
  const requesterPrincipalId = typeof actor === 'string' ? actor : actor.compatibilityPrincipalId;
  const previous = input.supersedesIntakeRevisionId
    ? getNutritionIntakeRevisionForUpdate(
        profileId,
        requesterPrincipalId,
        input.supersedesIntakeRevisionId,
      )
    : null;
  if (previous && previous.sourceType !== 'recipe') {
    throw new NutritionIntakeIntegrityError('A recipe correction must preserve its source type.');
  }
  return appendNutritionIntakeRevision(
    profileId,
    actor,
    buildConfirmedRecipeConsumptionInput(input, Boolean(previous)),
  );
}

export function buildConfirmedRecipeConsumptionInput(
  raw: RecipeConsumptionRequest,
  correction = false,
  preparedServingCount: number | null = null,
) {
  const input = recipeConsumptionRequestSchema.parse(raw);
  const calculation = getRecipeNutritionCalculation(input.recipeCalculationId);
  if (input.servingCount !== null && !calculation.servingCount) {
    throw new NutritionRecipeIntegrityError(
      'This calculation has no unambiguous serving count. Record a weighed portion later.',
    );
  }
  const recipe = required(
    db().select().from(recipes).where(eq(recipes.id, calculation.recipeId)).get(),
    'Recipe was not found.',
  );
  if (input.portionWeightGrams !== null && !calculation.finalWeightGrams) {
    throw new NutritionRecipeIntegrityError(
      'A weighed recipe portion requires final cooked weight evidence.',
    );
  }
  const multiplier =
    input.portionWeightGrams !== null
      ? input.portionWeightGrams / calculation.finalWeightGrams!
      : input.servingCount! / (preparedServingCount ?? calculation.servingCount!);
  const amounts = scaleNutrientAmounts(
    Object.fromEntries(
      calculation.values.map((value) => [value.nutrientCode, value.amount]),
    ) as NutrientAmounts,
    multiplier,
  );
  return {
    supersedesIntakeRevisionId: input.supersedesIntakeRevisionId,
    occurredAt: input.occurredAt,
    mealSlot: input.mealSlot,
    state: correction ? ('corrected' as const) : ('eaten' as const),
    sourceType: 'recipe' as const,
    sourceNameSnapshot: recipe.title,
    recipeId: calculation.recipeId,
    productId: null,
    recipeCalculationId: calculation.id,
    foodNutritionRecordId: null,
    quantity: null,
    unit: null,
    servingCount: input.servingCount,
    portionWeightGrams: input.portionWeightGrams,
    provenance: {
      sourceIds: [calculation.source.id],
      sourceDetails: [
        {
          id: calculation.source.id,
          name: calculation.source.name,
          provider: calculation.source.provider,
          version: calculation.source.version,
          sourceRecordKey: '',
        },
      ],
      calculationVersionId: calculation.calculationVersionId,
      sourceDigest: calculation.sourceDigest,
      basisType:
        input.portionWeightGrams !== null
          ? ('recipe_weight' as const)
          : ('recipe_serving' as const),
      basisAmount: input.portionWeightGrams ?? input.servingCount!,
      basisUnit: input.portionWeightGrams !== null ? 'g' : 'serving',
      confidence: calculation.confidence,
      completeness: calculation.completeness,
      estimated: true,
    },
    revisionReason: input.revisionReason,
    values: Object.entries(amounts).map(([nutrientCode, amount]) => {
      const source = calculation.values.find((item) => item.nutrientCode === nutrientCode);
      return {
        nutrientCode: nutrientCode as NutrientCode,
        amount,
        sourceIds: [calculation.source.id],
        confidence: source?.confidence ?? calculation.confidence,
        completeness: source?.completeness ?? calculation.completeness,
        estimated: true,
      };
    }),
  };
}

export function getNutritionDataWorkspace() {
  const database = db();
  const products = database
    .select({ id: pantryProducts.id, displayName: pantryProducts.displayName })
    .from(pantryProducts)
    .orderBy(asc(pantryProducts.displayName))
    .all()
    .map((product) => {
      const record = selectPreferredFoodNutritionRecord(product.id);
      return {
        ...product,
        record: record
          ? {
              id: record.id,
              revision: record.revision,
              basisType: record.basisType,
              basisAmount: record.basisAmount,
              basisUnit: record.basisUnit,
              confidence: record.confidence,
              completeness: record.completeness,
              sourceName: record.source.name,
              values: record.values.map((value) => ({
                nutrientCode: value.nutrientCode,
                amount: value.amount,
              })),
            }
          : null,
      };
    });
  const recipeRows = database
    .select({
      id: recipes.id,
      title: recipes.title,
      servings: recipes.servings,
      currentRevision: recipes.currentRevision,
    })
    .from(recipes)
    .where(eq(recipes.status, 'active'))
    .orderBy(asc(recipes.title))
    .all();
  return {
    products,
    recipes: recipeRows.map((recipe) => ({
      ...recipe,
      ingredients: database
        .select({
          id: recipeIngredients.id,
          item: recipeIngredients.item,
          quantity: recipeIngredients.quantity,
          unit: recipeIngredients.unit,
          mappedProductId: recipeIngredientProductMappings.productId,
          isOptional: recipeIngredientProductMappings.isOptional,
        })
        .from(recipeIngredients)
        .leftJoin(
          recipeIngredientProductMappings,
          eq(recipeIngredientProductMappings.recipeIngredientId, recipeIngredients.id),
        )
        .where(eq(recipeIngredients.recipeId, recipe.id))
        .orderBy(asc(recipeIngredients.position))
        .all()
        .map((ingredient) => ({ ...ingredient, isOptional: ingredient.isOptional ?? false })),
      calculation: calculationSummary(getLatestRecipeNutritionCalculation(recipe.id)),
    })),
  };
}

export function summarizeRecipeCalculation(calculation: RecipeNutritionCalculationView | null) {
  return calculationSummary(calculation);
}

export function getRecipeNutritionPresentation(recipeId: string) {
  const id = z.string().uuid().parse(recipeId);
  const recipe = db().select().from(recipes).where(eq(recipes.id, id)).get();
  if (!recipe) throw new NutritionRecipeNotFoundError('Recipe was not found.');
  return presentRecipeNutrition(recipe.currentRevision, getLatestRecipeNutritionCalculation(id));
}

type RecipePresentationRow = {
  recipe_id: string;
  current_revision: number;
  calculation_id: string | null;
  recipe_revision: number | null;
  calculation_revision: number | null;
  serving_count: number | null;
  confidence: number | null;
  completeness: number | null;
  notes: string | null;
  created_at: number | null;
  source_name: string | null;
  source_provider: string | null;
  source_version: string | null;
  algorithm: string | null;
  algorithm_version: string | null;
  energy_factors_version: string | null;
  nutrient_code: string | null;
  amount: number | null;
  value_confidence: number | null;
  value_completeness: number | null;
};

export function listRecipeNutritionPresentations(recipeIds: readonly string[]) {
  const ids = z
    .array(z.string().uuid())
    .max(10_000)
    .parse([...new Set(recipeIds)]);
  if (ids.length === 0) return {};
  ensureDatabase();
  const placeholders = ids.map(() => '?').join(',');
  const rows = getSqliteDatabase()
    .prepare(
      `SELECT r.id AS recipe_id,r.current_revision,
              c.id AS calculation_id,c.recipe_revision,c.revision AS calculation_revision,
              c.serving_count,c.confidence,c.completeness,c.notes,c.created_at,
              s.name AS source_name,s.provider AS source_provider,s.version AS source_version,
              cv.algorithm,cv.version AS algorithm_version,cv.energy_factors_version,
              v.nutrient_code,v.amount,v.confidence AS value_confidence,
              v.completeness AS value_completeness
       FROM recipes r
       LEFT JOIN recipe_nutrition_calculations c ON c.id=(
         SELECT latest.id FROM recipe_nutrition_calculations latest
         WHERE latest.recipe_id=r.id ORDER BY latest.revision DESC LIMIT 1
       )
       LEFT JOIN nutrition_data_sources s ON s.id=c.source_id
       LEFT JOIN nutrition_calculation_versions cv ON cv.id=c.calculation_version_id
       LEFT JOIN recipe_nutrient_values v ON v.calculation_id=c.id
       WHERE r.id IN (${placeholders})
       ORDER BY r.id,v.nutrient_code`,
    )
    .all(...ids) as RecipePresentationRow[];
  const grouped = new Map<string, RecipePresentationRow[]>();
  for (const row of rows) {
    const current = grouped.get(row.recipe_id) ?? [];
    current.push(row);
    grouped.set(row.recipe_id, current);
  }
  return Object.fromEntries(
    [...grouped.entries()].map(([recipeId, recipeRows]) => {
      const first = recipeRows[0]!;
      const calculation =
        first.calculation_id === null
          ? null
          : {
              id: first.calculation_id,
              recipeRevision: first.recipe_revision!,
              revision: first.calculation_revision!,
              servingCount: first.serving_count,
              confidence: first.confidence!,
              completeness: first.completeness!,
              createdAt: new Date(first.created_at! * 1_000),
              source: {
                name: first.source_name!,
                provider: first.source_provider!,
                version: first.source_version!,
              },
              calculationVersion: {
                algorithm: first.algorithm!,
                version: first.algorithm_version!,
                energyFactorsVersion: first.energy_factors_version!,
              },
              values: recipeRows.flatMap((row) =>
                row.nutrient_code === null || row.amount === null
                  ? []
                  : [
                      {
                        nutrientCode: row.nutrient_code,
                        amount: row.amount,
                        confidence: row.value_confidence,
                        completeness: row.value_completeness,
                      },
                    ],
              ),
              notes: first.notes!,
            };
      return [recipeId, presentRecipeNutrition(first.current_revision, calculation)];
    }),
  );
}

export function recalculateRecipeNutritionAfterRecipeEdit(recipeId: string) {
  const id = z.string().uuid().parse(recipeId);
  const previous = getLatestRecipeNutritionCalculation(id);
  if (!previous) {
    return {
      status: 'not_started' as const,
      message: 'No prior normalized calculation exists; no automatic calculation was attempted.',
    };
  }
  try {
    const calculation = calculateRecipeNutrition(id, {});
    return {
      status: 'updated' as const,
      calculationId: calculation.id,
      recipeRevision: calculation.recipeRevision,
      message: 'Normalized Nutrition was recalculated for the saved recipe revision.',
    };
  } catch {
    return {
      status: 'unavailable' as const,
      previousCalculationId: previous.id,
      message:
        'The recipe was saved, but normalized Nutrition needs source or conversion evidence before it can be recalculated.',
    };
  }
}

export type RecipeIngredientMappingSnapshot = Array<{
  matchKey: string;
  productId: string;
  matchType: 'manual' | 'exact' | 'alias' | 'suggested';
  compatibleVariant: boolean;
  isOptional: boolean;
  mappedByProfileId: string;
  createdAt: Date;
}>;

type NutritionRecipeTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>['transaction']>[0]
>[0];
type NutritionRecipeExecutor = ReturnType<typeof getDatabase> | NutritionRecipeTransaction;

function mappingKeys<
  T extends {
    groupName: string;
    ingredientItem: string;
    ingredientId: string;
  },
>(rows: T[]): Array<T & { matchKey: string }> {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const base = `${row.groupName.trim().toLocaleLowerCase()}\u0000${row.ingredientItem.trim().toLocaleLowerCase()}`;
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    return { ...row, matchKey: `${base}\u0000${occurrence}` };
  });
}

export function captureRecipeIngredientMappings(
  recipeId: string,
  executor: NutritionRecipeExecutor = db(),
): RecipeIngredientMappingSnapshot {
  const id = z.string().uuid().parse(recipeId);
  const rows = executor
    .select({
      groupName: recipeIngredientGroups.name,
      ingredientItem: recipeIngredients.item,
      ingredientId: recipeIngredients.id,
      productId: recipeIngredientProductMappings.productId,
      matchType: recipeIngredientProductMappings.matchType,
      compatibleVariant: recipeIngredientProductMappings.compatibleVariant,
      isOptional: recipeIngredientProductMappings.isOptional,
      mappedByProfileId: recipeIngredientProductMappings.mappedByProfileId,
      createdAt: recipeIngredientProductMappings.createdAt,
    })
    .from(recipeIngredients)
    .innerJoin(recipeIngredientGroups, eq(recipeIngredientGroups.id, recipeIngredients.groupId))
    .innerJoin(
      recipeIngredientProductMappings,
      eq(recipeIngredientProductMappings.recipeIngredientId, recipeIngredients.id),
    )
    .where(eq(recipeIngredients.recipeId, id))
    .orderBy(asc(recipeIngredientGroups.position), asc(recipeIngredients.position))
    .all();
  return mappingKeys(rows).map(({ matchKey, ...row }) => ({
    matchKey,
    productId: row.productId,
    matchType: row.matchType,
    compatibleVariant: row.compatibleVariant,
    isOptional: row.isOptional,
    mappedByProfileId: row.mappedByProfileId,
    createdAt: row.createdAt,
  }));
}

export function restoreRecipeIngredientMappings(
  recipeId: string,
  snapshot: RecipeIngredientMappingSnapshot,
  executor: NutritionRecipeExecutor = db(),
) {
  const id = z.string().uuid().parse(recipeId);
  if (!snapshot.length) return { restored: 0, missing: 0 };
  const database = executor;
  const current = mappingKeys(
    database
      .select({
        groupName: recipeIngredientGroups.name,
        ingredientItem: recipeIngredients.item,
        ingredientId: recipeIngredients.id,
      })
      .from(recipeIngredients)
      .innerJoin(recipeIngredientGroups, eq(recipeIngredientGroups.id, recipeIngredients.groupId))
      .where(eq(recipeIngredients.recipeId, id))
      .orderBy(asc(recipeIngredientGroups.position), asc(recipeIngredients.position))
      .all(),
  );
  const currentByKey = new Map(current.map((row) => [row.matchKey, row]));
  let restored = 0;
  for (const item of snapshot) {
    const target = currentByKey.get(item.matchKey);
    if (!target) continue;
    database
      .insert(recipeIngredientProductMappings)
      .values({
        recipeIngredientId: target.ingredientId,
        productId: item.productId,
        matchType: item.matchType,
        compatibleVariant: item.compatibleVariant,
        isOptional: item.isOptional,
        mappedByProfileId: item.mappedByProfileId,
        createdAt: item.createdAt,
        updatedAt: new Date(),
      })
      .onConflictDoNothing()
      .run();
    restored += 1;
  }
  return { restored, missing: snapshot.length - restored };
}

export const recipeCalculationDashboardNutrients = DEFAULT_DASHBOARD_NUTRIENTS;
