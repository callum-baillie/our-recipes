import 'server-only';

import { desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { ensureDatabase, getDatabase } from '@/lib/db/client';
import {
  cookSessions,
  foodNutritionRecords,
  mealPlanEntries,
  nutritionDataSources,
  nutritionIntakeNutrientValues,
  nutritionIntakeRevisions,
  nutritionMealAllocationVersions,
  nutritionPermissionVersions,
  nutritionProfiles,
  pantryProducts,
  recipeNutritionCalculations,
  recipes,
} from '@/lib/db/schema';
import {
  allocationOccupiesServing,
  latestMealAllocationVersions,
  mealAllocationCapacity,
} from '@/lib/domain/nutrition-meal-planning';
import {
  nutritionIntakeRevisionInputSchema,
  nutritionMealAllocationInputSchema,
  type NutritionIntakeRevisionInput,
  type NutritionMealAllocationInput,
} from '@/lib/domain/nutrition-intake';
import type { NutritionMutationActorInput } from '@/lib/domain/nutrition-household';
import {
  authorizeNutritionProfileAccess,
  type NutritionAccessAction,
  type NutritionPermissionGrant,
} from '@/lib/domain/nutrition-profile';
import {
  authorizeNutritionHouseholdAllocationTarget,
  authorizeNutritionProfileRead,
  resolveNutritionMutationActor,
} from '@/lib/services/nutrition-profile-service';

type Db = ReturnType<typeof getDatabase>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;
export type NutritionTransaction = Tx;

export class NutritionIntakeNotFoundError extends Error {}
export class NutritionIntakeForbiddenError extends Error {}
export class NutritionIntakeConflictError extends Error {}
export class NutritionIntakeIntegrityError extends Error {}

function db() {
  ensureDatabase();
  return getDatabase();
}

function required<T>(value: T | undefined, message: string): T {
  if (!value) throw new NutritionIntakeNotFoundError(message);
  return value;
}

function latestGrants(executor: Executor, profileId: string): NutritionPermissionGrant[] {
  const rows = executor
    .select()
    .from(nutritionPermissionVersions)
    .where(eq(nutritionPermissionVersions.nutritionProfileId, profileId))
    .orderBy(desc(nutritionPermissionVersions.revision))
    .all();
  const seen = new Set<string>();
  const grants: NutritionPermissionGrant[] = [];
  for (const row of rows) {
    if (seen.has(row.principalId)) continue;
    seen.add(row.principalId);
    if (row.state === 'revoked') continue;
    grants.push({
      principalId: row.principalId,
      role: row.role,
      canViewDiary: row.canViewDiary,
      canViewMeasurements: row.canViewMeasurements,
      canManageProfile: row.canManageProfile,
      canManageGoals: row.canManageGoals,
      canViewComparison: row.canViewComparison,
      canExportData: row.canExportData,
      canDeleteData: row.canDeleteData,
      expiresAt: row.expiresAt,
    });
  }
  return grants;
}

function authorize(
  executor: Executor,
  profileId: string,
  requesterPrincipalId: string,
  action: NutritionAccessAction,
) {
  const profile = required(
    executor.select().from(nutritionProfiles).where(eq(nutritionProfiles.id, profileId)).get(),
    'Nutrition profile was not found.',
  );
  if (profile.archivedAt) {
    throw new NutritionIntakeForbiddenError('Nutrition profile is archived.');
  }
  const decision = authorizeNutritionProfileAccess({
    requesterPrincipalId,
    profile: {
      ownerPrincipalId: profile.ownerPrincipalId,
      comparisonVisibility: profile.comparisonVisibility,
    },
    action,
    grants: latestGrants(executor, profileId),
  });
  if (!decision.allowed) {
    throw new NutritionIntakeForbiddenError('Nutrition diary access was not granted.');
  }
  return profile;
}

function intakeView(executor: Executor, row: typeof nutritionIntakeRevisions.$inferSelect) {
  return {
    ...row,
    provenance: row.provenanceSnapshot ? JSON.parse(row.provenanceSnapshot) : null,
    values: executor
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

function verifyFrozenSources(
  executor: Executor,
  input: ReturnType<typeof nutritionIntakeRevisionInputSchema.parse>,
) {
  if (!input.provenance) return;
  for (const detail of input.provenance.sourceDetails) {
    const source = required(
      executor
        .select()
        .from(nutritionDataSources)
        .where(eq(nutritionDataSources.id, detail.id))
        .get(),
      `Nutrition source ${detail.id} was not found.`,
    );
    if (
      source.name !== detail.name ||
      source.provider !== detail.provider ||
      source.version !== detail.version
    ) {
      throw new NutritionIntakeIntegrityError(
        `Frozen source details do not match Nutrition source ${detail.id}.`,
      );
    }
  }
}

function verifyIntakeSource(
  executor: Executor,
  input: ReturnType<typeof nutritionIntakeRevisionInputSchema.parse>,
) {
  if (input.state === 'skipped' || input.state === 'deleted') return;
  verifyFrozenSources(executor, input);
  const sourceIds = new Set(input.provenance!.sourceIds);
  if (input.sourceType === 'recipe') {
    required(
      executor
        .select({ id: recipes.id })
        .from(recipes)
        .where(eq(recipes.id, input.recipeId!))
        .get(),
      'Recipe was not found.',
    );
    const calculation = required(
      executor
        .select()
        .from(recipeNutritionCalculations)
        .where(eq(recipeNutritionCalculations.id, input.recipeCalculationId!))
        .get(),
      'Recipe nutrition calculation was not found.',
    );
    if (
      calculation.recipeId !== input.recipeId ||
      calculation.calculationVersionId !== input.provenance!.calculationVersionId ||
      calculation.sourceDigest !== input.provenance!.sourceDigest ||
      !sourceIds.has(calculation.sourceId)
    ) {
      throw new NutritionIntakeIntegrityError(
        'Recipe intake provenance must match its immutable calculation evidence.',
      );
    }
  } else if (input.sourceType === 'product') {
    required(
      executor
        .select({ id: pantryProducts.id })
        .from(pantryProducts)
        .where(eq(pantryProducts.id, input.productId!))
        .get(),
      'Pantry product was not found.',
    );
    const record = required(
      executor
        .select()
        .from(foodNutritionRecords)
        .where(eq(foodNutritionRecords.id, input.foodNutritionRecordId!))
        .get(),
      'Food nutrition record was not found.',
    );
    if (record.productId !== input.productId || !sourceIds.has(record.sourceId)) {
      throw new NutritionIntakeIntegrityError(
        'Product intake provenance must match its immutable food record evidence.',
      );
    }
  }
}

export function appendNutritionIntakeRevisionInTransaction(
  transaction: NutritionTransaction,
  profileId: string,
  actorInput: NutritionMutationActorInput,
  raw: NutritionIntakeRevisionInput,
  integration: {
    mealPlanEntryId?: string | null;
    cookSessionId?: string | null;
    preparedRecipeInstanceId?: string | null;
    allowHouseholdTarget?: boolean;
  } = {},
) {
  const input = nutritionIntakeRevisionInputSchema.parse(raw);
  const actor = resolveNutritionMutationActor(actorInput, transaction);
  const requesterPrincipalId = actor.compatibilityPrincipalId;
  if (integration.allowHouseholdTarget) {
    authorizeNutritionHouseholdAllocationTarget(profileId, requesterPrincipalId, transaction);
  } else {
    authorize(transaction, profileId, requesterPrincipalId, 'manage_profile');
  }
  const previous = input.supersedesIntakeRevisionId
    ? required(
        transaction
          .select()
          .from(nutritionIntakeRevisions)
          .where(eq(nutritionIntakeRevisions.id, input.supersedesIntakeRevisionId))
          .get(),
        'Superseded intake revision was not found.',
      )
    : undefined;
  if (previous?.nutritionProfileId !== undefined && previous.nutritionProfileId !== profileId) {
    throw new NutritionIntakeConflictError('Intake revision belongs to another profile.');
  }
  if (previous && previous.sourceType !== input.sourceType) {
    throw new NutritionIntakeIntegrityError(
      'An intake correction must preserve the original source type.',
    );
  }
  const seriesId = previous?.seriesId ?? input.seriesId ?? randomUUID();
  if (input.seriesId && input.seriesId !== seriesId) {
    throw new NutritionIntakeConflictError('Intake series does not match its predecessor.');
  }
  const latest = transaction
    .select()
    .from(nutritionIntakeRevisions)
    .where(eq(nutritionIntakeRevisions.seriesId, seriesId))
    .orderBy(desc(nutritionIntakeRevisions.revision))
    .get();
  if (latest && (!previous || latest.id !== previous.id)) {
    throw new NutritionIntakeConflictError('Only the latest intake revision may be superseded.');
  }
  if (!previous && (input.state === 'corrected' || input.state === 'deleted')) {
    throw new NutritionIntakeIntegrityError('A correction or deletion requires a prior revision.');
  }
  if (previous && input.state !== 'corrected' && input.state !== 'deleted') {
    throw new NutritionIntakeIntegrityError(
      'Later diary history must be represented as a correction or deletion.',
    );
  }

  verifyIntakeSource(transaction, input);
  const row = {
    id: randomUUID(),
    seriesId,
    revision: (latest?.revision ?? 0) + 1,
    nutritionProfileId: profileId,
    occurredAt: new Date(input.occurredAt),
    mealSlot: input.mealSlot,
    state: input.state,
    sourceType: input.sourceType,
    sourceNameSnapshot: input.sourceNameSnapshot,
    recipeId: input.recipeId,
    productId: input.productId,
    recipeCalculationId: input.recipeCalculationId,
    foodNutritionRecordId: input.foodNutritionRecordId,
    mealPlanEntryId: previous?.mealPlanEntryId ?? integration.mealPlanEntryId ?? null,
    cookSessionId: previous?.cookSessionId ?? integration.cookSessionId ?? null,
    preparedRecipeInstanceId:
      previous?.preparedRecipeInstanceId ?? integration.preparedRecipeInstanceId ?? null,
    quantity: input.quantity,
    unit: input.unit,
    servingCount: input.servingCount,
    portionWeightGrams: input.portionWeightGrams,
    provenanceSnapshot: input.provenance ? JSON.stringify(input.provenance) : null,
    revisionReason: input.revisionReason,
    supersedesIntakeRevisionId: previous?.id ?? null,
    createdByPrincipalId: requesterPrincipalId,
    actorHouseholdProfileId: actor.householdProfileId,
    createdAt: new Date(),
  } satisfies typeof nutritionIntakeRevisions.$inferInsert;
  transaction.insert(nutritionIntakeRevisions).values(row).run();
  if (input.values.length > 0) {
    transaction
      .insert(nutritionIntakeNutrientValues)
      .values(
        input.values.map((value) => ({
          intakeRevisionId: row.id,
          nutrientCode: value.nutrientCode,
          amount: value.amount,
          sourceIdsSnapshot: JSON.stringify(value.sourceIds),
          confidence: value.confidence,
          completeness: value.completeness,
          estimated: value.estimated,
        })),
      )
      .run();
  }
  return intakeView(transaction, row);
}

export function appendNutritionIntakeRevision(
  profileId: string,
  actor: NutritionMutationActorInput,
  raw: NutritionIntakeRevisionInput,
) {
  return db().transaction((transaction) =>
    appendNutritionIntakeRevisionInTransaction(transaction, profileId, actor, raw),
  );
}

export function appendUserEnteredNutritionIntakeRevision(
  profileId: string,
  actor: NutritionMutationActorInput,
  raw: unknown,
) {
  const input = nutritionIntakeRevisionInputSchema.parse(raw);
  const consumed = input.state === 'eaten' || input.state === 'corrected';
  if (consumed && input.sourceType !== 'manual') {
    throw new NutritionIntakeIntegrityError(
      'Recipe and product consumption must use a server-built integration route.',
    );
  }
  return appendNutritionIntakeRevision(profileId, actor, input);
}

export function listNutritionIntakeRevisions(profileId: string, requesterPrincipalId: string) {
  const database = db();
  authorizeNutritionProfileRead(profileId, requesterPrincipalId, 'view_diary', database);
  return database
    .select()
    .from(nutritionIntakeRevisions)
    .where(eq(nutritionIntakeRevisions.nutritionProfileId, profileId))
    .orderBy(
      desc(nutritionIntakeRevisions.occurredAt),
      nutritionIntakeRevisions.seriesId,
      nutritionIntakeRevisions.revision,
    )
    .all()
    .map((row) => intakeView(database, row));
}

export function getNutritionIntakeRevisionForUpdate(
  profileId: string,
  requesterPrincipalId: string,
  revisionId: string,
) {
  const database = db();
  authorize(database, profileId, requesterPrincipalId, 'manage_profile');
  const row = required(
    database
      .select()
      .from(nutritionIntakeRevisions)
      .where(eq(nutritionIntakeRevisions.id, revisionId))
      .get(),
    'Intake revision was not found.',
  );
  if (row.nutritionProfileId !== profileId) {
    throw new NutritionIntakeForbiddenError('Intake revision belongs to another profile.');
  }
  return intakeView(database, row);
}

export function appendNutritionMealAllocationVersionInTransaction(
  transaction: NutritionTransaction,
  profileId: string,
  actorInput: NutritionMutationActorInput,
  raw: NutritionMealAllocationInput,
  integration: {
    preparedRecipeInstanceId?: string | null;
    allocationCapacityServings?: number;
  } = {},
) {
  const input = nutritionMealAllocationInputSchema.parse(raw);
  const actor = resolveNutritionMutationActor(actorInput, transaction);
  const requesterPrincipalId = actor.compatibilityPrincipalId;
  authorizeNutritionHouseholdAllocationTarget(profileId, requesterPrincipalId, transaction);
  const mealPlanEntry = input.mealPlanEntryId
    ? required(
        transaction
          .select({ id: mealPlanEntries.id, servings: mealPlanEntries.servings })
          .from(mealPlanEntries)
          .where(eq(mealPlanEntries.id, input.mealPlanEntryId))
          .get(),
        'Meal plan entry was not found.',
      )
    : null;
  if (input.cookSessionId) {
    required(
      transaction
        .select({ id: cookSessions.id })
        .from(cookSessions)
        .where(eq(cookSessions.id, input.cookSessionId))
        .get(),
      'Cook session was not found.',
    );
  }
  if (input.intakeSeriesId) {
    const latestIntake = required(
      transaction
        .select()
        .from(nutritionIntakeRevisions)
        .where(eq(nutritionIntakeRevisions.seriesId, input.intakeSeriesId))
        .orderBy(desc(nutritionIntakeRevisions.revision))
        .get(),
      'Linked intake series was not found.',
    );
    if (
      latestIntake.nutritionProfileId !== profileId ||
      (latestIntake.state !== 'eaten' && latestIntake.state !== 'corrected')
    ) {
      throw new NutritionIntakeIntegrityError(
        'An eaten allocation must link this profile to a current consumed intake revision.',
      );
    }
  }
  const previous = input.supersedesAllocationVersionId
    ? required(
        transaction
          .select()
          .from(nutritionMealAllocationVersions)
          .where(eq(nutritionMealAllocationVersions.id, input.supersedesAllocationVersionId))
          .get(),
        'Superseded meal allocation was not found.',
      )
    : undefined;
  if (previous?.nutritionProfileId !== undefined && previous.nutritionProfileId !== profileId) {
    throw new NutritionIntakeConflictError('Meal allocation belongs to another profile.');
  }
  if (
    previous &&
    (previous.mealPlanEntryId !== input.mealPlanEntryId ||
      previous.cookSessionId !== input.cookSessionId ||
      (integration.preparedRecipeInstanceId !== undefined &&
        previous.preparedRecipeInstanceId !== null &&
        previous.preparedRecipeInstanceId !== integration.preparedRecipeInstanceId))
  ) {
    throw new NutritionIntakeConflictError(
      'An allocation correction must preserve its planned-meal and cook-session identity.',
    );
  }
  const seriesId = previous?.seriesId ?? input.seriesId ?? randomUUID();
  if (input.seriesId && input.seriesId !== seriesId) {
    throw new NutritionIntakeConflictError('Allocation series does not match its predecessor.');
  }
  const latest = transaction
    .select()
    .from(nutritionMealAllocationVersions)
    .where(eq(nutritionMealAllocationVersions.seriesId, seriesId))
    .orderBy(desc(nutritionMealAllocationVersions.revision))
    .get();
  if (latest && (!previous || latest.id !== previous.id)) {
    throw new NutritionIntakeConflictError(
      'Only the latest meal allocation version may be superseded.',
    );
  }
  if (mealPlanEntry && allocationOccupiesServing(input.state)) {
    const mealVersions = transaction
      .select({
        id: nutritionMealAllocationVersions.id,
        seriesId: nutritionMealAllocationVersions.seriesId,
        revision: nutritionMealAllocationVersions.revision,
        state: nutritionMealAllocationVersions.state,
        servings: nutritionMealAllocationVersions.servings,
      })
      .from(nutritionMealAllocationVersions)
      .where(eq(nutritionMealAllocationVersions.mealPlanEntryId, mealPlanEntry.id))
      .all();
    const capacity = mealAllocationCapacity(
      integration.allocationCapacityServings ?? mealPlanEntry.servings,
      mealVersions,
      seriesId,
    );
    const requestedServings = input.servings ?? 0;
    if (requestedServings > capacity.unassignedServings + 1e-9) {
      throw new NutritionIntakeConflictError(
        `Only ${capacity.unassignedServings} unassigned servings remain for this planned meal.`,
      );
    }
    const currentSeries = latestMealAllocationVersions(mealVersions).find(
      (allocation) => allocation.seriesId === seriesId,
    );
    if (currentSeries && previous && currentSeries.id !== previous.id) {
      throw new NutritionIntakeConflictError(
        'Allocation capacity changed concurrently. Refresh before saving.',
      );
    }
  }
  const row = {
    id: randomUUID(),
    seriesId,
    revision: (latest?.revision ?? 0) + 1,
    nutritionProfileId: profileId,
    mealPlanEntryId: input.mealPlanEntryId,
    cookSessionId: input.cookSessionId,
    preparedRecipeInstanceId:
      previous?.preparedRecipeInstanceId ?? integration.preparedRecipeInstanceId ?? null,
    state: input.state,
    servings: input.servings,
    portionWeightGrams: input.portionWeightGrams,
    intakeSeriesId: input.intakeSeriesId,
    note: input.note,
    supersedesAllocationVersionId: previous?.id ?? null,
    createdByPrincipalId: requesterPrincipalId,
    actorHouseholdProfileId: actor.householdProfileId,
    createdAt: new Date(),
  } satisfies typeof nutritionMealAllocationVersions.$inferInsert;
  transaction.insert(nutritionMealAllocationVersions).values(row).run();
  return row;
}

export function appendNutritionMealAllocationVersion(
  profileId: string,
  actor: NutritionMutationActorInput,
  raw: NutritionMealAllocationInput,
) {
  return db().transaction((transaction) =>
    appendNutritionMealAllocationVersionInTransaction(transaction, profileId, actor, raw),
  );
}

export function listNutritionMealAllocationVersions(
  profileId: string,
  requesterPrincipalId: string,
) {
  const database = db();
  authorizeNutritionProfileRead(profileId, requesterPrincipalId, 'view_diary', database);
  return database
    .select()
    .from(nutritionMealAllocationVersions)
    .where(eq(nutritionMealAllocationVersions.nutritionProfileId, profileId))
    .orderBy(nutritionMealAllocationVersions.seriesId, nutritionMealAllocationVersions.revision)
    .all();
}
