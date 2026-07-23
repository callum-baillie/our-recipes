import 'server-only';

import { eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';

import { ensureDatabase, getDatabase } from '@/lib/db/client';
import { nutritionDataSources, pantryProducts } from '@/lib/db/schema';
import {
  deleteIntakeRequestSchema,
  manualConsumptionRequestSchema,
  productConsumptionRequestSchema,
  type ManualConsumptionRequest,
  type ProductConsumptionRequest,
} from '@/lib/domain/nutrition-food-diary';
import { ingredientFoodRecordMultiplier } from '@/lib/domain/nutrition-recipe-calculation';
import { DEFAULT_DASHBOARD_NUTRIENTS, type NutrientCode } from '@/lib/domain/nutrition';
import type { NutritionMutationActorInput } from '@/lib/domain/nutrition-household';
import {
  getFoodNutritionRecord,
  selectPreferredFoodNutritionRecord,
} from '@/lib/services/nutrition-foundation-service';
import {
  NutritionIntakeIntegrityError,
  appendNutritionIntakeRevision,
  getNutritionIntakeRevisionForUpdate,
} from '@/lib/services/nutrition-intake-service';

const MANUAL_DIARY_SOURCE_ID = 'bord_manual_diary_v1';

function db() {
  ensureDatabase();
  return getDatabase();
}

function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function actorPrincipalId(actor: NutritionMutationActorInput): string {
  return typeof actor === 'string' ? actor : actor.compatibilityPrincipalId;
}

function ensureManualDiarySource() {
  const database = db();
  database
    .insert(nutritionDataSources)
    .values({
      id: MANUAL_DIARY_SOURCE_ID,
      sourceType: 'manual',
      name: 'Manual Food Diary entry',
      provider: 'Bòrd',
      version: '1',
      sourceUrl: '',
      citation: 'Nutrient totals explicitly entered by the user.',
      license: '',
      retrievedAt: null,
      priority: 0,
      metadata: JSON.stringify({ userEntered: true, calculated: false }),
      createdAt: new Date(),
    })
    .onConflictDoNothing()
    .run();
  const source = database
    .select()
    .from(nutritionDataSources)
    .where(eq(nutritionDataSources.id, MANUAL_DIARY_SOURCE_ID))
    .get();
  if (
    !source ||
    source.sourceType !== 'manual' ||
    source.name !== 'Manual Food Diary entry' ||
    source.version !== '1'
  ) {
    throw new NutritionIntakeIntegrityError('The built-in manual diary source is inconsistent.');
  }
  return source;
}

export function appendConfirmedProductConsumption(
  profileId: string,
  actor: NutritionMutationActorInput,
  raw: ProductConsumptionRequest,
) {
  const input = productConsumptionRequestSchema.parse(raw);
  const requesterPrincipalId = actorPrincipalId(actor);
  const previous = input.supersedesIntakeRevisionId
    ? getNutritionIntakeRevisionForUpdate(
        profileId,
        requesterPrincipalId,
        input.supersedesIntakeRevisionId,
      )
    : null;
  if (previous && (previous.sourceType !== 'product' || previous.productId !== input.productId)) {
    throw new NutritionIntakeIntegrityError(
      'A product correction must preserve its original product source.',
    );
  }
  const database = db();
  const product = database
    .select()
    .from(pantryProducts)
    .where(eq(pantryProducts.id, input.productId))
    .get();
  if (!product) throw new NutritionIntakeIntegrityError('Pantry product was not found.');
  const record = previous?.foodNutritionRecordId
    ? getFoodNutritionRecord(previous.foodNutritionRecordId)
    : selectPreferredFoodNutritionRecord(input.productId);
  if (!record) {
    throw new NutritionIntakeIntegrityError('This product has no Nutrition record to snapshot.');
  }
  const conversion = ingredientFoodRecordMultiplier(input.quantity, input.unit, record);
  if (!conversion.supported) throw new NutritionIntakeIntegrityError(conversion.missingReason);
  const estimated = record.confidence < 1 || record.completeness < 1;
  return appendNutritionIntakeRevision(profileId, actor, {
    supersedesIntakeRevisionId: previous?.id ?? null,
    occurredAt: input.occurredAt,
    mealSlot: input.mealSlot,
    state: previous ? 'corrected' : 'eaten',
    sourceType: 'product',
    sourceNameSnapshot: product.displayName,
    recipeId: null,
    productId: product.id,
    recipeCalculationId: null,
    foodNutritionRecordId: record.id,
    quantity: input.quantity,
    unit: input.unit,
    servingCount: null,
    portionWeightGrams: null,
    provenance: {
      sourceIds: [record.source.id],
      sourceDetails: [
        {
          id: record.source.id,
          name: record.source.name,
          provider: record.source.provider,
          version: record.source.version,
          sourceRecordKey: record.sourceRecordKey,
        },
      ],
      calculationVersionId: null,
      sourceDigest: digest({
        recordId: record.id,
        recordRevision: record.revision,
        quantity: input.quantity,
        unit: input.unit,
        multiplier: conversion.multiplier,
        method: conversion.method,
      }),
      basisType:
        record.basisType === 'per_100g'
          ? 'per_100g'
          : record.basisType === 'per_100ml'
            ? 'per_100ml'
            : record.basisType === 'per_serving'
              ? 'food_serving'
              : 'food_unit',
      basisAmount: record.basisAmount,
      basisUnit: record.basisUnit,
      confidence: record.confidence,
      completeness: record.completeness,
      estimated,
    },
    revisionReason: input.revisionReason,
    values: record.values.map((value) => ({
      nutrientCode: value.nutrientCode as NutrientCode,
      amount: value.amount * conversion.multiplier,
      sourceIds: [record.source.id],
      confidence: value.confidence ?? record.confidence,
      completeness: record.completeness,
      estimated,
    })),
  });
}

export function appendManualConsumption(
  profileId: string,
  actor: NutritionMutationActorInput,
  raw: ManualConsumptionRequest,
) {
  const input = manualConsumptionRequestSchema.parse(raw);
  const requesterPrincipalId = actorPrincipalId(actor);
  const previous = input.supersedesIntakeRevisionId
    ? getNutritionIntakeRevisionForUpdate(
        profileId,
        requesterPrincipalId,
        input.supersedesIntakeRevisionId,
      )
    : null;
  if (previous && previous.sourceType !== 'manual') {
    throw new NutritionIntakeIntegrityError('A manual correction must preserve its source type.');
  }
  const source = ensureManualDiarySource();
  const covered = new Set(input.values.map((value) => value.nutrientCode));
  const completeness =
    DEFAULT_DASHBOARD_NUTRIENTS.filter((code) => covered.has(code)).length /
    DEFAULT_DASHBOARD_NUTRIENTS.length;
  const confidence = 0.5;
  return appendNutritionIntakeRevision(profileId, actor, {
    supersedesIntakeRevisionId: previous?.id ?? null,
    occurredAt: input.occurredAt,
    mealSlot: input.mealSlot,
    state: previous ? 'corrected' : 'eaten',
    sourceType: 'manual',
    sourceNameSnapshot: input.sourceName,
    recipeId: null,
    productId: null,
    recipeCalculationId: null,
    foodNutritionRecordId: null,
    quantity: input.quantity,
    unit: input.unit,
    servingCount: null,
    portionWeightGrams: null,
    provenance: {
      sourceIds: [source.id],
      sourceDetails: [
        {
          id: source.id,
          name: source.name,
          provider: source.provider,
          version: source.version,
          sourceRecordKey: '',
        },
      ],
      calculationVersionId: null,
      sourceDigest: digest({
        sourceName: input.sourceName,
        quantity: input.quantity,
        unit: input.unit,
        values: input.values,
      }),
      basisType: 'manual_portion',
      basisAmount: input.quantity,
      basisUnit: input.unit,
      confidence,
      completeness,
      estimated: true,
    },
    revisionReason: input.revisionReason,
    values: input.values.map((value) => ({
      nutrientCode: value.nutrientCode,
      amount: value.amount,
      sourceIds: [source.id],
      confidence,
      completeness,
      estimated: true,
    })),
  });
}

export function deleteNutritionIntake(
  profileId: string,
  actor: NutritionMutationActorInput,
  revisionId: string,
  raw: unknown,
) {
  const input = deleteIntakeRequestSchema.parse(raw);
  const requesterPrincipalId = actorPrincipalId(actor);
  const previous = getNutritionIntakeRevisionForUpdate(profileId, requesterPrincipalId, revisionId);
  return appendNutritionIntakeRevision(profileId, actor, {
    supersedesIntakeRevisionId: previous.id,
    occurredAt: previous.occurredAt.toISOString(),
    mealSlot: previous.mealSlot,
    state: 'deleted',
    sourceType: previous.sourceType,
    sourceNameSnapshot: '',
    recipeId: null,
    productId: null,
    recipeCalculationId: null,
    foodNutritionRecordId: null,
    quantity: null,
    unit: null,
    servingCount: null,
    portionWeightGrams: null,
    provenance: null,
    revisionReason: input.reason,
    values: [],
  });
}
