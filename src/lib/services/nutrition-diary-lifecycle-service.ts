import 'server-only';

import { and, asc, count, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';

import { ensureDatabase, getDatabase } from '@/lib/db/client';
import {
  nutritionBodyMeasurements,
  nutritionConsumptionCommands,
  nutritionDiaryCommands,
  nutritionGoalVersions,
  nutritionIntakeNutrientValues,
  nutritionIntakeRevisions,
  nutritionMealAllocationVersions,
  nutritionPermissionVersions,
  nutritionPreparedRecipeInstances,
  nutritionPrincipals,
  nutritionProfiles,
} from '@/lib/db/schema';
import {
  moveNutritionLocalTimeToDate,
  nutritionDiaryCommandSchema,
  nutritionDiaryCommandTargetProfileId,
  nutritionProfileDeletionSchema,
  type NutritionDiaryCommand,
} from '@/lib/domain/nutrition-diary-lifecycle';
import { nutritionLocalDateKey } from '@/lib/domain/nutrition-view';
import { nutritionIntakeRevisionInputSchema } from '@/lib/domain/nutrition-intake';
import type { NutritionMutationActorInput } from '@/lib/domain/nutrition-household';
import { hashNutritionAccessSecret } from '@/lib/nutrition-access';
import { appendNutritionIntakeRevisionInTransaction } from '@/lib/services/nutrition-intake-service';
import {
  authorizeNutritionHouseholdAllocationTarget,
  authorizeNutritionProfileAction,
  NutritionProfileForbiddenError,
  resolveNutritionMutationActor,
} from '@/lib/services/nutrition-profile-service';

type Db = ReturnType<typeof getDatabase>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type IntakeRow = typeof nutritionIntakeRevisions.$inferSelect;

export class NutritionDiaryLifecycleNotFoundError extends Error {}
export class NutritionDiaryLifecycleForbiddenError extends Error {}
export class NutritionDiaryLifecycleConflictError extends Error {}
export class NutritionDiaryLifecycleIntegrityError extends Error {}

const MAX_DAY_ENTRIES = 500;
const MAX_EXPORT_ROWS = 50_000;
const MAX_EXPORT_BYTES = 32 * 1024 * 1024;

function db() {
  ensureDatabase();
  return getDatabase();
}

function required<T>(value: T | undefined, message: string): T {
  if (!value) throw new NutritionDiaryLifecycleNotFoundError(message);
  return value;
}

function digest(profileId: string, command: NutritionDiaryCommand): string {
  return createHash('sha256').update(JSON.stringify({ profileId, command })).digest('hex');
}

function snapshotInput(
  transaction: Tx,
  row: IntakeRow,
  state: 'eaten' | 'corrected' | 'deleted',
  options: {
    occurredAt?: Date;
    mealSlot?: IntakeRow['mealSlot'];
    supersedesIntakeRevisionId?: string | null;
    revisionReason?: string;
  } = {},
) {
  const consumed = state !== 'deleted';
  const values = consumed
    ? transaction
        .select()
        .from(nutritionIntakeNutrientValues)
        .where(eq(nutritionIntakeNutrientValues.intakeRevisionId, row.id))
        .orderBy(asc(nutritionIntakeNutrientValues.nutrientCode))
        .all()
    : [];
  if (consumed && (!row.provenanceSnapshot || values.length === 0)) {
    throw new NutritionDiaryLifecycleIntegrityError(
      'The frozen consumed snapshot is incomplete and cannot be reused.',
    );
  }
  return nutritionIntakeRevisionInputSchema.parse({
    supersedesIntakeRevisionId: options.supersedesIntakeRevisionId ?? null,
    occurredAt: (options.occurredAt ?? row.occurredAt).toISOString(),
    mealSlot: options.mealSlot ?? row.mealSlot,
    state,
    sourceType: row.sourceType,
    sourceNameSnapshot: row.sourceNameSnapshot,
    recipeId: row.recipeId,
    productId: row.productId,
    recipeCalculationId: row.recipeCalculationId,
    foodNutritionRecordId: row.foodNutritionRecordId,
    quantity: row.quantity,
    unit: row.unit,
    servingCount: row.servingCount,
    portionWeightGrams: row.portionWeightGrams,
    provenance: consumed ? JSON.parse(row.provenanceSnapshot!) : null,
    revisionReason: options.revisionReason ?? '',
    values: values.map((value) => ({
      nutrientCode: value.nutrientCode,
      amount: value.amount,
      sourceIds: JSON.parse(value.sourceIdsSnapshot) as string[],
      confidence: value.confidence,
      completeness: value.completeness,
      estimated: value.estimated,
    })),
  });
}

function latestSource(transaction: Tx, profileId: string, revisionId: string): IntakeRow {
  const source = required(
    transaction
      .select()
      .from(nutritionIntakeRevisions)
      .where(eq(nutritionIntakeRevisions.id, revisionId))
      .get(),
    'Diary revision was not found.',
  );
  if (source.nutritionProfileId !== profileId) {
    throw new NutritionDiaryLifecycleForbiddenError('Diary revision belongs to another profile.');
  }
  const latest = transaction
    .select({ id: nutritionIntakeRevisions.id })
    .from(nutritionIntakeRevisions)
    .where(eq(nutritionIntakeRevisions.seriesId, source.seriesId))
    .orderBy(desc(nutritionIntakeRevisions.revision))
    .get();
  if (latest?.id !== source.id) {
    throw new NutritionDiaryLifecycleConflictError(
      'Only the latest diary revision may be copied or changed.',
    );
  }
  return source;
}

function requireConsumed(row: IntakeRow) {
  if (row.state !== 'eaten' && row.state !== 'corrected') {
    throw new NutritionDiaryLifecycleIntegrityError(
      'This operation requires the latest consumed diary revision.',
    );
  }
}

function appendCopy(
  transaction: Tx,
  targetProfileId: string,
  actor: NutritionMutationActorInput,
  source: IntakeRow,
  occurredAt: Date,
  mealSlot: IntakeRow['mealSlot'],
  allowHouseholdTarget = false,
) {
  return appendNutritionIntakeRevisionInTransaction(
    transaction,
    targetProfileId,
    actor,
    snapshotInput(transaction, source, 'eaten', { occurredAt, mealSlot }),
    {
      mealPlanEntryId: source.mealPlanEntryId,
      cookSessionId: source.cookSessionId,
      preparedRecipeInstanceId: source.preparedRecipeInstanceId,
      allowHouseholdTarget,
    },
  );
}

export function executeNutritionDiaryCommand(
  sourceProfileId: string,
  actorInput: NutritionMutationActorInput,
  raw: unknown,
) {
  const command = nutritionDiaryCommandSchema.parse(raw);
  const requestDigest = digest(sourceProfileId, command);
  const database = db();
  return database.transaction((transaction) => {
    const actor = resolveNutritionMutationActor(actorInput, transaction);
    const principalId = actor.compatibilityPrincipalId;
    const replay = transaction
      .select()
      .from(nutritionDiaryCommands)
      .where(
        and(
          eq(nutritionDiaryCommands.principalId, principalId),
          eq(nutritionDiaryCommands.idempotencyKey, command.idempotencyKey),
        ),
      )
      .get();
    if (replay) {
      if (replay.requestDigest !== requestDigest) {
        throw new NutritionDiaryLifecycleConflictError(
          'This retry key was already used for a different diary command.',
        );
      }
      authorizeNutritionProfileAction(
        replay.sourceProfileId,
        principalId,
        'manage_profile',
        transaction,
      );
      if (replay.targetProfileId) {
        if (replay.commandType === 'reassign') {
          authorizeNutritionHouseholdAllocationTarget(
            replay.targetProfileId,
            principalId,
            transaction,
          );
        } else {
          authorizeNutritionProfileAction(
            replay.targetProfileId,
            principalId,
            'manage_profile',
            transaction,
          );
        }
      }
      return { replayed: true, result: JSON.parse(replay.resultSnapshot) };
    }

    const sourceProfile = authorizeNutritionProfileAction(
      sourceProfileId,
      principalId,
      'manage_profile',
      transaction,
    );
    const targetProfileId = nutritionDiaryCommandTargetProfileId(sourceProfileId, command);
    const targetProfile = targetProfileId
      ? command.command === 'reassign'
        ? authorizeNutritionHouseholdAllocationTarget(targetProfileId, principalId, transaction)
        : authorizeNutritionProfileAction(
            targetProfileId,
            principalId,
            'manage_profile',
            transaction,
          )
      : null;
    let result: Record<string, unknown>;

    if (command.command === 'copy_day') {
      const rows = transaction
        .select()
        .from(nutritionIntakeRevisions)
        .where(eq(nutritionIntakeRevisions.nutritionProfileId, sourceProfileId))
        .orderBy(asc(nutritionIntakeRevisions.seriesId), desc(nutritionIntakeRevisions.revision))
        .all();
      const latest = new Map<string, IntakeRow>();
      for (const row of rows) if (!latest.has(row.seriesId)) latest.set(row.seriesId, row);
      const sources = [...latest.values()].filter(
        (row) =>
          (row.state === 'eaten' || row.state === 'corrected') &&
          nutritionLocalDateKey(row.occurredAt, sourceProfile.dailyResetTimezone) ===
            command.sourceDate,
      );
      if (sources.length > MAX_DAY_ENTRIES) {
        throw new NutritionDiaryLifecycleIntegrityError('The selected diary day is too large.');
      }
      const revisions = sources.map((source) =>
        appendCopy(
          transaction,
          targetProfileId!,
          actor,
          source,
          moveNutritionLocalTimeToDate(
            source.occurredAt,
            command.targetDate,
            sourceProfile.dailyResetTimezone,
            targetProfile!.dailyResetTimezone,
          ),
          source.mealSlot,
        ),
      );
      result = { command: command.command, revisionIds: revisions.map((row) => row.id) };
    } else {
      const source = latestSource(transaction, sourceProfileId, command.sourceRevisionId);
      if (command.command === 'restore') {
        if (source.state !== 'deleted') {
          throw new NutritionDiaryLifecycleIntegrityError(
            'Restore requires the latest revision to be deleted.',
          );
        }
        const prior = transaction
          .select()
          .from(nutritionIntakeRevisions)
          .where(eq(nutritionIntakeRevisions.seriesId, source.seriesId))
          .orderBy(desc(nutritionIntakeRevisions.revision))
          .all()
          .find(
            (row) =>
              row.revision < source.revision &&
              (row.state === 'eaten' || row.state === 'corrected'),
          );
        const frozen = required(prior, 'No prior consumed snapshot is available to restore.');
        const revision = appendNutritionIntakeRevisionInTransaction(
          transaction,
          sourceProfileId,
          actor,
          snapshotInput(transaction, frozen, 'corrected', {
            occurredAt: source.occurredAt,
            mealSlot: source.mealSlot,
            supersedesIntakeRevisionId: source.id,
            revisionReason: command.reason,
          }),
        );
        result = { command: command.command, revisionId: revision.id };
      } else {
        requireConsumed(source);
        if (command.command === 'copy_entry') {
          const revision = appendCopy(
            transaction,
            targetProfileId!,
            actor,
            source,
            new Date(command.occurredAt),
            command.mealSlot,
          );
          result = { command: command.command, revisionId: revision.id };
        } else if (command.command === 'move') {
          const revision = appendNutritionIntakeRevisionInTransaction(
            transaction,
            sourceProfileId,
            actor,
            snapshotInput(transaction, source, 'corrected', {
              occurredAt: new Date(command.occurredAt),
              mealSlot: command.mealSlot,
              supersedesIntakeRevisionId: source.id,
              revisionReason: command.reason,
            }),
          );
          result = { command: command.command, revisionId: revision.id };
        } else {
          const target = appendCopy(
            transaction,
            targetProfileId!,
            actor,
            source,
            new Date(command.occurredAt),
            command.mealSlot,
            true,
          );
          const deleted = appendNutritionIntakeRevisionInTransaction(
            transaction,
            sourceProfileId,
            actor,
            snapshotInput(transaction, source, 'deleted', {
              supersedesIntakeRevisionId: source.id,
              revisionReason: command.reason,
            }),
          );
          result = {
            command: command.command,
            targetRevisionId: target.id,
            sourceDeletionRevisionId: deleted.id,
          };
        }
      }
    }

    transaction
      .insert(nutritionDiaryCommands)
      .values({
        id: randomUUID(),
        principalId,
        idempotencyKey: command.idempotencyKey,
        requestDigest,
        commandType: command.command,
        sourceProfileId,
        targetProfileId,
        resultSnapshot: JSON.stringify(result),
        actorHouseholdProfileId: actor.householdProfileId,
        createdAt: new Date(),
      })
      .run();
    return { replayed: false, result };
  });
}

function withoutAuditPrincipals<T extends Record<string, unknown>>(row: T) {
  const { ownerPrincipalId, principalId, createdByPrincipalId, credentialHash, ...safe } = row;
  void ownerPrincipalId;
  void principalId;
  void createdByPrincipalId;
  void credentialHash;
  return safe;
}

export function exportPrivateNutritionProfile(profileId: string, principalId: string): string {
  const database = db();
  const profile = authorizeNutritionProfileAction(profileId, principalId, 'export_data', database);
  const countWhere = (
    table:
      | typeof nutritionGoalVersions
      | typeof nutritionBodyMeasurements
      | typeof nutritionIntakeRevisions
      | typeof nutritionMealAllocationVersions
      | typeof nutritionPermissionVersions
      | typeof nutritionDiaryCommands,
    predicate: ReturnType<typeof eq>,
  ) => database.select({ value: count() }).from(table).where(predicate).get()!.value;
  const goalCount = countWhere(
    nutritionGoalVersions,
    eq(nutritionGoalVersions.nutritionProfileId, profileId),
  );
  const measurementCount = countWhere(
    nutritionBodyMeasurements,
    eq(nutritionBodyMeasurements.nutritionProfileId, profileId),
  );
  const intakeCount = countWhere(
    nutritionIntakeRevisions,
    eq(nutritionIntakeRevisions.nutritionProfileId, profileId),
  );
  const nutrientValueCount = database
    .select({ value: count() })
    .from(nutritionIntakeNutrientValues)
    .innerJoin(
      nutritionIntakeRevisions,
      eq(nutritionIntakeNutrientValues.intakeRevisionId, nutritionIntakeRevisions.id),
    )
    .where(eq(nutritionIntakeRevisions.nutritionProfileId, profileId))
    .get()!.value;
  const allocationCount = countWhere(
    nutritionMealAllocationVersions,
    eq(nutritionMealAllocationVersions.nutritionProfileId, profileId),
  );
  const permissionCount = countWhere(
    nutritionPermissionVersions,
    eq(nutritionPermissionVersions.nutritionProfileId, profileId),
  );
  const commandCount = countWhere(
    nutritionDiaryCommands,
    eq(nutritionDiaryCommands.sourceProfileId, profileId),
  );
  // Every prepared row must be referenced by at least one selected intake/allocation row.
  // Counting both reference sets is a safe upper bound before any export arrays are loaded.
  const preflightUpperBound =
    1 +
    goalCount +
    measurementCount +
    intakeCount +
    nutrientValueCount +
    allocationCount +
    permissionCount +
    commandCount +
    intakeCount +
    allocationCount;
  if (preflightUpperBound > MAX_EXPORT_ROWS) {
    throw new NutritionDiaryLifecycleIntegrityError('This Nutrition export is too large.');
  }
  const goals = database
    .select()
    .from(nutritionGoalVersions)
    .where(eq(nutritionGoalVersions.nutritionProfileId, profileId))
    .orderBy(asc(nutritionGoalVersions.seriesId), asc(nutritionGoalVersions.revision))
    .all();
  const measurements = database
    .select()
    .from(nutritionBodyMeasurements)
    .where(eq(nutritionBodyMeasurements.nutritionProfileId, profileId))
    .orderBy(asc(nutritionBodyMeasurements.measuredAt), asc(nutritionBodyMeasurements.id))
    .all();
  const intake = database
    .select()
    .from(nutritionIntakeRevisions)
    .where(eq(nutritionIntakeRevisions.nutritionProfileId, profileId))
    .orderBy(asc(nutritionIntakeRevisions.seriesId), asc(nutritionIntakeRevisions.revision))
    .all();
  const nutrientValues = database
    .select({
      intakeRevisionId: nutritionIntakeNutrientValues.intakeRevisionId,
      nutrientCode: nutritionIntakeNutrientValues.nutrientCode,
      amount: nutritionIntakeNutrientValues.amount,
      sourceIdsSnapshot: nutritionIntakeNutrientValues.sourceIdsSnapshot,
      confidence: nutritionIntakeNutrientValues.confidence,
      completeness: nutritionIntakeNutrientValues.completeness,
      estimated: nutritionIntakeNutrientValues.estimated,
    })
    .from(nutritionIntakeNutrientValues)
    .innerJoin(
      nutritionIntakeRevisions,
      eq(nutritionIntakeNutrientValues.intakeRevisionId, nutritionIntakeRevisions.id),
    )
    .where(eq(nutritionIntakeRevisions.nutritionProfileId, profileId))
    .orderBy(
      asc(nutritionIntakeNutrientValues.intakeRevisionId),
      asc(nutritionIntakeNutrientValues.nutrientCode),
    )
    .all();
  const allocations = database
    .select()
    .from(nutritionMealAllocationVersions)
    .where(eq(nutritionMealAllocationVersions.nutritionProfileId, profileId))
    .orderBy(
      asc(nutritionMealAllocationVersions.seriesId),
      asc(nutritionMealAllocationVersions.revision),
    )
    .all();
  const preparedIds = [
    ...new Set(
      [...intake, ...allocations]
        .map((row) => row.preparedRecipeInstanceId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const prepared: Array<typeof nutritionPreparedRecipeInstances.$inferSelect> = [];
  for (let offset = 0; offset < preparedIds.length; offset += 250) {
    prepared.push(
      ...database
        .select()
        .from(nutritionPreparedRecipeInstances)
        .where(
          inArray(nutritionPreparedRecipeInstances.id, preparedIds.slice(offset, offset + 250)),
        )
        .all(),
    );
  }
  prepared.sort((left, right) => left.id.localeCompare(right.id));
  const permissions = database
    .select()
    .from(nutritionPermissionVersions)
    .where(eq(nutritionPermissionVersions.nutritionProfileId, profileId))
    .orderBy(asc(nutritionPermissionVersions.createdAt), asc(nutritionPermissionVersions.id))
    .all();
  const commands = database
    .select()
    .from(nutritionDiaryCommands)
    .where(eq(nutritionDiaryCommands.sourceProfileId, profileId))
    .orderBy(asc(nutritionDiaryCommands.createdAt), asc(nutritionDiaryCommands.id))
    .all();
  const payload = JSON.stringify({
    format: 'bord-private-nutrition-v1',
    profile: withoutAuditPrincipals(profile),
    goals: goals.map(withoutAuditPrincipals),
    measurements: measurements.map(withoutAuditPrincipals),
    intakeRevisions: intake.map((row) => ({
      ...withoutAuditPrincipals(row),
      provenanceSnapshot: row.provenanceSnapshot ? JSON.parse(row.provenanceSnapshot) : null,
    })),
    intakeNutrientValues: nutrientValues.map((row) => ({
      ...row,
      sourceIdsSnapshot: JSON.parse(row.sourceIdsSnapshot),
    })),
    allocationVersions: allocations.map(withoutAuditPrincipals),
    preparedRecipeInstances: prepared.map((row) => ({
      ...withoutAuditPrincipals(row),
      includedOptionalIngredientIdsSnapshot: JSON.parse(row.includedOptionalIngredientIdsSnapshot),
      adjustmentsSnapshot: JSON.parse(row.adjustmentsSnapshot),
    })),
    permissionHistory: permissions.map((row) => ({
      ...withoutAuditPrincipals(row),
      grantee: 'redacted',
    })),
    diaryCommandHistory: commands.map((row) => ({
      id: row.id,
      commandType: row.commandType,
      target: row.targetProfileId
        ? row.targetProfileId === profileId
          ? 'self'
          : 'redacted'
        : null,
      createdAt: row.createdAt,
    })),
  });
  if (Buffer.byteLength(payload, 'utf8') > MAX_EXPORT_BYTES) {
    throw new NutritionDiaryLifecycleIntegrityError('This Nutrition export is too large.');
  }
  return payload;
}

export function deletePrivateNutritionProfileData(
  profileId: string,
  principalId: string,
  raw: unknown,
) {
  void profileId;
  void principalId;
  void raw;
  throw new NutritionDiaryLifecycleForbiddenError(
    'Nutrition profile deletion is retired; archive the linked household profile instead.',
  );

  /* c8 ignore start -- retained only until the historical deletion implementation is removed. */
  const input = nutritionProfileDeletionSchema.parse(raw);
  const database = db();
  return database.transaction((transaction) => {
    const profile = authorizeNutritionProfileAction(
      profileId,
      principalId,
      'delete_data',
      transaction,
    );
    if (profile.version !== input.expectedVersion) {
      throw new NutritionDiaryLifecycleConflictError(
        'Nutrition profile changed after deletion was confirmed.',
      );
    }
    if (input.confirmation !== `DELETE ${profile.displayName}`) {
      throw new NutritionDiaryLifecycleIntegrityError(
        `Type DELETE ${profile.displayName} exactly to delete this Nutrition profile.`,
      );
    }

    const intake = transaction
      .select()
      .from(nutritionIntakeRevisions)
      .where(eq(nutritionIntakeRevisions.nutritionProfileId, profileId))
      .orderBy(desc(nutritionIntakeRevisions.revision))
      .all();
    const allocations = transaction
      .select()
      .from(nutritionMealAllocationVersions)
      .where(eq(nutritionMealAllocationVersions.nutritionProfileId, profileId))
      .orderBy(desc(nutritionMealAllocationVersions.revision))
      .all();
    const preparedIds = [
      ...new Set(
        [...intake, ...allocations]
          .map((row) => row.preparedRecipeInstanceId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const prepared = preparedIds.length
      ? preparedIds.flatMap((_, offset) =>
          offset % 250 === 0
            ? transaction
                .select()
                .from(nutritionPreparedRecipeInstances)
                .where(
                  inArray(
                    nutritionPreparedRecipeInstances.id,
                    preparedIds.slice(offset, offset + 250),
                  ),
                )
                .all()
            : [],
        )
      : [];

    transaction
      .delete(nutritionDiaryCommands)
      .where(
        or(
          eq(nutritionDiaryCommands.sourceProfileId, profileId),
          eq(nutritionDiaryCommands.targetProfileId, profileId),
        ),
      )
      .run();
    transaction
      .delete(nutritionConsumptionCommands)
      .where(eq(nutritionConsumptionCommands.nutritionProfileId, profileId))
      .run();

    const intakeIds = intake.map((row) => row.id);
    for (let offset = 0; offset < intakeIds.length; offset += 250) {
      const ids = intakeIds.slice(offset, offset + 250);
      const foreignCommands = transaction
        .select({ id: nutritionConsumptionCommands.id })
        .from(nutritionConsumptionCommands)
        .where(inArray(nutritionConsumptionCommands.intakeRevisionId, ids))
        .all();
      if (foreignCommands.length > 0) {
        throw new NutritionDiaryLifecycleIntegrityError(
          'Another profile command unexpectedly references this diary; nothing was deleted.',
        );
      }
      transaction
        .delete(nutritionIntakeNutrientValues)
        .where(inArray(nutritionIntakeNutrientValues.intakeRevisionId, ids))
        .run();
    }
    for (const row of intake) {
      transaction
        .delete(nutritionIntakeRevisions)
        .where(eq(nutritionIntakeRevisions.id, row.id))
        .run();
    }

    for (const row of allocations) {
      const foreignCommand = transaction
        .select({ id: nutritionConsumptionCommands.id })
        .from(nutritionConsumptionCommands)
        .where(eq(nutritionConsumptionCommands.allocationVersionId, row.id))
        .get();
      if (foreignCommand) {
        throw new NutritionDiaryLifecycleIntegrityError(
          'Another profile command unexpectedly references this allocation; nothing was deleted.',
        );
      }
      transaction
        .delete(nutritionMealAllocationVersions)
        .where(eq(nutritionMealAllocationVersions.id, row.id))
        .run();
    }

    const goals = transaction
      .select()
      .from(nutritionGoalVersions)
      .where(eq(nutritionGoalVersions.nutritionProfileId, profileId))
      .orderBy(desc(nutritionGoalVersions.revision))
      .all();
    for (const row of goals) {
      transaction.delete(nutritionGoalVersions).where(eq(nutritionGoalVersions.id, row.id)).run();
    }
    const permissions = transaction
      .select()
      .from(nutritionPermissionVersions)
      .where(eq(nutritionPermissionVersions.nutritionProfileId, profileId))
      .orderBy(desc(nutritionPermissionVersions.revision))
      .all();
    for (const row of permissions) {
      transaction
        .delete(nutritionPermissionVersions)
        .where(eq(nutritionPermissionVersions.id, row.id))
        .run();
    }
    transaction
      .delete(nutritionBodyMeasurements)
      .where(eq(nutritionBodyMeasurements.nutritionProfileId, profileId))
      .run();

    for (const row of prepared) {
      if (row.createdByPrincipalId !== profile.ownerPrincipalId) continue;
      const remainingIntake = transaction
        .select({ value: count() })
        .from(nutritionIntakeRevisions)
        .where(eq(nutritionIntakeRevisions.preparedRecipeInstanceId, row.id))
        .get()!.value;
      const remainingAllocations = transaction
        .select({ value: count() })
        .from(nutritionMealAllocationVersions)
        .where(eq(nutritionMealAllocationVersions.preparedRecipeInstanceId, row.id))
        .get()!.value;
      const remainingCommands = transaction
        .select({ value: count() })
        .from(nutritionConsumptionCommands)
        .where(eq(nutritionConsumptionCommands.preparedRecipeInstanceId, row.id))
        .get()!.value;
      if (remainingIntake + remainingAllocations + remainingCommands === 0) {
        transaction
          .delete(nutritionPreparedRecipeInstances)
          .where(eq(nutritionPreparedRecipeInstances.id, row.id))
          .run();
      } else if (row.note) {
        transaction
          .update(nutritionPreparedRecipeInstances)
          .set({ note: '' })
          .where(eq(nutritionPreparedRecipeInstances.id, row.id))
          .run();
      }
    }

    const now = new Date();
    transaction
      .update(nutritionProfiles)
      .set({
        linkedHouseholdProfileId: profile.linkedHouseholdProfileId,
        displayName: 'Deleted Nutrition profile',
        avatarUrl: '',
        profileType: 'guest',
        dateOfBirth: null,
        heightCentimeters: null,
        currentWeightKilograms: null,
        measurementSystem: 'metric',
        referenceSexCategory: null,
        activityLevel: null,
        nutritionGoalType: 'none',
        targetWeightKilograms: null,
        targetDate: null,
        explicitlyEnteredLifeStage: null,
        dietaryPreferences: '[]',
        foodAllergies: '[]',
        dietaryExclusions: '[]',
        estimatedTargetsEnabled: false,
        estimatedTargetConsent: false,
        weightTrackingEnabled: false,
        comparisonVisibility: 'hidden',
        diaryVisibility: 'private',
        preferredEnergyUnit: 'kcal',
        dailyResetTimezone: 'UTC',
        weekStartsOn: 1,
        referenceJurisdiction: 'US',
        version: profile.version + 1,
        archivedAt: now,
        updatedAt: now,
      })
      .where(
        and(eq(nutritionProfiles.id, profileId), eq(nutritionProfiles.version, profile.version)),
      )
      .run();

    const otherActiveProfiles = transaction
      .select({ id: nutritionProfiles.id })
      .from(nutritionProfiles)
      .where(isNull(nutritionProfiles.archivedAt))
      .all();
    const stillManagesProfile = otherActiveProfiles.some((candidate) => {
      try {
        authorizeNutritionProfileAction(
          candidate.id,
          profile.ownerPrincipalId,
          'manage_profile',
          transaction,
        );
        return true;
      } catch (error) {
        if (error instanceof NutritionProfileForbiddenError) return false;
        throw error;
      }
    });
    let principalCredentialInvalidated = false;
    if (!stillManagesProfile) {
      const principal = required(
        transaction
          .select()
          .from(nutritionPrincipals)
          .where(eq(nutritionPrincipals.id, profile.ownerPrincipalId))
          .get(),
        'Nutrition principal was not found.',
      );
      transaction
        .update(nutritionPrincipals)
        .set({
          credentialHash: hashNutritionAccessSecret(`${randomUUID()}${randomUUID()}`),
          accessVersion: principal.accessVersion + 1,
          archivedAt: now,
          updatedAt: now,
        })
        .where(eq(nutritionPrincipals.id, profile.ownerPrincipalId))
        .run();
      principalCredentialInvalidated = true;
    }
    return {
      profileId,
      archivedAt: now,
      ownerCredentialInvalidated: principalCredentialInvalidated,
      requesterCredentialInvalidated:
        principalCredentialInvalidated && profile.ownerPrincipalId === principalId,
    };
  });
  /* c8 ignore stop */
}
