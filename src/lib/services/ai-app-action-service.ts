import { readCookingEpisode } from './cooking-episode-service';
import { readCookingSessionRecipe } from './cooking-session-recipe-service';
import { recipePayloadFromDetail } from './recipe-service';
import { buildAiEquipmentContext } from './ai-equipment-context-service';
import {
  aiDependencySchema as dependencySchema,
  aiProducedIds as producedIds,
  aiDependencyTargets as expectedTarget,
} from '@/lib/domain/ai-app-dependencies';
import 'server-only';
import { recipeImageInput } from '@/lib/domain/recipe-image-generation';
import { and, eq, desc } from 'drizzle-orm';
import { getDatabase } from '@/lib/db/client';
import { nutritionProfiles, aiDecisionRecords, aiChatThreads } from '@/lib/db/schema';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { APP_OPERATIONS, APP_ROUTE_LOADERS, type AppOperation } from './ai-app-operation-catalog';
import { getAuthenticatedSessionPrincipal, type RequestPrincipal } from './auth-service';
import { canAccountUseAi } from './ai-access-service';
import { getAiDataPolicy } from './ai-settings-service';
import {
  decisionHash,
  ownedDecision,
  saveDecisionCorrection,
  storeDecision,
  enforceDecisionBudget,
} from './decision-cache-service';
import { DecisionError } from '@/lib/providers/decisions-provider';
import { readAiKitchenContext } from './ai-kitchen-context-service';
import { getRecipe } from './recipe-service';
import { enqueueRecipeImageJob, getAiJob } from './ai-job-service';
import { getAiReadiness } from './ai-readiness-service';
import { getAiWorkloadSetting } from './ai-settings-service';
import { appRoleCan } from '@/lib/domain/permissions';
import { productConsumptionRequestSchema } from '@/lib/domain/nutrition-food-diary';
import {
  getFoodNutritionRecord,
  selectPreferredFoodNutritionRecord,
} from './nutrition-foundation-service';
import { getNutritionIntakeRevisionForUpdate } from './nutrition-intake-service';
import { resolveNutritionHouseholdContext } from './nutrition-household-profile-service';

const actionSchema = z
  .object({
    operationId: z.string().max(100),
    parametersJson: z.string().max(4000),
    bodyJson: z.string().max(60000),
    bindings: z.array(dependencySchema).max(4).default([]),
  })
  .strict();
export const appActionRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    actions: z.array(actionSchema).min(1).max(20),
  })
  .strict();
type Action = z.infer<typeof actionSchema>;
export type AppActionReview = {
  id: string;
  version: number;
  title: string;
  actions: {
    summary: string;
    method: string;
    path: string;
    parameters: Record<string, string>;
    body: unknown;
    bindings?: z.infer<typeof dependencySchema>[];
    recordLabel?: string;
    changeLabel?: string;
  }[];
  status: string;
  results?: {
    summary: string;
    ok: boolean;
    message: string;
    state?: 'completed' | 'failed' | 'pending' | 'not-attempted' | 'outcome-unknown';
    href?: string;
  }[];
  jobId?: string;
};
function operation(p: RequestPrincipal, id: string) {
  const op = APP_OPERATIONS.find((candidate) => candidate.id === id);
  if (!op) throw new DecisionError('This app operation is not available to chat.');
  const policy = getAiDataPolicy(p.profileId);
  if (id === 'readMyKitchenContext' || id === 'updateMyKitchenContext') {
    if (p.profileId !== p.linkedProfileId || !policy.shareDietaryPreferences)
      throw new DecisionError(
        'Use your own profile and enable dietary preference sharing before using kitchen memory in chat.',
        403,
      );
    return op;
  }
  const requirements = new Set<keyof ReturnType<typeof getAiDataPolicy>>();
  if (id === 'readCookingPreferences' || id === 'updateCookingPreferences') {
    if (p.profileId !== p.linkedProfileId || !policy.shareRecipePreferences)
      throw new DecisionError(
        'Use your own account and enable recipe preference sharing to use personal cooking preferences in chat.',
        403,
      );
  }

  if (op.path.startsWith('/kitchen') && op.path !== '/kitchen/catalog') {
    if (p.profileId !== p.linkedProfileId)
      throw new DecisionError('Use your own account for equipment sharing.', 403);
    requirements.add('shareKitchenEquipment');
  }
  if (/^\/(recipes|collections|tags)(?:\/|$)/u.test(op.path))
    requirements.add('shareSharedRecipes');
  if (op.path.startsWith('/meal-plan')) {
    requirements.add('shareMealPlans');
    requirements.add('shareSharedRecipes');
  }
  if (op.path.startsWith('/pantry')) requirements.add('sharePantry');
  if (
    (op.path.endsWith('/recipe') || op.path.endsWith('/context')) &&
    op.path.startsWith('/cook-sessions')
  ) {
    if (p.profileId !== p.linkedProfileId)
      throw new DecisionError('Use your own account for cooking adaptations.', 403);
    requirements.add('shareKitchenEquipment');
  }
  if (op.path.startsWith('/cook-sessions')) {
    requirements.add('shareSharedRecipes');
    requirements.add('sharePantry');
  }
  if (op.path.startsWith('/shopping-lists') || op.path.startsWith('/supermarket-profiles'))
    requirements.add('shareShoppingLists');
  if (id === 'importReviewedCatalogFood') requirements.add('sharePantry');
  if (/pantry-intake|pantry-controls|pantry-match|catalog-items|pantry-shortages/u.test(op.path))
    requirements.add('sharePantry');
  if (op.path.includes('/pantry/mappings')) requirements.add('shareSharedRecipes');
  for (const requirement of requirements)
    if (!policy[requirement])
      throw new DecisionError(
        `This operation needs ${requirement
          .replace(/^share/, '')
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .toLowerCase()} sharing. Other private categories can remain off.`,
        403,
      );
  if (
    !appRoleCan(
      p.accountRole,
      op.path.startsWith('/nutrition')
        ? op.effect === 'read'
          ? 'personal.read'
          : 'personal.update'
        : op.effect === 'read'
          ? 'shared.read'
          : 'shared.update',
    ) ||
    !appRoleCan(
      p.role,
      op.path.startsWith('/nutrition')
        ? op.effect === 'read'
          ? 'personal.read'
          : 'personal.update'
        : op.effect === 'read'
          ? 'shared.read'
          : 'shared.update',
    )
  )
    throw new DecisionError('This account cannot perform this operation.', 403);
  return op;
}
function parseAction(p: RequestPrincipal, action: Action) {
  const op = operation(p, action.operationId);
  const parameters = z
    .record(z.string().max(80), z.string().max(500))
    .parse(JSON.parse(action.parametersJson));
  const body: unknown = action.bodyJson.trim() ? JSON.parse(action.bodyJson) : undefined;
  if (
    op.id === 'createOrGenerateShoppingList' &&
    body &&
    typeof body === 'object' &&
    ('weekStart' in body || ('kind' in body && body.kind === 'planner'))
  ) {
    const policy = getAiDataPolicy(p.profileId);
    if (!policy.shareMealPlans || !policy.sharePantry || !policy.shareSharedRecipes)
      throw new DecisionError(
        'Generating a list from meals requires meal-plan, pantry and recipe sharing.',
        403,
      );
  }
  if (op.path.startsWith('/nutrition')) {
    const target = getDatabase()
      .select({ householdProfileId: nutritionProfiles.linkedHouseholdProfileId })
      .from(nutritionProfiles)
      .where(eq(nutritionProfiles.id, parameters.profileId))
      .get();
    if (!target?.householdProfileId || !getAiDataPolicy(target.householdProfileId).shareRawDiary)
      throw new DecisionError(
        'The receiving person must permit raw diary sharing for this nutrition operation. Use the protected Nutrition workspace to continue without sharing it with AI.',
        403,
      );
  }
  if (op.validator) op.validator.parse(body);
  for (const match of op.path.matchAll(/\{([^}]+)\}/g)) {
    if (!parameters[match[1]] || /[\/\\\u0000-\u001f]/u.test(parameters[match[1]]))
      throw new DecisionError(`Supply a valid ${match[1]}.`);
  }
  return { op, parameters, body };
}
export function listAppActions(p: RequestPrincipal, resource: string, operationId?: string) {
  const candidates = APP_OPERATIONS.filter(
    (op) =>
      (!resource || op.path.split('/')[1] === resource) && (!operationId || op.id === operationId),
  );
  return candidates.flatMap((candidate) => {
    let op: AppOperation;
    try {
      op = operation(p, candidate.id);
    } catch (error) {
      if (!operationId && error instanceof DecisionError && error.status === 403) return [];
      throw error;
    }
    let schema = op.body;
    try {
      if (op.validator) schema = z.toJSONSchema(op.validator, { io: 'input' });
    } catch {
      /* The route still validates the submitted input. */
    }
    return [
      {
        operationId: op.id,
        summary: op.summary,
        method: op.method,
        effect: op.effect,
        requiresReview: op.effect !== 'read',
        producedId: producedIds[op.id] ?? null,
        parameters: op.parameters,
        ...(operationId ? { bodySchema: schema } : {}),
      },
    ];
  });
}
async function invoke(
  request: Request,
  op: AppOperation,
  parameters: Record<string, string>,
  body: unknown,
  commandKey?: string,
) {
  const path = op.path.replace(/\{([^}]+)\}/g, (_, key: string) =>
    encodeURIComponent(parameters[key]),
  );
  const url = new URL(`/api/v1${path}`, request.url);
  for (const [key, value] of Object.entries(parameters))
    if (!op.path.includes(`{${key}}`)) url.searchParams.set(key, value);
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (commandKey) headers.set('Idempotency-Key', commandKey);
  for (const key of ['cookie', 'origin']) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  const forwarded = new Request(url, {
    method: op.method,
    headers,
    ...(body !== undefined && op.method !== 'GET' ? { body: JSON.stringify(body) } : {}),
  });
  const routeModule = await APP_ROUTE_LOADERS[op.id as keyof typeof APP_ROUTE_LOADERS]();
  const handler = (
    routeModule as unknown as Record<
      string,
      (r: Request, c: { params: Promise<Record<string, string>> }) => Promise<Response>
    >
  )[op.method];
  return handler(forwarded, { params: Promise.resolve(parameters) });
}
export async function readAppData(p: RequestPrincipal, request: Request, input: unknown) {
  p = await currentActor(p, request);
  const action = actionSchema.parse(input);
  const parsed = parseAction(p, action);
  if (parsed.op.effect !== 'read' || action.bindings.length)
    throw new DecisionError('Use a reviewed proposal for this operation.');
  if (parsed.op.id === 'readCookingEpisode') {
    const episode = readCookingEpisode(p, parsed.parameters.sessionId);
    return {
      ...episode,
      acceptedPlan: episode.acceptedPlan
        ? {
            id: episode.acceptedPlan.id,
            request: episode.acceptedPlan.request,
            allocation: episode.acceptedPlan.allocation,
          }
        : null,
    };
  }
  if (parsed.op.id === 'readCookingSessionRecipe') {
    const session = readCookingSessionRecipe(p, parsed.parameters.sessionId);
    return {
      session: {
        id: session.id,
        recipeId: session.recipeId,
        effectiveRevision: session.effectiveRevision,
        latestChangeId: session.latestChangeId,
        ingredientReviewRequired: session.ingredientReviewRequired,
        recipe: recipePayloadFromDetail(session.effectiveRecipe!),
      },
    };
  }
  if (parsed.op.id === 'readKitchenInventory') return buildAiEquipmentContext(p);
  if (parsed.op.id === 'listShoppingLists' || parsed.op.id === 'getShoppingList')
    return readAiKitchenContext(p, {
      resource: 'shopping_lists',
      recordId: parsed.parameters.listId ?? null,
      query: parsed.parameters.q ?? '',
      offset: Number(parsed.parameters.offset ?? 0),
      limit: Number(parsed.parameters.limit ?? 50),
    });
  const response = await invoke(request, parsed.op, parsed.parameters, parsed.body);
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new DecisionError('Open this export in the app.');
  const value = await response.text();
  if (!response.ok)
    throw new DecisionError(
      'The app could not read that resource. Check its ID and permissions.',
      response.status,
    );
  if (value.length > 60000)
    return { message: 'The result is too large. Narrow the query or pagination.' };
  return JSON.parse(value) as unknown;
}
type Snapshot = { operationId: string; parameters: Record<string, string>; hash: string };
async function snapshot(
  request: Request,
  op: AppOperation,
  parameters: Record<string, string>,
): Promise<Snapshot | null> {
  // Creating a record has no existing record version to approve. In particular,
  // GET /meal-plan requires an explicit range; it is not a version of POST's new meal.
  if (op.method === 'POST' && !op.path.includes('{')) return null;
  const reader = APP_OPERATIONS.filter(
    (candidate) =>
      candidate.effect === 'read' &&
      candidate.method === 'GET' &&
      (op.path === candidate.path || op.path.startsWith(`${candidate.path}/`)) &&
      [...candidate.path.matchAll(/\{([^}]+)\}/g)].every((m) => parameters[m[1]]),
  ).sort((a, b) => b.path.length - a.path.length)[0];
  if (!reader) return null;
  const response = await invoke(request, reader, parameters, undefined);
  if (!response.ok)
    throw new DecisionError(
      'The current record could not be read. Refresh its details before preparing changes.',
    );
  const body: unknown = await response.json();
  return { operationId: reader.id, parameters, hash: decisionHash(body) };
}
export function listPendingAppActions(p: RequestPrincipal, threadId: string): AppActionReview[] {
  z.string().uuid().parse(threadId);
  return getDatabase()
    .select()
    .from(aiDecisionRecords)
    .where(
      and(
        eq(aiDecisionRecords.ownerUserId, p.userId),
        eq(aiDecisionRecords.profileId, p.profileId),
        eq(aiDecisionRecords.task, 'app_actions'),
      ),
    )
    .orderBy(desc(aiDecisionRecords.createdAt))
    .limit(100)
    .all()
    .filter((row) => JSON.parse(row.resultJson).threadId === threadId)
    .map((row) => {
      const correction = row.correctionJson ? JSON.parse(row.correctionJson) : null;
      const job = correction?.jobId ? getAiJob(correction.jobId, p.profileId) : null;
      return {
        id: row.id,
        version: row.version,
        title: JSON.parse(row.resultJson).title,
        actions: JSON.parse(row.evidenceJson),
        results: job
          ? job.items.map((item) => ({
              summary: item.label,
              ok: item.status === 'succeeded',
              state:
                item.status === 'succeeded'
                  ? ('completed' as const)
                  : item.status === 'failed'
                    ? ('failed' as const)
                    : item.status === 'cancelled'
                      ? ('not-attempted' as const)
                      : ('pending' as const),
              message:
                item.status === 'succeeded'
                  ? 'Image saved.'
                  : item.status === 'failed'
                    ? `Image failed (${item.errorCode ?? 'unknown error'}).`
                    : item.status === 'cancelled'
                      ? 'Not attempted. The task was cancelled.'
                      : 'Waiting for generation.',
            }))
          : correction?.activeState === 'outcome-unknown'
            ? [
                ...(correction.results ?? []),
                {
                  summary:
                    JSON.parse(row.evidenceJson)[correction.activeStep]?.summary ??
                    'Interrupted change',
                  ok: false,
                  state: 'outcome-unknown' as const,
                  message:
                    'This change started but its outcome has not been acknowledged. Inspect the affected records; do not submit it again as a new change.',
                },
              ]
            : correction?.results,
        jobId: correction?.jobId,
        status: job
          ? job.status === 'completed'
            ? 'applied'
            : job.status === 'failed' || job.status === 'cancelled'
              ? 'partial'
              : 'queued'
          : row.correctionJson
            ? JSON.parse(row.correctionJson).status
            : row.expiresAt.getTime() < Date.now()
              ? 'expired'
              : 'pending',
      };
    });
}
function bindAction(actions: Action[], index: number, outputs?: unknown[]): Action {
  const action = actions[index];
  const parameters = JSON.parse(action.parametersJson) as Record<string, unknown>;
  const body = action.bodyJson.trim() ? JSON.parse(action.bodyJson) : undefined;
  const seen = new Set<string>();
  for (const binding of action.bindings ?? []) {
    if (
      binding.fromStep >= index ||
      producedIds[actions[binding.fromStep]?.operationId] !== binding.result ||
      !expectedTarget[binding.result].includes(binding.target) ||
      seen.has(binding.target)
    )
      throw new DecisionError(
        'Dependencies must use a supported ID returned by an earlier step, with one binding per field.',
      );
    seen.add(binding.target);
    const [section, key] = binding.target.split('.');
    const destination = section === 'parameters' ? parameters : body;
    if (!destination || typeof destination !== 'object' || Array.isArray(destination))
      throw new DecisionError('The dependency destination must be an object field.');
    const result = outputs
      ? binding.result
          .split('.')
          .reduce<unknown>(
            (value, part) =>
              value && typeof value === 'object'
                ? (value as Record<string, unknown>)[part]
                : undefined,
            outputs[binding.fromStep],
          )
      : '00000000-0000-4000-8000-000000000000';
    destination[key] = z.string().uuid().parse(result);
  }
  return {
    ...action,
    parametersJson: JSON.stringify(parameters),
    bodyJson: body === undefined ? '' : JSON.stringify(body),
  };
}
async function currentActor(p: RequestPrincipal, request: Request) {
  const current = await getAuthenticatedSessionPrincipal(request);
  if (
    !current ||
    current.userId !== p.userId ||
    current.profileId !== p.profileId ||
    !canAccountUseAi(current.userId)
  )
    throw new DecisionError(
      'Your session, profile or AI access changed. Review this operation again after signing in.',
      403,
    );
  return current;
}
function resultDestination(
  op: AppOperation,
  parameters: Record<string, string>,
  payload: unknown,
): string | undefined {
  const output = payload as Record<string, { id?: string }> | null;
  const listId = output?.list?.id ?? parameters.listId;
  const recipeId = output?.recipe?.id ?? parameters.recipeId;
  if (listId && op.path.startsWith('/shopping-lists'))
    return `/lists/${encodeURIComponent(listId)}`;
  if (recipeId && op.path.startsWith('/recipes')) return `/recipes/${encodeURIComponent(recipeId)}`;
  if (op.path.startsWith('/kitchen')) return '/my-kitchen';
  if (op.path === '/account/cooking-preferences') return '/account';
  if (op.path.startsWith('/pantry')) return '/pantry';
  if (op.path.startsWith('/meal-plan')) return '/planner';
  if (op.path.startsWith('/nutrition')) return '/nutrition?view=diary';
  if (op.path.startsWith('/cook-sessions')) {
    const session = output?.session as { id?: string; recipeId?: string } | undefined;
    if (session?.id && session.recipeId)
      return `/recipes/${encodeURIComponent(session.recipeId)}/cook?sessionId=${encodeURIComponent(session.id)}`;
    return '/recipes';
  }
  return undefined;
}
export async function prepareAppActions(
  p: RequestPrincipal,
  request: Request,
  threadId: string,
  input: unknown,
  replacement?: { id: string; version: number },
) {
  p = await currentActor(p, request);
  const thread = getDatabase()
    .select()
    .from(aiChatThreads)
    .where(eq(aiChatThreads.id, z.string().uuid().parse(threadId)))
    .get();
  if (!thread || thread.profileId !== p.profileId)
    throw new DecisionError(
      'Use a conversation owned by your account profile for this review.',
      403,
    );
  const parsed = appActionRequestSchema.parse(input);
  const nutritionLabels = new Map<number, string>();
  for (const [index, action] of parsed.actions.entries()) {
    if (action.operationId !== 'logProductNutrition') continue;
    const { parameters, body } = parseAction(p, bindAction(parsed.actions, index));
    if (action.bindings.some((binding) => binding.target === 'body.productId'))
      throw new DecisionError(
        'Review the saved product and its nutrition record before preparing food intake.',
        409,
      );
    const intake = productConsumptionRequestSchema.parse(body);
    const previous = intake.supersedesIntakeRevisionId
      ? getNutritionIntakeRevisionForUpdate(
          parameters.profileId,
          resolveNutritionHouseholdContext({ profileId: p.linkedProfileId, source: 'auth-session' })
            .compatibilityPrincipalId,
          intake.supersedesIntakeRevisionId,
        )
      : null;
    if (previous && (previous.sourceType !== 'product' || previous.productId !== intake.productId))
      throw new DecisionError(
        'A product correction must preserve its original product source.',
        409,
      );
    const record = previous?.foodNutritionRecordId
      ? getFoodNutritionRecord(previous.foodNutritionRecordId)
      : selectPreferredFoodNutritionRecord(intake.productId);
    if (
      !record ||
      (intake.expectedFoodNutritionRecordId && intake.expectedFoodNutritionRecordId !== record.id)
    )
      throw new DecisionError(
        'The product nutrition record is unavailable or changed. Review the current record before preparing intake.',
        409,
      );
    action.bodyJson = JSON.stringify({ ...intake, expectedFoodNutritionRecordId: record.id });
    nutritionLabels.set(
      index,
      `${record.source.name} · nutrition revision ${record.revision} · basis ${record.basisAmount} ${record.basisUnit}`,
    );
  }
  if (
    parsed.actions.some((action) => action.operationId === 'generateRecipeImage') &&
    !parsed.actions.every((action) => action.operationId === 'generateRecipeImage')
  )
    throw new DecisionError(
      'Prepare image generation as its own group so it can run in the background.',
    );
  const previews = parsed.actions.map((action, index) => {
    const { op, parameters, body } = parseAction(p, bindAction(parsed.actions, index));
    if (op.effect === 'read') throw new DecisionError('Read operations do not need a proposal.');
    const recipe = parameters.recipeId ? getRecipe(parameters.recipeId, p.profileId) : null;
    return {
      summary: op.summary,
      method: op.method,
      path: op.path,
      parameters,
      body: body ?? null,
      bindings: action.bindings,
      recordLabel: recipe?.title,
      changeLabel:
        op.id === 'generateRecipeImage'
          ? recipe?.images.length
            ? 'Replace cover image'
            : 'Create image'
          : nutritionLabels.get(index),
    };
  });
  const snapshots: Snapshot[] = [];
  for (const [index, action] of parsed.actions.entries()) {
    const { op, parameters } = parseAction(p, bindAction(parsed.actions, index));
    // Only a newly created path target is absent. A body dependency must not skip
    // the reviewed version of an already-existing target record.
    if (
      action.bindings.some(
        (binding) =>
          binding.target.startsWith('parameters.') &&
          op.path.includes(`{${binding.target.slice('parameters.'.length)}}`),
      )
    )
      continue;
    const current = await snapshot(request, op, parameters);
    if (current) snapshots.push(current);
  }
  enforceDecisionBudget(p);
  const row = getDatabase().transaction(() => {
    const created = storeDecision(p, {
      task: 'app_actions',
      subject: randomUUID(),
      hash: decisionHash(parsed),
      evidence: previews,
      result: { ...parsed, threadId, snapshots },
      ttlMs: 30 * 60 * 1000,
    });
    if (replacement)
      saveDecisionCorrection(p, replacement.id, replacement.version, 'app_action_superseded', {
        status: 'superseded',
        replacementId: created.id,
      });
    return created;
  });
  return {
    appAction: {
      id: row.id,
      version: row.version,
      title: parsed.title,
      actions: previews,
      status: 'pending',
    } satisfies AppActionReview,
  };
}
export async function reviseAppActions(p: RequestPrincipal, request: Request, raw: unknown) {
  p = await currentActor(p, request);
  const input = z
    .object({
      id: z.uuid(),
      version: z.number().int().positive(),
      title: z.string().trim().min(1).max(160),
      bodyEdits: z
        .array(
          z
            .object({
              step: z.number().int().min(0).max(19),
              bodyJson: z.string().min(2).max(60000),
            })
            .strict(),
        )
        .min(1)
        .max(20),
    })
    .strict()
    .parse(raw);
  const old = ownedDecision(p, input.id);
  if (
    old.task !== 'app_actions' ||
    old.correctionJson ||
    old.version !== input.version ||
    old.expiresAt.getTime() < Date.now()
  )
    throw new DecisionError(
      'This proposal changed or was already handled. Reload the conversation before editing it.',
      409,
    );
  const value = JSON.parse(old.resultJson) as { actions: Action[]; threadId: string };
  const next = value.actions.map((action) => actionSchema.parse(action));
  const seen = new Set<number>();
  for (const edit of input.bodyEdits) {
    if (
      !next[edit.step] ||
      seen.has(edit.step) ||
      next[edit.step].operationId === 'generateRecipeImage'
    )
      throw new DecisionError(
        'Choose each editable change once. Image requests need a new explicit review.',
      );
    seen.add(edit.step);
    next[edit.step] = { ...next[edit.step], bodyJson: edit.bodyJson };
  }
  return prepareAppActions(
    p,
    request,
    value.threadId,
    { title: input.title, actions: next },
    { id: old.id, version: old.version },
  );
}
export async function confirmAppActions(p: RequestPrincipal, request: Request, input: unknown) {
  p = await currentActor(p, request);
  const { id, version, decision } = z
    .object({
      id: z.string().uuid(),
      version: z.number().int().positive(),
      decision: z.enum(['apply', 'dismiss']),
    })
    .strict()
    .parse(input);
  const row = ownedDecision(p, id);
  if (row.task === 'app_actions' && row.correctionJson) {
    const existing = JSON.parse(row.correctionJson);
    if (decision === 'apply' && ['applied', 'partial', 'queued'].includes(existing.status))
      return { ...existing, replayed: true };
  }
  if (row.task !== 'app_actions' || row.correctionJson || row.expiresAt.getTime() < Date.now())
    throw new DecisionError(
      'This proposal is expired or has already been handled. Prepare a new review.',
      409,
    );
  const value = JSON.parse(row.resultJson) as {
    actions: Action[];
    snapshots?: Snapshot[];
    threadId: string;
  };
  const compatible = z.array(actionSchema).safeParse(value.actions);
  if (!compatible.success)
    throw new DecisionError(
      'This saved proposal uses an unsupported dependency contract. Prepare a new review; no changes were applied.',
      409,
    );
  value.actions = compatible.data;
  if (
    decision === 'apply' &&
    value.actions.some(
      (action) =>
        action.operationId === 'logProductNutrition' &&
        !productConsumptionRequestSchema.parse(JSON.parse(action.bodyJson))
          .expectedFoodNutritionRecordId,
    )
  )
    throw new DecisionError(
      'This older intake proposal does not identify its reviewed nutrition record. Prepare a fresh review before logging food.',
      409,
    );
  if (decision === 'apply')
    for (const saved of value.snapshots ?? []) {
      const op = operation(p, saved.operationId);
      const response = await invoke(request, op, saved.parameters, undefined);
      if (!response.ok || decisionHash(await response.json()) !== saved.hash)
        throw new DecisionError(
          'The source data changed since this review. Ask chat to prepare a fresh proposal.',
          409,
        );
    }
  const imageGroup = value.actions.every((action) => action.operationId === 'generateRecipeImage');
  if (decision === 'apply' && imageGroup) {
    if (!appRoleCan(p.role, 'shared.update') || !appRoleCan(p.accountRole, 'shared.update'))
      throw new DecisionError('This account cannot change shared recipe images.', 403);
    if (!getAiReadiness().enabled || !getAiWorkloadSetting(p.profileId, 'image_generation').enabled)
      throw new DecisionError(
        'Enable and configure recipe image generation before starting this request.',
        409,
      );
    const images = value.actions.map((action) => {
      const { parameters } = parseAction(p, action);
      const recipe = getRecipe(parameters.recipeId, p.profileId);
      if (!recipe)
        throw new DecisionError('A recipe no longer exists. Prepare a fresh review.', 409);
      return {
        recipeId: recipe.id,
        ...recipeImageInput(recipe),
      };
    });
    return getDatabase().transaction(() => {
      saveDecisionCorrection(p, id, version, 'app_action_started', { status: 'running' });
      const job = enqueueRecipeImageJob({
        profileId: p.profileId,
        threadId: value.threadId,
        images,
      });
      const results = images.map((image) => ({
        summary: image.recipeTitle,
        ok: true,
        message: 'Queued for image generation.',
      }));
      saveDecisionCorrection(p, id, version + 1, 'app_action_completed', {
        status: 'queued',
        jobId: job!.id,
        results,
      });
      return { status: 'queued', results, jobId: job!.id, skipped: 0 };
    });
  }
  // Lock before the first write. A crash cannot cause a second confirmation to replay partial writes.
  saveDecisionCorrection(p, id, version, 'app_action_started', {
    status: decision === 'dismiss' ? 'dismissed' : 'running',
  });
  if (decision === 'dismiss') return { status: 'dismissed', results: [] };
  const results: NonNullable<AppActionReview['results']> = [];
  const outputs: unknown[] = [];
  let correctionVersion = version + 1;
  for (const [index, action] of value.actions.entries()) {
    let attempted = false;
    try {
      p = await currentActor(p, request);
      const { op, parameters, body } = parseAction(p, bindAction(value.actions, index, outputs));
      // Persist the boundary before invoking a mutation; an interrupted result is never labelled failed/not attempted.
      saveDecisionCorrection(p, id, correctionVersion++, 'app_action_step_started', {
        status: 'running',
        results,
        activeStep: index,
        activeState: 'outcome-unknown',
      });
      attempted = true;
      const response = await invoke(request, op, parameters, body, `ai-${id}-${index}`);
      const payload = await response.json().catch(() => null);
      outputs.push(payload);
      const uncertain =
        response.status >= 500 || (response.ok && response.status !== 204 && payload === null);
      results.push({
        summary: op.summary,
        ok: response.ok && !uncertain,
        state: uncertain ? 'outcome-unknown' : response.ok ? 'completed' : 'failed',
        href: resultDestination(op, parameters, payload),
        message: uncertain
          ? 'The outcome is uncertain. Inspect the affected records before starting another operation.'
          : response.ok
            ? op.path === '/kitchen' && payload?.kitchen?.items
              ? `Saved kitchen change: ${
                  payload.kitchen.items
                    .filter((item: { id: string }) => payload.receipt?.itemIds?.includes(item.id))
                    .map((item: { name: string }) => item.name)
                    .join(', ') || 'Inventory updated'
                }.`
              : 'Change acknowledged by the app.'
            : typeof payload?.error?.message === 'string'
              ? payload.error.message
              : 'The app rejected this change.',
      });
    } catch (error) {
      results.push({
        summary: action.operationId,
        ok: false,
        state: attempted ? 'outcome-unknown' : 'not-attempted',
        message: attempted
          ? 'The response was interrupted. This change may have committed; review its record before retrying.'
          : error instanceof DecisionError
            ? error.message
            : 'The dependency or input could not be validated. This step was not attempted.',
      });
    }
    saveDecisionCorrection(p, id, correctionVersion++, 'app_action_step_result', {
      status: 'running',
      results,
    });
    if (!results.at(-1)?.ok) break;
  }
  const completedCount = results.length;
  for (const action of value.actions.slice(completedCount))
    results.push({
      summary: action.operationId,
      ok: false,
      state: 'not-attempted',
      message: 'Not attempted because a preceding step did not complete.',
    });
  const status = results.every((r) => r.ok) ? 'applied' : 'partial';
  saveDecisionCorrection(p, id, correctionVersion, 'app_action_completed', { status, results });
  return { status, results, skipped: value.actions.length - completedCount };
}
