import 'server-only';
import { createHash } from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import { getDatabase } from '@/lib/db/client';
import { cookSessions, cookingSessionChanges, kitchenResourceClaims } from '@/lib/db/schema';
import { cookingSessionRecipeChangeSchema } from '@/lib/domain/cooking-session-recipe';
import { recipeInputSchema } from '@/lib/domain/recipe';
import { DecisionError } from '@/lib/providers/decisions-provider';
import { authorizeKitchen, readKitchenInventory } from './kitchen-inventory-service';
import type { RequestPrincipal } from './auth-service';
import { projectEffectiveRecipe } from './effective-recipe';
import { recipePayloadFromDetail, type RecipeDetail } from './recipe-service';

export function readCookingSessionRecipe(p: RequestPrincipal, sessionId: string) {
  if (p.kind !== 'session')
    throw new DecisionError('Use your signed-in account for cooking snapshots.', 403);
  authorizeKitchen(p, 'personal.read');
  const session = getDatabase()
    .select()
    .from(cookSessions)
    .where(
      and(
        eq(cookSessions.id, sessionId),
        eq(cookSessions.profileId, p.profileId),
        eq(cookSessions.ownerUserId, p.userId),
      ),
    )
    .get();
  if (!session || !session.effectiveRecipe)
    throw new DecisionError('This account has no saved cooking snapshot for that session.', 404);
  const latest = getDatabase()
    .select({ id: cookingSessionChanges.id })
    .from(cookingSessionChanges)
    .where(eq(cookingSessionChanges.sessionId, sessionId))
    .orderBy(desc(cookingSessionChanges.revision))
    .get();
  const first = getDatabase()
    .select()
    .from(cookingSessionChanges)
    .where(eq(cookingSessionChanges.sessionId, sessionId))
    .orderBy(asc(cookingSessionChanges.revision))
    .get();
  const ingredientReviewRequired = Boolean(
    first &&
    (JSON.stringify(recipePayloadFromDetail(first.before).ingredientGroups) !==
      JSON.stringify(recipePayloadFromDetail(session.effectiveRecipe).ingredientGroups) ||
      first.before.servings !== session.effectiveRecipe.servings),
  );
  return { ...session, latestChangeId: latest?.id ?? null, ingredientReviewRequired };
}

export function changeCookingSessionRecipe(p: RequestPrincipal, sessionId: string, raw: unknown) {
  authorizeKitchen(p, 'personal.update');
  const input = cookingSessionRecipeChangeSchema.parse(raw);
  const hash = createHash('sha256').update(JSON.stringify({ sessionId, input })).digest('hex');
  return getDatabase().transaction(
    (tx) => {
      const session = readCookingSessionRecipe(p, sessionId);
      const prior = tx
        .select()
        .from(cookingSessionChanges)
        .where(eq(cookingSessionChanges.id, input.operationId))
        .get();
      if (prior) {
        if (prior.userId !== p.userId || prior.sessionId !== sessionId || prior.intentHash !== hash)
          throw new DecisionError('That operation belongs to a different reviewed change.', 409);
        return { session, appliedRevision: prior.revision, replayed: true };
      }
      if (session.completedAt)
        throw new DecisionError('Completed cooking history cannot be adapted.', 409);
      if (
        session.effectiveRevision !== input.expectedRevision ||
        readKitchenInventory(p).revision !== input.expectedKitchenRevision
      )
        throw new DecisionError(
          'The session or kitchen changed. Keep your draft and refresh its review.',
          409,
        );
      if (
        tx
          .select()
          .from(kitchenResourceClaims)
          .where(eq(kitchenResourceClaims.episodeId, sessionId))
          .get()
      )
        throw new DecisionError(
          'Acknowledge the physical release of active equipment before changing this session.',
          409,
        );
      const before = session.effectiveRecipe!;
      let after: RecipeDetail;
      if (input.kind === 'undo') {
        const original = tx
          .select()
          .from(cookingSessionChanges)
          .where(eq(cookingSessionChanges.id, input.undoOperationId))
          .get();
        if (
          !original ||
          original.userId !== p.userId ||
          original.sessionId !== sessionId ||
          original.revision !== session.effectiveRevision
        )
          throw new DecisionError(
            'Only the latest reviewed session change can be undone. Refresh the review.',
            409,
          );
        after = original.before;
      } else {
        const baseline = recipePayloadFromDetail(before);
        const changed = recipeInputSchema.parse({ ...baseline, ...input.change });
        after = projectEffectiveRecipe(
          before,
          baseline,
          changed,
          `${sessionId}-r${session.effectiveRevision + 1}`,
        );
        // Method-only changes preserve the original ingredient IDs and their Pantry mappings.
        if (!input.change.ingredientGroups) after.ingredientGroups = before.ingredientGroups;
        else {
          const originals = before.ingredientGroups.flatMap((group) => group.ingredients);
          after.ingredientGroups = after.ingredientGroups.map((group) => ({
            ...group,
            ingredients: group.ingredients.map((item) => {
              const matches = originals.filter(
                (original) => original.item === item.item && original.unit === item.unit,
              );
              return matches.length === 1 ? { ...item, id: matches[0]!.id } : item;
            }),
          }));
        }
        after.equipmentRequirements = changed.equipmentRequirements ?? [];
        if (
          after.equipmentRequirements.some((req) =>
            req.steps.some((ref) => !after.instructionSections[ref.section]?.steps[ref.step]),
          )
        )
          throw new DecisionError(
            'An equipment requirement refers to an instruction that does not exist.',
          );
      }
      const revision = session.effectiveRevision + 1;
      tx.update(cookSessions)
        .set({ effectiveRecipe: after, effectiveRevision: revision })
        .where(eq(cookSessions.id, sessionId))
        .run();
      tx.insert(cookingSessionChanges)
        .values({
          id: input.operationId,
          sessionId,
          userId: p.userId,
          intentHash: hash,
          revision,
          before,
          after,
          createdAt: new Date(),
        })
        .run();
      return {
        session: readCookingSessionRecipe(p, sessionId),
        appliedRevision: revision,
        replayed: false,
      };
    },
    { behavior: 'immediate' },
  );
}
