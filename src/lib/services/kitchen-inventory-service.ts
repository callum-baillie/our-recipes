import { checkRecipePhaseRequirements } from '@/lib/domain/kitchen-recipe-requirements';
import { cavityCoUse } from '@/lib/domain/kitchen-cavity';
import { apiPermissionsSchema } from '@/lib/domain/auth';
import { recipeYieldNumber } from '@/lib/domain/cooking';
import { restrictionsApply } from '@/lib/domain/cooking-episode';
import { getPlannedMeal, getRecipeForPlannedMeal } from './planning-service';
import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import {
  cookSessions,
  apikey,
  households,
  kitchens,
  kitchenEquipment,
  kitchenOperations,
  kitchenResourceClaims,
  kitchenPhysicalUses,
  kitchenAcceptedPlans,
  profiles,
  profileAuthLinks,
  user,
} from '@/lib/db/schema';
import {
  appRoleCan,
  effectiveAppRole,
  normalizeAppRole,
  type AppCapability,
} from '@/lib/domain/permissions';
import {
  kitchenCommandSchema,
  kitchenPlanRequestSchema,
  equipmentResources,
  type KitchenState,
  type Equipment,
} from '@/lib/domain/kitchen';
import {
  equipmentTemplate,
  KITCHEN_CATALOG,
  KITCHEN_CATALOG_VERSION,
} from '@/lib/domain/kitchen-catalog';
import { checkKitchenPlan } from '@/lib/domain/kitchen-feasibility';
import { DecisionError } from '@/lib/providers/decisions-provider';
import type { RequestPrincipal } from './auth-service';
import { getRecipe } from './recipe-service';

/** Recheck live account AND effective profile authority, including delayed executions. */
export function authorizeKitchen(p: RequestPrincipal, capability: AppCapability) {
  if (p.kind === 'api-key') {
    const action = capability.split('.')[1];
    if (!p.apiPermissions?.kitchen?.includes(action as 'read' | 'create' | 'update' | 'delete'))
      throw new DecisionError('This API key lacks the required kitchen permission.', 403);
  }
  ensureDatabase();
  const db = getDatabase();
  const account = db.select().from(user).where(eq(user.id, p.userId)).get();
  let liveApiPermissions: z.infer<typeof apiPermissionsSchema> | undefined;
  if (p.kind === 'api-key') {
    const key = p.apiKeyId ? db.select().from(apikey).where(eq(apikey.id, p.apiKeyId)).get() : null;
    let permissions: unknown;
    try {
      permissions = JSON.parse(key?.permissions ?? '{}');
    } catch {
      permissions = null;
    }
    const parsed = apiPermissionsSchema.safeParse(permissions);
    const action = capability.split('.')[1] as 'read' | 'create' | 'update' | 'delete';
    if (
      account?.role !== 'admin' ||
      p.profileId !== p.linkedProfileId ||
      !key ||
      !key.enabled ||
      key.referenceId !== p.userId ||
      (key.expiresAt && key.expiresAt.getTime() <= Date.now()) ||
      !parsed.success ||
      !parsed.data.kitchen?.includes(action)
    )
      throw new DecisionError(
        'This API key or its account authority changed. Authenticate again with current kitchen permissions.',
        403,
      );
    liveApiPermissions = parsed.data;
  }

  const link = db
    .select()
    .from(profileAuthLinks)
    .where(eq(profileAuthLinks.userId, p.userId))
    .get();
  const active = db
    .select({ role: user.role, archivedAt: profiles.archivedAt })
    .from(profiles)
    .innerJoin(profileAuthLinks, eq(profileAuthLinks.profileId, profiles.id))
    .innerJoin(user, eq(user.id, profileAuthLinks.userId))
    .where(eq(profiles.id, p.profileId))
    .get();
  const linked = db.select().from(profiles).where(eq(profiles.id, p.linkedProfileId)).get();
  if (
    !account ||
    account.banned ||
    !link ||
    link.profileId !== p.linkedProfileId ||
    !active ||
    active.archivedAt ||
    !linked ||
    linked.archivedAt ||
    !appRoleCan(normalizeAppRole(account.role), capability) ||
    !appRoleCan(
      effectiveAppRole(normalizeAppRole(account.role), normalizeAppRole(active.role)),
      capability,
    )
  )
    throw new DecisionError(
      'Your account or active profile cannot perform this kitchen operation.',
      403,
    );
  return {
    apiPermissions: liveApiPermissions,
    accountRole: normalizeAppRole(account.role),
    role: effectiveAppRole(normalizeAppRole(account.role), normalizeAppRole(active.role)),
  };
}
function primaryKitchen() {
  const db = getDatabase();
  const household = db.select().from(households).get();
  if (!household) throw new DecisionError('Set up a household first.', 409);
  let kitchen = db
    .select()
    .from(kitchens)
    .where(and(eq(kitchens.householdId, household.id), eq(kitchens.isPrimary, true)))
    .get();
  if (!kitchen) {
    db.insert(kitchens)
      .values({ id: randomUUID(), householdId: household.id, name: 'My Kitchen' })
      .onConflictDoNothing()
      .run();
    kitchen = db
      .select()
      .from(kitchens)
      .where(and(eq(kitchens.householdId, household.id), eq(kitchens.isPrimary, true)))
      .get();
  }
  return kitchen!;
}
export function readKitchenInventory(p: RequestPrincipal): KitchenState {
  const authority = authorizeKitchen(p, 'shared.read');
  const kitchen = primaryKitchen();
  let canManage = true;
  try {
    authorizeKitchen(p, 'shared.update');
  } catch {
    canManage = false;
  }
  return {
    ...kitchen,
    viewerProfileId: p.profileId,
    viewerUserId: p.userId,
    canRecoverAbandoned: authority.accountRole === 'admin' && authority.role === 'admin',
    canManage,
    items: getDatabase()
      .select()
      .from(kitchenEquipment)
      .where(eq(kitchenEquipment.kitchenId, kitchen.id))
      .all()
      .map((row) => row.data),
  };
}
export function kitchenCatalog(p: RequestPrincipal) {
  authorizeKitchen(p, 'shared.read');
  return { version: KITCHEN_CATALOG_VERSION, templates: KITCHEN_CATALOG };
}
export function executeKitchenCommand(p: RequestPrincipal, raw: unknown) {
  const input = kitchenCommandSchema.parse(raw);
  authorizeKitchen(
    p,
    input.kind === 'add'
      ? 'shared.create'
      : input.kind === 'update' && input.item.availability === 'archived'
        ? 'shared.delete'
        : 'shared.update',
  );
  return getDatabase().transaction(
    (tx) => {
      authorizeKitchen(
        p,
        input.kind === 'add'
          ? 'shared.create'
          : input.kind === 'update' && input.item.availability === 'archived'
            ? 'shared.delete'
            : 'shared.update',
      );
      const current = readKitchenInventory(p);
      const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
      const previous = tx
        .select()
        .from(kitchenOperations)
        .where(eq(kitchenOperations.id, input.operationId))
        .get();
      if (previous) {
        if (
          previous.userId !== p.userId ||
          previous.profileId !== p.profileId ||
          previous.kitchenId !== current.id ||
          previous.intentHash !== hash
        )
          throw new DecisionError(
            'This operation belongs to a different reviewed intent or actor.',
            409,
          );
        return { receipt: previous.receipt, kitchen: current, replayed: true };
      }
      if (current.revision !== input.expectedRevision)
        throw new DecisionError(
          'The kitchen changed. Your draft is retained; reload and review before saving.',
          409,
        );
      const itemIds: string[] = [];
      if (input.kind === 'coverage')
        tx.update(kitchens)
          .set({ coverage: input.coverage })
          .where(eq(kitchens.id, current.id))
          .run();
      else if (input.kind === 'setup')
        tx.update(kitchens)
          .set({ name: input.name, constraints: input.constraints })
          .where(eq(kitchens.id, current.id))
          .run();
      else {
        const parent = input.item.parentId
          ? current.items.find(
              (i) => i.id === input.item.parentId && i.availability !== 'archived' && !i.parentId,
            )
          : null;
        if (input.item.parentId && !parent)
          throw new DecisionError('Choose an available parent appliance in this kitchen.', 409);
        if (input.kind === 'update') {
          const target = current.items.find((i) => i.id === input.itemId);
          if (!target) throw new DecisionError('Equipment not found.', 404);
          if (target.revision !== input.expectedItemRevision)
            throw new DecisionError(
              'This item changed. Review the latest item before saving.',
              409,
            );
          const resources = equipmentResources(target);
          if (
            tx
              .select()
              .from(kitchenResourceClaims)
              .all()
              .some(
                (c) => resources.includes(c.resourceId) || c.resourceId.startsWith(`${target.id}:`),
              )
          )
            throw new DecisionError(
              'This equipment is marked in use. Acknowledge its release before changing it.',
              409,
            );
          if (input.item.parentId === target.id)
            throw new DecisionError('An item cannot attach to itself.');
          const updated: Equipment = {
            ...input.item,
            capabilities:
              input.item.capabilities ?? equipmentTemplate(input.item.typeKey)!.capabilities,
            id: target.id,
            revision: target.revision + 1,
            createdAt: target.createdAt,
            updatedAt: new Date().toISOString(),
            actorProfileId: p.profileId,
          };
          tx.update(kitchenEquipment)
            .set({ data: updated, revision: updated.revision })
            .where(eq(kitchenEquipment.id, target.id))
            .run();
          itemIds.push(target.id);
        } else {
          if (current.items.filter((i) => i.availability !== 'archived').length + input.count > 500)
            throw new DecisionError('This kitchen supports up to 500 active items.');
          for (let i = 0; i < input.count; i++) {
            const now = new Date().toISOString();
            const item: Equipment = {
              ...input.item,
              capabilities:
                input.item.capabilities ?? equipmentTemplate(input.item.typeKey)!.capabilities,
              id: randomUUID(),
              revision: 1,
              createdAt: now,
              updatedAt: now,
              actorProfileId: p.profileId,
            };
            tx.insert(kitchenEquipment)
              .values({ id: item.id, kitchenId: current.id, revision: 1, data: item })
              .run();
            itemIds.push(item.id);
          }
          if (current.coverage === 'not-started')
            tx.update(kitchens)
              .set({ coverage: 'partial' })
              .where(eq(kitchens.id, current.id))
              .run();
        }
      }
      const revision = current.revision + 1;
      tx.update(kitchens).set({ revision }).where(eq(kitchens.id, current.id)).run();
      const receipt = { itemIds, revision };
      tx.insert(kitchenOperations)
        .values({
          id: input.operationId,
          kitchenId: current.id,
          userId: p.userId,
          profileId: p.profileId,
          intentHash: hash,
          receipt,
          snapshot: JSON.stringify(input),
          createdAt: new Date(),
        })
        .run();
      return { receipt, kitchen: readKitchenInventory(p), replayed: false };
    },
    { behavior: 'immediate' },
  );
}
export function previewKitchenPlan(p: RequestPrincipal, raw: unknown) {
  const input = kitchenPlanRequestSchema.parse(raw);
  const authority = authorizeKitchen(p, 'shared.read');
  if (p.kind === 'api-key') {
    if (input.episodeId || input.phases.some((phase) => phase.cookSessionId))
      throw new DecisionError(
        'Use the original signed-in account for private cooking snapshots and episode plans.',
        403,
      );
    if (!authority.apiPermissions?.recipes?.includes('read'))
      throw new DecisionError('Recipe compatibility also requires recipes:read.', 403);
    if (
      input.phases.some((phase) => phase.mealPlanEntryId) &&
      !authority.apiPermissions?.mealPlans?.includes('read')
    )
      throw new DecisionError('Planned-meal compatibility also requires mealPlans:read.', 403);
  }
  const kitchen = readKitchenInventory(p);
  if (input.expectedRevision !== kitchen.revision)
    throw new DecisionError('Kitchen changed; refresh the plan review.', 409);
  const episode = input.episodeId
    ? getDatabase()
        .select()
        .from(cookSessions)
        .where(
          and(
            eq(cookSessions.id, input.episodeId),
            eq(cookSessions.ownerUserId, p.userId),
            eq(cookSessions.profileId, p.profileId),
          ),
        )
        .get()
    : null;
  if (
    input.episodeId &&
    (!episode || episode.completedAt || episode.contextRevision !== input.episodeContextRevision)
  )
    throw new DecisionError(
      'This cooking episode changed. Refresh its dated restrictions and plan review.',
      409,
    );
  const restriction = episode?.cookingRestrictions ?? null;
  const restricted = restrictionsApply(restriction);
  const effectiveKitchen =
    restricted && restriction
      ? {
          ...kitchen,
          items: kitchen.items.map((item) => ({
            ...item,
            availability: restriction.excludedEquipmentIds.includes(item.id)
              ? ('unavailable' as const)
              : item.availability,
            capabilities: item.capabilities.filter(
              (capability) => !restriction.excludedCapabilities.includes(capability),
            ),
          })),
        }
      : kitchen;
  const scalingIssues: string[] = [];
  const sourceGroups = new Map<
    string,
    { recipe: NonNullable<ReturnType<typeof getRecipe>>; phases: typeof input.phases }
  >();
  for (const phase of input.phases) {
    if (phase.cookSessionId && phase.cookSessionId !== input.episodeId)
      throw new DecisionError(
        'Bind cooking snapshot phases to their explicit episode and dated restrictions.',
        409,
      );
    const meal = phase.mealPlanEntryId ? getPlannedMeal(phase.mealPlanEntryId) : null;
    if (
      phase.mealPlanEntryId &&
      (!meal ||
        !phase.mealExpectedUpdatedAt ||
        new Date(meal.updatedAt).toISOString() !== phase.mealExpectedUpdatedAt)
    )
      throw new DecisionError(
        'The planned meal changed. Refresh the effective recipe review.',
        409,
      );
    const session = phase.cookSessionId
      ? getDatabase()
          .select()
          .from(cookSessions)
          .where(
            and(
              eq(cookSessions.id, phase.cookSessionId),
              eq(cookSessions.ownerUserId, p.userId),
              eq(cookSessions.profileId, p.profileId),
            ),
          )
          .get()
      : null;
    if (
      phase.cookSessionId &&
      (!session ||
        session.recipeId !== phase.recipeId ||
        session.completedAt ||
        session.effectiveRevision !== phase.cookSessionRevision)
    )
      throw new DecisionError('The cooking snapshot changed. Refresh its equipment review.', 409);
    const recipe =
      session?.effectiveRecipe ??
      (phase.mealPlanEntryId
        ? getRecipeForPlannedMeal(phase.recipeId, phase.mealPlanEntryId)
        : getRecipe(phase.recipeId));
    const targetServings = session?.targetServings ?? phase.targetServings;
    if (
      recipe &&
      targetServings !== undefined &&
      targetServings !== recipeYieldNumber(recipe.servings)
    )
      scalingIssues.push(
        `${phase.id}: batch size differs from the reviewed recipe yield; review method-specific capacity, space, batching and timing in an adapted snapshot before accepting an allocation.`,
      );
    if (!recipe || recipe.currentRevision !== phase.recipeRevision)
      throw new DecisionError(
        'A recipe changed; retain the draft and refresh its step references.',
        409,
      );
    if (
      phase.stepRefs.some(
        (ref) =>
          !recipe.instructionSections.flatMap((s) => s.steps).some((step) => step.id === ref),
      )
    )
      throw new DecisionError('Step references do not match this recipe revision.', 409);
    const sourceKey = JSON.stringify([
      phase.recipeId,
      phase.recipeRevision,
      phase.cookSessionId ?? '',
      phase.mealPlanEntryId ?? '',
    ]);
    const group = sourceGroups.get(sourceKey) ?? { recipe, phases: [] };
    group.phases.push(phase);
    sourceGroups.set(sourceKey, group);
  }
  const result = checkKitchenPlan(effectiveKitchen, input.phases, input.strategy, input.maxHandsOn);
  for (const group of sourceGroups.values()) {
    const coverage = checkRecipePhaseRequirements(group.recipe, group.phases);
    if (coverage.conflicts.length) result.status = 'conflict';
    else if (coverage.unknowns.length && result.status !== 'conflict')
      result.status = 'needs-information';
    result.issues.push(...coverage.conflicts, ...coverage.unknowns);
    if (!group.recipe.equipmentRequirements.length)
      result.assumptions.push(
        `${group.recipe.title}: no structured recipe requirements were recorded. This check covers the explicitly reviewed phases, not completeness of the recipe's equipment or fit.`,
      );
  }
  if (scalingIssues.length) {
    if (result.status !== 'conflict') result.status = 'needs-information';
    result.issues.push(...scalingIssues);
  }
  if (restricted && restriction)
    result.assumptions.push(
      `Episode restrictions apply on ${restriction.validOn} in ${restriction.timezone} only.`,
    );
  return result;
}
export function readKitchenClaims(p: RequestPrincipal) {
  const kitchen = readKitchenInventory(p);
  return getDatabase()
    .select()
    .from(kitchenResourceClaims)
    .where(eq(kitchenResourceClaims.kitchenId, kitchen.id))
    .all();
}
export const claimKitchenPhaseSchema = z
  .object({
    operation: z.enum(['start', 'release']),
    acceptedPlanId: z.string().uuid().optional(),
    episodeId: z.string().uuid(),
    phaseId: z.string().min(1).max(80),
    plan: kitchenPlanRequestSchema.optional(),
    acknowledged: z.boolean().default(false),
    expectedUseId: z.uuid().optional(),
    recoverAbandoned: z.boolean().default(false),
  })
  .strict();
export function manageKitchenPhase(p: RequestPrincipal, raw: unknown) {
  authorizeKitchen(p, 'shared.update');
  const input = claimKitchenPhaseSchema.parse(raw);
  return getDatabase().transaction(
    (tx) => {
      const authority = authorizeKitchen(p, 'shared.update');
      const kitchen = readKitchenInventory(p);
      const phaseState: 'active' | 'released' =
        input.operation === 'release' ? 'released' : 'active';
      if (input.operation === 'release') {
        if (!input.acknowledged)
          throw new DecisionError(
            'Confirm the equipment and vessels are physically free before releasing them.',
          );
        const held = tx
          .select()
          .from(kitchenResourceClaims)
          .where(
            and(
              eq(kitchenResourceClaims.kitchenId, kitchen.id),
              eq(kitchenResourceClaims.episodeId, input.episodeId),
              eq(kitchenResourceClaims.phaseId, input.phaseId),
            ),
          )
          .all();
        if (held.some((claim) => !input.expectedUseId || claim.useId !== input.expectedUseId))
          throw new DecisionError(
            'This active use changed. Refresh the physical-use review before acknowledging release.',
            409,
          );
        const recovery =
          input.recoverAbandoned && authority.accountRole === 'admin' && authority.role === 'admin';
        if (held.some((claim) => claim.userId !== p.userId) && !recovery)
          throw new DecisionError(
            'Ask the person who started this phase, or an administrator reviewing abandoned use, to acknowledge its physical release.',
            403,
          );
        if (input.expectedUseId) {
          const use = tx
            .select()
            .from(kitchenPhysicalUses)
            .where(eq(kitchenPhysicalUses.id, input.expectedUseId))
            .get();
          if (
            !use ||
            use.kitchenId !== kitchen.id ||
            use.episodeId !== input.episodeId ||
            use.phaseId !== input.phaseId ||
            (use.userId !== p.userId && !recovery)
          )
            throw new DecisionError('This physical-use receipt belongs to another scope.', 403);
          if (!use.releasedAt)
            tx.update(kitchenPhysicalUses)
              .set({ releasedAt: new Date(), releaseActorId: p.userId })
              .where(eq(kitchenPhysicalUses.id, use.id))
              .run();
        }
        tx.delete(kitchenResourceClaims)
          .where(
            and(
              eq(kitchenResourceClaims.kitchenId, kitchen.id),
              eq(kitchenResourceClaims.episodeId, input.episodeId),
              eq(kitchenResourceClaims.phaseId, input.phaseId),
            ),
          )
          .run();
      } else {
        if (p.kind === 'api-key' && input.acceptedPlanId)
          throw new DecisionError(
            'Use the original signed-in account for private accepted episode plans.',
            403,
          );
        const accepted = input.acceptedPlanId
          ? tx
              .select()
              .from(kitchenAcceptedPlans)
              .where(eq(kitchenAcceptedPlans.id, input.acceptedPlanId))
              .get()
          : null;
        if (
          input.acceptedPlanId &&
          (!accepted || accepted.sessionId !== input.episodeId || accepted.userId !== p.userId)
        )
          throw new DecisionError('Choose an accepted plan owned by this cooking episode.', 403);
        const request = accepted?.request ?? input.plan;
        if (!request) throw new DecisionError('Review a current plan before starting.');
        const episode = tx
          .select()
          .from(cookSessions)
          .where(eq(cookSessions.id, input.episodeId))
          .get();
        if (
          episode &&
          (episode.ownerUserId !== p.userId ||
            episode.profileId !== p.profileId ||
            request.episodeId !== input.episodeId)
        )
          throw new DecisionError(
            'Review this owned cooking episode and its current restrictions before claiming equipment.',
            409,
          );
        if (request.episodeId && request.episodeId !== input.episodeId)
          throw new DecisionError('The reviewed plan belongs to another cooking episode.', 409);
        const intentKey = createHash('sha256')
          .update(
            JSON.stringify({
              kitchenId: kitchen.id,
              userId: p.userId,
              profileId: p.profileId,
              episodeId: input.episodeId,
              phaseId: input.phaseId,
              plan: accepted?.id ?? kitchenPlanRequestSchema.parse(request),
            }),
          )
          .digest('hex');
        const priorUse = tx
          .select()
          .from(kitchenPhysicalUses)
          .where(eq(kitchenPhysicalUses.intentKey, intentKey))
          .get();
        if (priorUse?.releasedAt)
          return {
            claims: readKitchenClaims(p),
            phaseState: 'released' as const,
            useId: priorUse.id,
            replayed: true,
          };
        if (priorUse) {
          const held = tx
            .select()
            .from(kitchenResourceClaims)
            .where(
              and(
                eq(kitchenResourceClaims.kitchenId, kitchen.id),
                eq(kitchenResourceClaims.useId, priorUse.id),
              ),
            )
            .all();
          if (
            !priorUse.allocation ||
            held.length !== priorUse.allocation.resourceIds.length ||
            held.some((claim) => !priorUse.allocation!.resourceIds.includes(claim.resourceId))
          )
            throw new DecisionError(
              'This physical-use receipt needs a refreshed recovery review. No resources were claimed or released.',
              409,
            );
          return {
            claims: readKitchenClaims(p),
            phaseState: 'active' as const,
            useId: priorUse.id,
            replayed: true,
          };
        }
        if (episode?.completedAt)
          throw new DecisionError(
            'Start a new cooking episode before tracking a new physical use.',
            409,
          );
        const plan = previewKitchenPlan(p, request);
        if (accepted && JSON.stringify(plan) !== JSON.stringify(accepted.allocation))
          throw new DecisionError(
            'The accepted allocation changed. Refresh and accept its review before starting.',
            409,
          );
        if (plan.status !== 'compatible')
          throw new DecisionError('Resolve the plan constraints before tracking this phase.', 409);
        const phase = plan.assignments.find((a) => a.phaseId === input.phaseId);
        if (!phase) throw new DecisionError('Choose a phase from the reviewed plan.');
        const active = tx
          .select()
          .from(kitchenResourceClaims)
          .where(eq(kitchenResourceClaims.kitchenId, kitchen.id))
          .all();
        const own = active.filter(
          (claim) => claim.episodeId === input.episodeId && claim.phaseId === input.phaseId,
        );
        if (own.length)
          throw new DecisionError(
            'This phase already holds a different reviewed use. Acknowledge its physical release before reallocating.',
            409,
          );
        for (const id of phase.resourceIds) {
          const others = active.filter(
            (claim) =>
              claim.resourceId === id &&
              !(
                claim.episodeId === input.episodeId &&
                claim.phaseId === input.phaseId &&
                claim.userId === p.userId
              ),
          );
          if (!others.length) continue;
          const item = kitchen.items.find((item) => equipmentResources(item).includes(id));
          if (
            !item ||
            others.some((claim) => !claim.allocation) ||
            cavityCoUse(item, id, [...others.map((claim) => claim.allocation!), phase]) !==
              'compatible'
          )
            throw new DecisionError(
              'Equipment is already marked in use, or combined cavity mode, temperature and fit are unresolved. Review the active phase before releasing it.',
              409,
            );
        }
        const useId = randomUUID();
        tx.insert(kitchenPhysicalUses)
          .values({
            id: useId,
            kitchenId: kitchen.id,
            episodeId: input.episodeId,
            phaseId: input.phaseId,
            userId: p.userId,
            startedAt: new Date(),
            allocation: phase,
            intentKey,
          })
          .run();
        for (const resourceId of phase.resourceIds)
          tx.insert(kitchenResourceClaims)
            .values({
              resourceId,
              useId,
              kitchenId: kitchen.id,
              episodeId: input.episodeId,
              phaseId: input.phaseId,
              userId: p.userId,
              startedAt: new Date(),
              allocation: phase,
            })
            .onConflictDoNothing()
            .run();
      }
      return {
        phaseState,
        claims: tx
          .select()
          .from(kitchenResourceClaims)
          .where(eq(kitchenResourceClaims.kitchenId, kitchen.id))
          .all(),
      };
    },
    { behavior: 'immediate' },
  );
}
