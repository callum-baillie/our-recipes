import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { ensureDatabase, getDatabase } from '@/lib/db/client';
import {
  cookSessions,
  mealPlanEntries,
  nutritionConsumptionCommands,
  nutritionIntakeNutrientValues,
  nutritionIntakeRevisions,
  nutritionMealAllocationVersions,
  nutritionPreparedRecipeInstances,
  recipes,
} from '@/lib/db/schema';
import {
  confirmPreparedConsumptionSchema,
  createPreparedRecipeSchema,
  nutritionCommandDigest,
  recordPreparedAllocationSchema,
  type ConfirmPreparedConsumptionInput,
  type CreatePreparedRecipeInput,
  type RecordPreparedAllocationInput,
} from '@/lib/domain/nutrition-prepared-consumption';
import type { NutritionMutationActorInput } from '@/lib/domain/nutrition-household';
import {
  latestMealAllocationVersions,
  mealAllocationCapacity,
} from '@/lib/domain/nutrition-meal-planning';
import {
  appendNutritionIntakeRevisionInTransaction,
  appendNutritionMealAllocationVersionInTransaction,
  type NutritionTransaction,
} from '@/lib/services/nutrition-intake-service';
import { getRecipeNutritionCalculation } from '@/lib/services/nutrition-foundation-service';
import { buildConfirmedRecipeConsumptionInput } from '@/lib/services/nutrition-recipe-calculation-service';
import {
  authorizeNutritionHouseholdAllocationTarget,
  getPrivateNutritionProfile,
  resolveNutritionMutationActor,
} from '@/lib/services/nutrition-profile-service';

export class NutritionPreparedNotFoundError extends Error {}
export class NutritionPreparedForbiddenError extends Error {}
export class NutritionPreparedConflictError extends Error {}
export class NutritionPreparedIntegrityError extends Error {}

function db() {
  ensureDatabase();
  return getDatabase();
}

function preparedView(row: typeof nutritionPreparedRecipeInstances.$inferSelect) {
  return {
    ...row,
    includedOptionalIngredientIds: JSON.parse(
      row.includedOptionalIngredientIdsSnapshot,
    ) as string[],
    preparationEvidence: JSON.parse(row.adjustmentsSnapshot) as unknown,
  };
}

function calculationPreparationEvidence(
  calculation: ReturnType<typeof getRecipeNutritionCalculation>,
) {
  let notes: unknown = null;
  try {
    notes = calculation.notes ? JSON.parse(calculation.notes) : null;
  } catch {
    notes = { legacyNote: calculation.notes };
  }
  return {
    calculationId: calculation.id,
    recipeRevision: calculation.recipeRevision,
    sourceDigest: calculation.sourceDigest,
    finalWeightGrams: calculation.finalWeightGrams,
    notes,
    contributions: calculation.contributions.map((contribution) => ({
      recipeIngredientId: contribution.recipeIngredientId,
      productNutritionRecordId: contribution.productNutritionRecordId,
      ediblePortion: contribution.ediblePortion,
      drainedYield: contribution.drainedYield,
      optionalIncluded: contribution.optionalIncluded,
      retentionFactors: JSON.parse(contribution.retentionFactors),
    })),
  };
}

function intakeView(transaction: NutritionTransaction, id: string) {
  const row = transaction
    .select()
    .from(nutritionIntakeRevisions)
    .where(eq(nutritionIntakeRevisions.id, id))
    .get();
  if (!row) throw new NutritionPreparedIntegrityError('Consumption intake result is missing.');
  return {
    ...row,
    provenance: row.provenanceSnapshot ? JSON.parse(row.provenanceSnapshot) : null,
    values: transaction
      .select()
      .from(nutritionIntakeNutrientValues)
      .where(eq(nutritionIntakeNutrientValues.intakeRevisionId, row.id))
      .all()
      .map((value) => ({
        ...value,
        sourceIds: JSON.parse(value.sourceIdsSnapshot) as string[],
      })),
  };
}

export function createPreparedRecipeInstance(
  profileId: string,
  actorInput: NutritionMutationActorInput,
  raw: CreatePreparedRecipeInput,
) {
  const input = createPreparedRecipeSchema.parse(raw);
  const actor = resolveNutritionMutationActor(actorInput);
  const requesterPrincipalId = actor.compatibilityPrincipalId;
  getPrivateNutritionProfile(profileId, requesterPrincipalId);
  const requestDigest = nutritionCommandDigest({ profileId, ...input });
  return db().transaction((transaction) => {
    resolveNutritionMutationActor(actor, transaction);
    const existing = transaction
      .select()
      .from(nutritionPreparedRecipeInstances)
      .where(eq(nutritionPreparedRecipeInstances.id, input.preparedInstanceId))
      .get();
    if (existing) {
      if (
        existing.createdByPrincipalId !== requesterPrincipalId ||
        existing.requestDigest !== requestDigest
      ) {
        throw new NutritionPreparedConflictError(
          'Prepared recipe ID was already used for different details.',
        );
      }
      return preparedView(existing);
    }
    const calculation = getRecipeNutritionCalculation(input.recipeCalculationId);
    const recipe = transaction
      .select()
      .from(recipes)
      .where(eq(recipes.id, calculation.recipeId))
      .get();
    if (!recipe) throw new NutritionPreparedNotFoundError('Recipe was not found.');
    if (calculation.recipeRevision !== recipe.currentRevision) {
      throw new NutritionPreparedConflictError(
        'Choose a calculation for the current recipe revision before recording preparation.',
      );
    }
    if (
      input.finalWeightGrams !== calculation.finalWeightGrams &&
      !(
        input.finalWeightGrams !== null &&
        calculation.finalWeightGrams !== null &&
        Math.abs(input.finalWeightGrams - calculation.finalWeightGrams) <= 1e-9
      )
    ) {
      throw new NutritionPreparedConflictError(
        'Final cooked weight does not match this calculation. Recalculate the preparation before saving the batch.',
      );
    }
    let mealPlanEntryId = input.mealPlanEntryId;
    if (mealPlanEntryId) {
      const meal = transaction
        .select()
        .from(mealPlanEntries)
        .where(eq(mealPlanEntries.id, mealPlanEntryId))
        .get();
      if (!meal || meal.recipeId !== recipe.id) {
        throw new NutritionPreparedIntegrityError(
          'Prepared recipe does not match the selected planned meal.',
        );
      }
    }
    if (input.cookSessionId) {
      const session = transaction
        .select()
        .from(cookSessions)
        .where(eq(cookSessions.id, input.cookSessionId))
        .get();
      if (!session) throw new NutritionPreparedNotFoundError('Cook session was not found.');
      if (!session.completedAt) {
        throw new NutritionPreparedConflictError(
          'Finish cooking before creating a prepared Nutrition snapshot.',
        );
      }
      if (session.recipeId !== recipe.id) {
        throw new NutritionPreparedIntegrityError(
          'Cook session and recipe calculation do not match.',
        );
      }
      if (mealPlanEntryId && session.mealPlanEntryId !== mealPlanEntryId) {
        throw new NutritionPreparedIntegrityError('Cook session and planned meal do not match.');
      }
      mealPlanEntryId ??= session.mealPlanEntryId;
      const priorForSession = transaction
        .select()
        .from(nutritionPreparedRecipeInstances)
        .where(eq(nutritionPreparedRecipeInstances.cookSessionId, session.id))
        .get();
      if (priorForSession) {
        throw new NutritionPreparedConflictError(
          'This cook session already has a prepared Nutrition snapshot.',
        );
      }
    }
    const row = {
      id: input.preparedInstanceId,
      recipeId: recipe.id,
      recipeCalculationId: calculation.id,
      recipeNameSnapshot: recipe.title,
      mealPlanEntryId,
      cookSessionId: input.cookSessionId,
      actualServings: input.actualServings,
      finalWeightGrams: calculation.finalWeightGrams,
      calculationAlignment: 'as_calculated' as const,
      includedOptionalIngredientIdsSnapshot: JSON.stringify(
        calculation.contributions
          .filter((contribution) => contribution.optionalIncluded)
          .flatMap((contribution) =>
            contribution.recipeIngredientId ? [contribution.recipeIngredientId] : [],
          ),
      ),
      adjustmentsSnapshot: JSON.stringify(calculationPreparationEvidence(calculation)),
      note: input.note,
      requestDigest,
      createdByPrincipalId: requesterPrincipalId,
      actorHouseholdProfileId: actor.householdProfileId,
      createdAt: new Date(),
    } satisfies typeof nutritionPreparedRecipeInstances.$inferInsert;
    transaction.insert(nutritionPreparedRecipeInstances).values(row).run();
    return preparedView({ ...row });
  });
}

export function listPreparedRecipeInstances(profileId: string, requesterPrincipalId: string) {
  getPrivateNutritionProfile(profileId, requesterPrincipalId);
  return db()
    .select()
    .from(nutritionPreparedRecipeInstances)
    .where(eq(nutritionPreparedRecipeInstances.createdByPrincipalId, requesterPrincipalId))
    .orderBy(desc(nutritionPreparedRecipeInstances.createdAt))
    .all()
    .map(preparedView);
}

export function getPreparedServingWorkspace(profileId: string, requesterPrincipalId: string) {
  getPrivateNutritionProfile(profileId, requesterPrincipalId);
  const database = db();
  const preparedRows = database
    .select()
    .from(nutritionPreparedRecipeInstances)
    .where(eq(nutritionPreparedRecipeInstances.createdByPrincipalId, requesterPrincipalId))
    .orderBy(desc(nutritionPreparedRecipeInstances.createdAt))
    .all();
  if (!preparedRows.length) return [];
  const allVersions = database.select().from(nutritionMealAllocationVersions).all();
  return preparedRows.map((prepared) => {
    const latest = latestMealAllocationVersions(
      allVersions.filter((version) => version.preparedRecipeInstanceId === prepared.id),
    );
    const capacity = mealAllocationCapacity(prepared.actualServings, latest);
    const calculation = getRecipeNutritionCalculation(prepared.recipeCalculationId);
    return {
      ...preparedView(prepared),
      assignedServings: capacity.assignedServings,
      remainingServings: capacity.unassignedServings,
      overallocatedServings: capacity.overallocatedServings,
      confidence: calculation.confidence,
      completeness: calculation.completeness,
      ownAllocations: latest
        .filter((allocation) => allocation.nutritionProfileId === profileId)
        .map((allocation) => ({
          id: allocation.id,
          seriesId: allocation.seriesId,
          revision: allocation.revision,
          state: allocation.state,
          servings: allocation.servings,
          portionWeightGrams: allocation.portionWeightGrams,
          intakeSeriesId: allocation.intakeSeriesId,
          note: allocation.note,
        })),
    };
  });
}

export function recordPreparedAllocationState(
  profileId: string,
  preparedId: string,
  actorInput: NutritionMutationActorInput,
  raw: RecordPreparedAllocationInput,
) {
  const input = recordPreparedAllocationSchema.parse(raw);
  const actor = resolveNutritionMutationActor(actorInput);
  const requesterPrincipalId = actor.compatibilityPrincipalId;
  authorizeNutritionHouseholdAllocationTarget(profileId, requesterPrincipalId);
  return db().transaction((transaction) => {
    const prepared = transaction
      .select()
      .from(nutritionPreparedRecipeInstances)
      .where(eq(nutritionPreparedRecipeInstances.id, preparedId))
      .get();
    if (!prepared) throw new NutritionPreparedNotFoundError('Prepared recipe was not found.');
    if (prepared.createdByPrincipalId !== requesterPrincipalId) {
      throw new NutritionPreparedForbiddenError('Prepared recipe is scoped to another profile.');
    }
    const latest = transaction
      .select()
      .from(nutritionMealAllocationVersions)
      .where(eq(nutritionMealAllocationVersions.seriesId, input.allocationSeriesId))
      .orderBy(desc(nutritionMealAllocationVersions.revision))
      .get();
    if (latest) {
      if (latest.state === 'eaten') {
        throw new NutritionPreparedConflictError(
          'Consumed portions must be corrected or deleted through immutable Food Diary history.',
        );
      }
      const exactReplay =
        latest.nutritionProfileId === profileId &&
        latest.preparedRecipeInstanceId === prepared.id &&
        latest.supersedesAllocationVersionId === input.supersedesAllocationVersionId &&
        latest.state === input.state &&
        latest.servings === input.servingCount &&
        latest.note === input.note;
      if (exactReplay) return { replayed: true, allocation: latest };
      if (
        !input.supersedesAllocationVersionId ||
        latest.id !== input.supersedesAllocationVersionId
      ) {
        throw new NutritionPreparedConflictError(
          'Prepared allocation series changed or was reused for different details.',
        );
      }
    }
    const allocation = appendNutritionMealAllocationVersionInTransaction(
      transaction,
      profileId,
      actor,
      {
        seriesId: input.allocationSeriesId,
        supersedesAllocationVersionId: input.supersedesAllocationVersionId,
        mealPlanEntryId: prepared.mealPlanEntryId,
        cookSessionId: prepared.cookSessionId,
        state: input.state,
        servings: input.servingCount,
        portionWeightGrams: null,
        intakeSeriesId: null,
        note: input.note,
      },
      {
        preparedRecipeInstanceId: prepared.id,
        allocationCapacityServings: prepared.actualServings,
      },
    );
    return { replayed: false, allocation };
  });
}

export function confirmPreparedRecipeConsumption(
  profileId: string,
  preparedId: string,
  actorInput: NutritionMutationActorInput,
  raw: ConfirmPreparedConsumptionInput,
) {
  const input = confirmPreparedConsumptionSchema.parse(raw);
  const actor = resolveNutritionMutationActor(actorInput);
  const requesterPrincipalId = actor.compatibilityPrincipalId;
  getPrivateNutritionProfile(profileId, requesterPrincipalId);
  const requestDigest = nutritionCommandDigest({ profileId, preparedId, ...input });
  return db().transaction((transaction) => {
    resolveNutritionMutationActor(actor, transaction);
    const priorCommand = transaction
      .select()
      .from(nutritionConsumptionCommands)
      .where(
        and(
          eq(nutritionConsumptionCommands.principalId, requesterPrincipalId),
          eq(nutritionConsumptionCommands.idempotencyKey, input.idempotencyKey),
        ),
      )
      .get();
    if (priorCommand) {
      if (
        priorCommand.requestDigest !== requestDigest ||
        priorCommand.nutritionProfileId !== profileId ||
        priorCommand.preparedRecipeInstanceId !== preparedId
      ) {
        throw new NutritionPreparedConflictError(
          'This consumption key was already used for different details.',
        );
      }
      const allocation = transaction
        .select()
        .from(nutritionMealAllocationVersions)
        .where(eq(nutritionMealAllocationVersions.id, priorCommand.allocationVersionId))
        .get();
      if (!allocation) {
        throw new NutritionPreparedIntegrityError('Consumption allocation result is missing.');
      }
      return {
        replayed: true,
        intake: intakeView(transaction, priorCommand.intakeRevisionId),
        allocation,
      };
    }

    const prepared = transaction
      .select()
      .from(nutritionPreparedRecipeInstances)
      .where(eq(nutritionPreparedRecipeInstances.id, preparedId))
      .get();
    if (!prepared) throw new NutritionPreparedNotFoundError('Prepared recipe was not found.');
    if (prepared.createdByPrincipalId !== requesterPrincipalId) {
      throw new NutritionPreparedForbiddenError('Prepared recipe is scoped to another profile.');
    }
    if (prepared.calculationAlignment !== 'as_calculated') {
      throw new NutritionPreparedIntegrityError(
        'Preparation adjustments require a matching recalculation before consumption.',
      );
    }

    const preparedVersions = transaction
      .select({
        id: nutritionMealAllocationVersions.id,
        seriesId: nutritionMealAllocationVersions.seriesId,
        revision: nutritionMealAllocationVersions.revision,
        state: nutritionMealAllocationVersions.state,
        servings: nutritionMealAllocationVersions.servings,
      })
      .from(nutritionMealAllocationVersions)
      .where(eq(nutritionMealAllocationVersions.preparedRecipeInstanceId, prepared.id))
      .all();
    if (input.supersedesAllocationVersionId) {
      const predecessor = transaction
        .select()
        .from(nutritionMealAllocationVersions)
        .where(eq(nutritionMealAllocationVersions.id, input.supersedesAllocationVersionId))
        .get();
      if (!predecessor) {
        throw new NutritionPreparedNotFoundError('Served allocation was not found.');
      }
      if (predecessor.state === 'eaten') {
        throw new NutritionPreparedConflictError(
          'Use Food Diary correction history instead of consuming the same allocation twice.',
        );
      }
    }
    const replacingSeriesId = input.supersedesAllocationVersionId
      ? (latestMealAllocationVersions(preparedVersions).find(
          (version) => version.id === input.supersedesAllocationVersionId,
        )?.seriesId ?? null)
      : null;
    const calculation = getRecipeNutritionCalculation(prepared.recipeCalculationId);
    if (
      input.portionWeightGrams !== null &&
      (!prepared.finalWeightGrams || !calculation.finalWeightGrams)
    ) {
      throw new NutritionPreparedIntegrityError(
        'A weighed prepared portion requires matching frozen final-weight evidence.',
      );
    }
    const requestedServingEquivalent =
      input.portionWeightGrams !== null
        ? (input.portionWeightGrams / prepared.finalWeightGrams!) * prepared.actualServings
        : input.servingCount!;
    const capacity = mealAllocationCapacity(
      prepared.actualServings,
      preparedVersions,
      replacingSeriesId,
    );
    if (requestedServingEquivalent > capacity.unassignedServings + 1e-9) {
      throw new NutritionPreparedConflictError(
        `Only ${capacity.unassignedServings} prepared servings remain unassigned.`,
      );
    }

    const intakeInput = {
      ...buildConfirmedRecipeConsumptionInput(
        {
          recipeCalculationId: prepared.recipeCalculationId,
          servingCount: input.servingCount,
          portionWeightGrams: input.portionWeightGrams,
          occurredAt: input.occurredAt,
          mealSlot: input.mealSlot,
          supersedesIntakeRevisionId: null,
          revisionReason: '',
        },
        false,
        prepared.actualServings,
      ),
      sourceNameSnapshot: prepared.recipeNameSnapshot,
    };
    const intake = appendNutritionIntakeRevisionInTransaction(
      transaction,
      profileId,
      actor,
      intakeInput,
      {
        mealPlanEntryId: prepared.mealPlanEntryId,
        cookSessionId: prepared.cookSessionId,
        preparedRecipeInstanceId: prepared.id,
      },
    );
    const allocation = appendNutritionMealAllocationVersionInTransaction(
      transaction,
      profileId,
      actor,
      {
        seriesId: input.allocationSeriesId,
        supersedesAllocationVersionId: input.supersedesAllocationVersionId,
        mealPlanEntryId: prepared.mealPlanEntryId,
        cookSessionId: prepared.cookSessionId,
        state: 'eaten',
        servings: requestedServingEquivalent,
        portionWeightGrams: input.portionWeightGrams,
        intakeSeriesId: intake.seriesId,
        note: input.note,
      },
      {
        preparedRecipeInstanceId: prepared.id,
        allocationCapacityServings: prepared.actualServings,
      },
    );
    transaction
      .insert(nutritionConsumptionCommands)
      .values({
        id: randomUUID(),
        principalId: requesterPrincipalId,
        actorHouseholdProfileId: actor.householdProfileId,
        idempotencyKey: input.idempotencyKey,
        requestDigest,
        nutritionProfileId: profileId,
        preparedRecipeInstanceId: prepared.id,
        intakeRevisionId: intake.id,
        allocationVersionId: allocation.id,
        createdAt: new Date(),
      })
      .run();
    return { replayed: false, intake, allocation };
  });
}
