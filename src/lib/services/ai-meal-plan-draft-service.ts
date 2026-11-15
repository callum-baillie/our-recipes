import 'server-only';
import { z } from 'zod';
import {
  aiMealPlanCandidateSchema,
  aiMealPlanGenerationRequestSchema,
} from '@/lib/domain/ai-assistant';
import { createAiActionProposal, getAiActionProposal } from './ai-action-service';
import { generateAiMealPlanProposal, AiMealPlanValidationError } from './ai-meal-plan-service';
import type { RequestPrincipal } from './auth-service';
import { and, eq, inArray } from 'drizzle-orm';
import { aiActionProposals } from '@/lib/db/schema';
import { getDatabase } from '@/lib/db/client';

const revisionSchema = z
  .object({
    actionId: z.string().uuid(),
    plannedFor: z.iso.date(),
    meal: z.string().min(1),
    instructions: z.string().trim().max(1500),
  })
  .strict();
export async function reviseMealPlanDraft(input: {
  args: unknown;
  profileId: string;
  threadId: string;
  principal?: RequestPrincipal;
}) {
  const target = revisionSchema.parse(input.args);
  const { row, action } = getAiActionProposal(target.actionId, input.profileId);
  if (
    row.threadId !== input.threadId ||
    row.kind !== 'meal_plan_generate' ||
    row.status !== 'pending' ||
    row.expiresAt.getTime() <= Date.now()
  )
    throw new AiMealPlanValidationError('Choose a current pending draft in this conversation.');
  const preview = action.preview as Record<string, unknown>;
  const request = aiMealPlanGenerationRequestSchema.parse(preview.request);
  const candidate = aiMealPlanCandidateSchema.parse(preview.candidate);
  const selected = candidate.entries.find(
    (e) => e.plannedFor === target.plannedFor && e.meal === target.meal,
  );
  if (!selected) throw new AiMealPlanValidationError('That meal is not in this draft.');
  const key = selected.entryKey ?? `${selected.plannedFor}:${selected.meal}`;
  if (
    candidate.leftoverLinks.some((l) => l.sourceEntryKey === key || l.destinationEntryKey === key)
  )
    throw new AiMealPlanValidationError(
      'This meal is linked to leftovers. Review the linked meals together before replacing it.',
    );
  const replacement = await generateAiMealPlanProposal({
    excludedRecipeIds: selected.existingRecipeId ? [selected.existingRecipeId] : [],
    actorProfileId: input.profileId,
    principal: input.principal,
    threadId: input.threadId,
    request: {
      ...request,
      mode: 'ai',
      startDate: target.plannedFor,
      endDate: target.plannedFor,
      mealSlots: [selected.meal],
      fixedMeals: [],
      options: { ...request.options, planLeftovers: false },
      instructions:
        `${request.instructions}\nReplace ${selected.title}; do not choose it again. ${target.instructions}`.slice(
          -2000,
        ),
    },
  });
  try {
    const next = replacement.candidate.entries[0];
    if (replacement.candidate.entries.length !== 1 || !next)
      throw new AiMealPlanValidationError('Replacement must contain exactly one meal.');
    const prefix = `revision-${replacement.proposal.id}-`;
    const recipes = replacement.candidate.newRecipes.map((r) => ({
      ...r,
      key: `${prefix}${r.key}`.slice(0, 80),
    }));
    const newKey = next.newRecipeKey
      ? recipes[replacement.candidate.newRecipes.findIndex((r) => r.key === next.newRecipeKey)]?.key
      : null;
    const merged = aiMealPlanCandidateSchema.parse({
      ...candidate,
      entries: candidate.entries.map((e) =>
        e === selected
          ? { ...next, servings: selected.servings, entryKey: key, newRecipeKey: newKey }
          : e,
      ),
      newRecipes: [
        ...candidate.newRecipes.filter((r) =>
          candidate.entries.some((e) => e !== selected && e.newRecipeKey === r.key),
        ),
        ...recipes,
      ],
    });
    const used = new Set(merged.entries.map((e) => e.newRecipeKey));
    merged.newRecipes = merged.newRecipes.filter((r) => used.has(r.key));
    return getDatabase().transaction(() => {
      const current = getAiActionProposal(target.actionId, input.profileId).row;
      if (current.status !== 'pending')
        throw new AiMealPlanValidationError('The original draft changed during replacement.');
      const proposal = createAiActionProposal({
        threadId: input.threadId,
        profileId: input.profileId,
        kind: 'meal_plan_generate',
        payload: { ...JSON.parse(row.payload), candidate: merged },
        preview: { ...preview, candidate: merged, supersedesActionId: row.id },
      });
      // Both old previews are superseded atomically; saved meals and recipes are untouched.
      getDatabase()
        .update(aiActionProposals)
        .set({ status: 'cancelled', decidedAt: new Date() })
        .where(
          and(
            inArray(aiActionProposals.id, [row.id, replacement.proposal.id]),
            eq(aiActionProposals.status, 'pending'),
          ),
        )
        .run();
      return proposal;
    });
  } finally {
    getDatabase()
      .update(aiActionProposals)
      .set({ status: 'cancelled', decidedAt: new Date() })
      .where(
        and(
          eq(aiActionProposals.id, replacement.proposal.id),
          eq(aiActionProposals.status, 'pending'),
        ),
      )
      .run();
  }
}
