import 'server-only';
import { z } from 'zod';
import { getDatabase } from '@/lib/db/client';
import type { DecisionCard, DecisionJob, DecisionRequest } from '@/lib/domain/decision-assistance';
import { DECISION_TASKS, decisionFeedbackSchema } from '@/lib/domain/decision-assistance';
import { AI_GROUNDING_INSTRUCTIONS } from '@/lib/domain/ai-grounding';
import { DecisionError, requestDecisions } from '@/lib/providers/decisions-provider';
import type { RequestPrincipal } from '@/lib/services/auth-service';
import { aiSafetyIdentifier } from '@/lib/services/ai-context-service';
import { getAiDataPolicy, getAiWorkloadSetting } from '@/lib/services/ai-settings-service';
import { buildDecisionJobs } from '@/lib/services/decision-jobs-service';
import {
  decisionHash,
  findDecision,
  storeDecision,
  ownedDecision,
  saveDecisionCorrection,
  enforceDecisionBudget,
  singleDecisionRun,
} from '@/lib/services/decision-cache-service';
import { getShoppingList, updateShoppingListItem } from '@/lib/services/planning-service';
import { setRecipeIngredientPantryMapping } from '@/lib/services/pantry-availability-service';
import { reconcileAutomaticRestockPolicies } from '@/lib/services/pantry-grocery-cooking-service';
import { recalculateRecipeNutritionAfterRecipeEdit } from '@/lib/services/nutrition-recipe-calculation-service';

type Result = {
  job: DecisionJob;
  request: DecisionRequest;
  choice: string;
  confidence: number | null;
  reason: string;
};
const correctionSchema = z.object({
  choice: z.string(),
  status: z.enum(['corrected', 'dismissed']),
  note: z.string(),
});
const hashJob = (p: RequestPrincipal, job: DecisionJob) =>
  decisionHash({ revision: 1, model: 'gpt-6-luna', policy: getAiDataPolicy(p.profileId), job });
function toCard(
  row: ReturnType<typeof ownedDecision>,
  job: DecisionJob,
  hash: string,
  cached: boolean,
): DecisionCard {
  const result = JSON.parse(row.resultJson) as Result;
  const correction = row.correctionJson
    ? correctionSchema.parse(JSON.parse(row.correctionJson))
    : null;
  const choice = correction?.choice ?? result.choice;
  const valid = job.options.some((option) => option.value === choice);
  return {
    ...job,
    id: row.id,
    version: row.version,
    choice: valid ? choice : 'unknown',
    confidence: correction ? null : result.confidence,
    status: correction?.status ?? (choice === 'unknown' || !valid ? 'unknown' : 'suggested'),
    reason: !valid
      ? 'Your saved choice is no longer available. Review it before continuing.'
      : correction
        ? correction.note || 'Your saved decision takes precedence over AI.'
        : result.reason,
    cached,
    createdAt: row.createdAt.toISOString(),
    evidenceChanged: row.contextHash !== hash,
    evidenceHash: hash,
  };
}
export async function runDecisionAssistance(p: RequestPrincipal, input: DecisionRequest) {
  return singleDecisionRun(`assist:${p.userId}:${p.profileId}:${decisionHash(input)}`, async () => {
    const setting = getAiWorkloadSetting(p.profileId, 'chat');
    if (!setting.enabled)
      throw new DecisionError('AI assistance is disabled in household AI settings.', 403);
    const { jobs, notice, nextOffset } = await buildDecisionJobs(p, input);
    const cards: DecisionCard[] = [];
    const missing: { job: DecisionJob; hash: string }[] = [];
    for (const job of jobs) {
      const hash = hashJob(p, job);
      const cached = findDecision(p, job.task, job.subjectKey, hash);
      if (cached) cards.push(toCard(cached, job, hash, true));
      else missing.push({ job, hash });
    }
    if (missing.length && !input.allowPaidCall)
      return {
        cards,
        notice: `${notice} ${missing.length} candidates need a new paid request; existing results are shown below.`,
        paidRequests: 0,
        nextOffset,
      };
    if (missing.length) {
      enforceDecisionBudget(p);
      // Model-generated confidence is displayed, never used as authorization to mutate data.
      const answers = await requestDecisions({
        allowPaidCall: input.allowPaidCall,
        safetyIdentifier: aiSafetyIdentifier(p.profileId),
        evidence: missing.map(({ job }, index) => ({
          name: `item_${index}`,
          title: job.title,
          evidence: job.evidence,
        })),
        questions: missing.map(({ job }, index) => ({
          name: `item_${index}`,
          instructions: `${AI_GROUNDING_INSTRUCTIONS} Evaluate only evidence for item_${index}. ${job.instructions} Return unknown when evidence is insufficient.`,
          choices: job.options.map((o) => ({
            value: o.value,
            description: `${o.label}: ${o.description}`,
          })),
        })),
      });
      answers.forEach((answer, index) => {
        const { job, hash } = missing[index]!;
        const valid =
          answer.type === 'choice' &&
          answer.name === `item_${index}` &&
          job.options.some((o) => o.value === answer.choice);
        const choice = valid && answer.type === 'choice' ? answer.choice : 'unknown';
        const result: Result = {
          job,
          request: input,
          choice,
          confidence: valid && answer.type === 'choice' ? answer.confidence : null,
          reason:
            answer.type === 'refusal'
              ? 'The provider declined to decide. Review the recorded evidence.'
              : choice === 'unknown'
                ? 'The available evidence does not establish an answer.'
                : 'Suggested from the recorded evidence below. Review before applying; the evidence is not a generated explanation.',
        };
        const row = storeDecision(p, {
          task: job.task,
          subject: job.subjectKey,
          hash,
          evidence: job.evidence,
          result,
          ttlMs: choice === 'unknown' ? 3_600_000 : 86_400_000,
        });
        cards.push(toCard(row, job, hash, false));
      });
    }
    const order = ['strong', 'high', 'possible', 'normal', 'unknown', 'poor', 'low'];
    cards.sort(
      (a, b) =>
        (order.indexOf(a.choice) < 0 ? 3 : order.indexOf(a.choice)) -
        (order.indexOf(b.choice) < 0 ? 3 : order.indexOf(b.choice)),
    );
    return { cards, notice, nextOffset, paidRequests: missing.length ? 1 : 0 };
  });
}
export async function decisionFeedback(
  p: RequestPrincipal,
  input: z.infer<typeof decisionFeedbackSchema>,
) {
  const row = ownedDecision(p, input.id);
  if (!(row.task in DECISION_TASKS))
    throw new DecisionError('Use the original review to handle this proposal.');
  const result = JSON.parse(row.resultJson) as Result;
  const choice = input.choice ?? result.choice;
  if (!result.job.options.some((o) => o.value === choice))
    throw new DecisionError('Choose one of the supplied outcomes.');
  if (input.action === 'apply') {
    // Applied rows disappear from the candidate set. Search by subject, not the old page offset.
    let page = await buildDecisionJobs(p, { ...result.request, offset: 0 });
    let current = page.jobs.find((job) => job.subjectKey === row.subjectKey);
    while (!current && page.nextOffset !== null) {
      page = await buildDecisionJobs(p, { ...result.request, offset: page.nextOffset });
      current = page.jobs.find((job) => job.subjectKey === row.subjectKey);
    }
    if (!current || hashJob(p, current) !== input.evidenceHash)
      throw new DecisionError(
        'The source information or sharing settings changed. Refresh suggestions before applying.',
        409,
      );
    if (!current.options.some((option) => option.value === choice))
      throw new DecisionError('This option is no longer available.', 409);
    if (!current.apply || choice === 'unknown' || choice === 'no_match')
      throw new DecisionError('This suggestion needs manual review. Open its source to continue.');
    getDatabase().transaction(() => {
      if (current.apply?.kind === 'aisle') {
        const target = current.apply;
        const list = getShoppingList(target.listId);
        const item = list?.items.find((i) => i.id === target.itemId);
        if (!item) throw new DecisionError('Shopping item no longer exists.', 409);
        updateShoppingListItem(
          list!.id,
          item.id,
          {
            item: item.item,
            quantity: item.quantity ?? '',
            unit: item.unit,
            note: item.note,
            checked: item.checked,
            shoppingState: item.shoppingState,
            aisleId: choice,
          },
          p.profileId,
        );
      } else if (current.apply?.kind === 'ingredient') {
        setRecipeIngredientPantryMapping(
          current.apply.ingredientId,
          { productId: choice, compatibleVariant: true, isOptional: false },
          p.profileId,
        );
        recalculateRecipeNutritionAfterRecipeEdit(current.apply.recipeId);
      }
      saveDecisionCorrection(p, row.id, input.version, input.action, {
        choice,
        status: 'corrected',
        note: input.note || 'Reviewed and applied by you.',
      });
    });
    reconcileAutomaticRestockPolicies(p.profileId);
  } else
    saveDecisionCorrection(p, row.id, input.version, input.action, {
      choice,
      status: input.action === 'dismiss' ? 'dismissed' : 'corrected',
      note: input.note,
    });
  return { saved: true, version: input.version + 1, applied: input.action === 'apply' };
}
