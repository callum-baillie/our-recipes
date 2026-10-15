import 'server-only';
import { and, eq, desc } from 'drizzle-orm';
import { getDatabase } from '@/lib/db/client';
import { aiDecisionRecords } from '@/lib/db/schema';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { APP_OPERATIONS, APP_ROUTE_LOADERS, type AppOperation } from './ai-app-operation-catalog';
import type { RequestPrincipal } from './auth-service';
import { getAiDataPolicy } from './ai-settings-service';
import {
  decisionHash,
  ownedDecision,
  saveDecisionCorrection,
  storeDecision,
  enforceDecisionBudget,
} from './decision-cache-service';
import { DecisionError } from '@/lib/providers/decisions-provider';

const actionSchema = z
  .object({
    operationId: z.string().max(100),
    parametersJson: z.string().max(4000),
    bodyJson: z.string().max(60000),
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
  }[];
  status: string;
};
function operation(p: RequestPrincipal, id: string) {
  const op = APP_OPERATIONS.find((candidate) => candidate.id === id);
  if (!op) throw new DecisionError('This app operation is not available to chat.');
  const policy = getAiDataPolicy(p.profileId);
  // Core API objects may contain linked recipes, stock, lists and plan references.
  if (
    !policy.shareSharedRecipes ||
    !policy.sharePantry ||
    !policy.shareShoppingLists ||
    !policy.shareMealPlans ||
    !policy.shareRecipePreferences
  )
    throw new DecisionError(
      'Core app tools require sharing recipes, recipe preferences, pantry, shopping lists and meal plans. Use the page controls if you prefer to keep those private.',
      403,
    );
  return op;
}
function parseAction(p: RequestPrincipal, action: Action) {
  const op = operation(p, action.operationId);
  const parameters = z
    .record(z.string().max(80), z.string().max(500))
    .parse(JSON.parse(action.parametersJson));
  const body: unknown = action.bodyJson.trim() ? JSON.parse(action.bodyJson) : undefined;
  if (op.validator && body !== undefined) op.validator.parse(body);
  for (const match of op.path.matchAll(/\{([^}]+)\}/g)) {
    if (!parameters[match[1]] || !/^[a-zA-Z0-9_-]+$/.test(parameters[match[1]]))
      throw new DecisionError(`Supply a valid ${match[1]}.`);
  }
  return { op, parameters, body };
}
export function listAppActions(p: RequestPrincipal, resource: string, operationId?: string) {
  const candidates = APP_OPERATIONS.filter(
    (op) =>
      (!resource || op.path.split('/')[1] === resource) && (!operationId || op.id === operationId),
  );
  return candidates.map((candidate) => {
    const op = operation(p, candidate.id);
    let schema = op.body;
    try {
      if (op.validator) schema = z.toJSONSchema(op.validator, { io: 'input' });
    } catch {
      /* The route still validates the submitted input. */
    }
    return {
      operationId: op.id,
      summary: op.summary,
      method: op.method,
      parameters: op.parameters,
      ...(operationId ? { bodySchema: schema } : {}),
    };
  });
}
async function invoke(
  request: Request,
  op: AppOperation,
  parameters: Record<string, string>,
  body: unknown,
) {
  const path = op.path.replace(/\{([^}]+)\}/g, (_, key: string) =>
    encodeURIComponent(parameters[key]),
  );
  const url = new URL(`/api/v1${path}`, request.url);
  for (const [key, value] of Object.entries(parameters))
    if (!op.path.includes(`{${key}}`)) url.searchParams.set(key, value);
  const headers = new Headers({ 'Content-Type': 'application/json' });
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
  const action = actionSchema.parse(input);
  const parsed = parseAction(p, action);
  if (parsed.op.method !== 'GET')
    throw new DecisionError('Use a reviewed proposal for this operation.');
  const response = await invoke(request, parsed.op, parsed.parameters, undefined);
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
  const reader = APP_OPERATIONS.filter(
    (candidate) =>
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
    .map((row) => ({
      id: row.id,
      version: row.version,
      title: JSON.parse(row.resultJson).title,
      actions: JSON.parse(row.evidenceJson),
      status: row.correctionJson
        ? JSON.parse(row.correctionJson).status
        : row.expiresAt.getTime() < Date.now()
          ? 'expired'
          : 'pending',
    }));
}
export async function prepareAppActions(
  p: RequestPrincipal,
  request: Request,
  threadId: string,
  input: unknown,
) {
  const parsed = appActionRequestSchema.parse(input);
  const previews = parsed.actions.map((action) => {
    const { op, parameters, body } = parseAction(p, action);
    if (op.method === 'GET') throw new DecisionError('Read operations do not need a proposal.');
    return {
      summary: op.summary,
      method: op.method,
      path: op.path,
      parameters,
      body: body ?? null,
    };
  });
  const snapshots: Snapshot[] = [];
  for (const action of parsed.actions) {
    const { op, parameters } = parseAction(p, action);
    const current = await snapshot(request, op, parameters);
    if (current) snapshots.push(current);
  }
  enforceDecisionBudget(p);
  const row = storeDecision(p, {
    task: 'app_actions',
    subject: randomUUID(),
    hash: decisionHash(parsed),
    evidence: previews,
    result: { ...parsed, threadId, snapshots },
    ttlMs: 30 * 60 * 1000,
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
export async function confirmAppActions(p: RequestPrincipal, request: Request, input: unknown) {
  const { id, version, decision } = z
    .object({
      id: z.string().uuid(),
      version: z.number().int().positive(),
      decision: z.enum(['apply', 'dismiss']),
    })
    .strict()
    .parse(input);
  const row = ownedDecision(p, id);
  if (row.task !== 'app_actions' || row.correctionJson || row.expiresAt.getTime() < Date.now())
    throw new DecisionError(
      'This proposal is expired or has already been handled. Prepare a new review.',
      409,
    );
  const value = JSON.parse(row.resultJson) as { actions: Action[]; snapshots?: Snapshot[] };
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
  // Lock before the first write. A crash cannot cause a second confirmation to replay partial writes.
  saveDecisionCorrection(p, id, version, 'app_action_started', {
    status: decision === 'dismiss' ? 'dismissed' : 'running',
  });
  if (decision === 'dismiss') return { status: 'dismissed', results: [] };
  const results: { summary: string; ok: boolean; message: string }[] = [];
  for (const action of value.actions) {
    try {
      const { op, parameters, body } = parseAction(p, action);
      const response = await invoke(request, op, parameters, body);
      const payload = await response.json().catch(() => null);
      results.push({
        summary: op.summary,
        ok: response.ok,
        message: response.ok
          ? 'Saved.'
          : typeof payload?.error?.message === 'string'
            ? payload.error.message
            : 'The app rejected this change.',
      });
    } catch {
      results.push({
        summary: action.operationId,
        ok: false,
        message: 'Unable to confirm this change. Inspect the source before retrying.',
      });
    }
    if (!results.at(-1)?.ok) break;
  }
  const status =
    results.length === value.actions.length && results.every((r) => r.ok) ? 'applied' : 'partial';
  saveDecisionCorrection(p, id, version + 1, 'app_action_completed', { status, results });
  return { status, results, skipped: value.actions.length - results.length };
}
