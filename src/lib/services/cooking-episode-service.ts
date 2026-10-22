import 'server-only';
import { createHash } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { getDatabase } from '@/lib/db/client';
import { cookSessions, cookingEpisodeOperations, kitchenAcceptedPlans } from '@/lib/db/schema';
import { cookingEpisodeCommandSchema, restrictionsApply } from '@/lib/domain/cooking-episode';
import { DecisionError } from '@/lib/providers/decisions-provider';
import type { RequestPrincipal } from './auth-service';
import { readCookingSessionRecipe } from './cooking-session-recipe-service';
import {
  authorizeKitchen,
  previewKitchenPlan,
  readKitchenInventory,
} from './kitchen-inventory-service';
export function readCookingEpisode(p: RequestPrincipal, sessionId: string) {
  const session = readCookingSessionRecipe(p, sessionId);
  const accepted = getDatabase()
    .select()
    .from(kitchenAcceptedPlans)
    .where(eq(kitchenAcceptedPlans.sessionId, sessionId))
    .orderBy(desc(kitchenAcceptedPlans.createdAt), desc(kitchenAcceptedPlans.id))
    .get();
  let acceptedPlanState: 'none' | 'compatible' | 'needs-review' = 'none';
  if (accepted) {
    try {
      acceptedPlanState =
        JSON.stringify(previewKitchenPlan(p, accepted.request)) ===
        JSON.stringify(accepted.allocation)
          ? 'compatible'
          : 'needs-review';
    } catch (error) {
      if (!(error instanceof DecisionError)) throw error;
      acceptedPlanState = 'needs-review';
    }
  }
  return {
    sessionId,
    acceptedPlanState,
    contextRevision: session.contextRevision,
    sessionRevision: session.effectiveRevision,
    restrictions: session.cookingRestrictions,
    restrictionsActive: restrictionsApply(session.cookingRestrictions),
    acceptedPlan: accepted ?? null,
  };
}
export function changeCookingEpisode(p: RequestPrincipal, sessionId: string, raw: unknown) {
  authorizeKitchen(p, 'personal.update');
  const input = cookingEpisodeCommandSchema.parse(raw);
  const hash = createHash('sha256').update(JSON.stringify({ sessionId, input })).digest('hex');
  return getDatabase().transaction(
    (tx) => {
      const session = readCookingSessionRecipe(p, sessionId);
      const prior = tx
        .select()
        .from(cookingEpisodeOperations)
        .where(eq(cookingEpisodeOperations.id, input.operationId))
        .get();
      if (prior) {
        if (
          prior.userId !== p.userId ||
          prior.profileId !== p.profileId ||
          prior.sessionId !== sessionId ||
          prior.intentHash !== hash
        )
          throw new DecisionError(
            'This operation belongs to another cooking episode or reviewed intent.',
            409,
          );
        return { ...readCookingEpisode(p, sessionId), replayed: true };
      }
      if (session.completedAt || session.contextRevision !== input.expectedContextRevision)
        throw new DecisionError(
          'The cooking episode changed. Keep your draft and refresh the review.',
          409,
        );
      if (input.kind === 'restrictions') {
        const inventory = readKitchenInventory(p);
        if (
          input.restrictions?.excludedEquipmentIds.some(
            (id) =>
              !inventory.items.some((item) => item.id === id && item.availability !== 'archived'),
          )
        )
          throw new DecisionError('Choose equipment currently recorded in this kitchen.');
        tx.update(cookSessions)
          .set({
            cookingRestrictions: input.restrictions,
            contextRevision: session.contextRevision + 1,
          })
          .where(eq(cookSessions.id, sessionId))
          .run();
      } else {
        if (
          input.plan.episodeId !== sessionId ||
          input.plan.episodeContextRevision !== session.contextRevision
        )
          throw new DecisionError(
            'Review this plan against the cooking episode and its dated restrictions.',
            409,
          );
        // A phase using this session recipe must bind the effective session revision, not the library.
        if (
          input.plan.phases.some(
            (phase) =>
              phase.recipeId === session.recipeId &&
              (phase.cookSessionId !== sessionId ||
                phase.cookSessionRevision !== session.effectiveRevision),
          )
        )
          throw new DecisionError('Rebind the recipe phases to the current cooking snapshot.', 409);
        const allocation = previewKitchenPlan(p, input.plan);
        if (allocation.status !== 'compatible')
          throw new DecisionError(
            'Resolve the plan constraints before accepting this allocation.',
            409,
          );
        tx.insert(cookingEpisodeOperations)
          .values({
            id: input.operationId,
            sessionId,
            userId: p.userId,
            profileId: p.profileId,
            intentHash: hash,
            createdAt: new Date(),
          })
          .run();
        const latest = tx
          .select()
          .from(kitchenAcceptedPlans)
          .where(eq(kitchenAcceptedPlans.sessionId, sessionId))
          .orderBy(desc(kitchenAcceptedPlans.createdAt))
          .get();
        const acceptedAt = new Date(Math.max(Date.now(), (latest?.createdAt.getTime() ?? 0) + 1));
        tx.insert(kitchenAcceptedPlans)
          .values({
            id: input.operationId,
            sessionId,
            userId: p.userId,
            request: input.plan,
            allocation,
            createdAt: acceptedAt,
          })
          .run();
        return { ...readCookingEpisode(p, sessionId), replayed: false };
      }
      tx.insert(cookingEpisodeOperations)
        .values({
          id: input.operationId,
          sessionId,
          userId: p.userId,
          profileId: p.profileId,
          intentHash: hash,
          createdAt: new Date(),
        })
        .run();
      return { ...readCookingEpisode(p, sessionId), replayed: false };
    },
    { behavior: 'immediate' },
  );
}
