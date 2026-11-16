import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, eq, gt, desc } from 'drizzle-orm';
import { z } from 'zod';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import {
  aiRecoveryRequests,
  aiChatThreads,
  aiChatTurns,
  profileAuthLinks,
  user,
  profiles,
  aiProfileSettings,
  aiExecutionTraces,
} from '@/lib/db/schema';
import {
  aiRecoveryPayloadSchema,
  sharingLabels,
  type AiRecoveryCard,
  type AiRecoveryPayload,
} from '@/lib/domain/ai-recovery';
import type { RequestPrincipal } from './auth-service';
import { getAiDataPolicy, updateAiSettings, saveGlobalAiSettings } from './ai-settings-service';
import { getGlobalAiPolicy } from './ai-access-service';
import { abortAiTurn, currentAiExecutionContext } from './ai-execution-context';

export class AiRecoveryError extends Error {
  readonly code = 'approval_invalid';
  get publicMessage() {
    return this.message;
  }
}
export class AiConsentRequiredError extends Error {
  constructor(readonly requests: AiRecoveryCard[]) {
    super(
      'This conversation needs renewed sharing approval before earlier private information can be used. Approve the requested access or start a new conversation.',
    );
  }
}
type Row = typeof aiRecoveryRequests.$inferSelect;
export const limitBounds = {
  generationsPerTenMinutes: { max: 100, label: 'Provider requests per ten minutes' },
  maxOutputTokens: { max: 16384, label: 'Maximum response tokens' },
  requestTimeoutSeconds: { max: 300, label: 'Response deadline in seconds' },
  toolRoundLimit: { max: 12, label: 'Tool rounds per reply' },
} as const;
function account(p: RequestPrincipal) {
  ensureDatabase();
  const a = getDatabase().select().from(user).where(eq(user.id, p.userId)).get();
  const link = getDatabase()
    .select()
    .from(profileAuthLinks)
    .where(eq(profileAuthLinks.userId, p.userId))
    .get();
  if (
    !a ||
    a.banned ||
    p.kind !== 'session' ||
    p.profileId !== p.linkedProfileId ||
    link?.profileId !== p.profileId
  )
    throw new AiRecoveryError('Sign in to your own account to review this request.');
  return a;
}
function admin(p: RequestPrincipal) {
  return account(p).role === 'admin' && p.role === 'admin' && p.accountRole === 'admin';
}
function mayApprove(p: RequestPrincipal, payload: AiRecoveryPayload) {
  account(p);
  if (payload.kind === 'limit') return admin(p);
  const owner = getDatabase()
    .select()
    .from(profileAuthLinks)
    .where(eq(profileAuthLinks.profileId, payload.targetProfileId))
    .get();
  // Administrator authority never substitutes for a different account's private consent.
  return owner ? owner.userId === p.userId : admin(p);
}
function card(row: Row, p: RequestPrincipal): AiRecoveryCard {
  const payload = aiRecoveryPayloadSchema.parse(JSON.parse(row.payload));
  const expired = row.expiresAt.getTime() <= Date.now();
  const canApprove = mayApprove(p, payload);
  return {
    id: row.id,
    threadId: row.threadId,
    kind: payload.kind,
    title:
      payload.kind === 'sharing'
        ? 'Allow the assistant to use more context?'
        : 'This reply needs a higher limit',
    reason: payload.reason,
    scope:
      payload.kind === 'sharing'
        ? `${payload.targetProfileId === p.profileId ? 'Your data' : (getDatabase().select({ name: profiles.displayName }).from(profiles).where(eq(profiles.id, payload.targetProfileId)).get()?.name ?? 'Household member')} · ${payload.categories.map((c) => sharingLabels[c]).join(', ')}`
        : `${limitBounds[payload.setting].label}: ${payload.value}`,
    status:
      row.status === 'declined'
        ? 'declined'
        : expired && row.approvedMode !== 'permanent'
          ? 'expired'
          : row.status,
    canApprove: canApprove && row.status === 'pending' && !expired,
    canRevoke:
      canApprove &&
      row.approvedMode === 'once' &&
      !expired &&
      (row.status === 'approved' ||
        (row.status === 'used' &&
          Boolean(
            row.turnId &&
            getDatabase().select().from(aiChatTurns).where(eq(aiChatTurns.id, row.turnId)).get()
              ?.status === 'running',
          ))),
    canContinue:
      row.requesterUserId === p.userId &&
      row.status === 'approved' &&
      (!expired || row.approvedMode === 'permanent'),
    approvedMode: row.approvedMode,
    approvalNote:
      payload.kind === 'sharing'
        ? canApprove
          ? row.requesterUserId === p.userId
            ? 'Only these data categories will be shared with your configured AI provider.'
            : 'These categories will be used in another household account’s conversation. Replies may include the approved facts. Only the selected categories are shared.'
          : 'The account that owns this data must approve. They can review the request in their assistant.'
        : canApprove
          ? 'Only an administrator can approve this change.'
          : 'An administrator must approve this request in their assistant.',
    permanentNote:
      payload.kind === 'sharing'
        ? 'Always allow shares these categories with permitted household AI requests until you turn sharing off. It is not limited to this conversation.'
        : 'Update setting changes the household limit for future requests.',
    expiresAt: row.expiresAt.toISOString(),
  };
}
export function requestAiRecovery(p: RequestPrincipal, threadId: string, raw: unknown) {
  const a = account(p);
  const thread = getDatabase()
    .select()
    .from(aiChatThreads)
    .where(eq(aiChatThreads.id, threadId))
    .get();
  if (!thread || thread.profileId !== p.profileId)
    throw new AiRecoveryError('This conversation is not available to your account.');
  if (thread.privacyScopeJson) {
    const scope = JSON.parse(thread.privacyScopeJson) as { owner?: string };
    if (scope.owner && scope.owner !== p.userId)
      throw new AiRecoveryError(
        'Start a new conversation for this account before requesting approval.',
      );
  }
  const payload = aiRecoveryPayloadSchema.parse(raw);
  if (payload.kind === 'sharing') {
    if (
      !getDatabase().select().from(profiles).where(eq(profiles.id, payload.targetProfileId)).get()
    )
      throw new AiRecoveryError('That household profile is no longer available.');
    if (payload.targetProfileId !== p.profileId && (a.role === 'child' || p.role === 'child'))
      throw new AiRecoveryError(
        'This account cannot request another household member’s private data.',
      );
    payload.categories = [...new Set(payload.categories)];
  } else if (payload.value > limitBounds[payload.setting].max)
    throw new AiRecoveryError('That exceeds the supported setting. Try a smaller task instead.');
  const serialized = JSON.stringify(payload);
  const prior = getDatabase()
    .select()
    .from(aiRecoveryRequests)
    .where(
      and(
        eq(aiRecoveryRequests.requesterUserId, p.userId),
        eq(aiRecoveryRequests.threadId, threadId),
        eq(aiRecoveryRequests.status, 'pending'),
        gt(aiRecoveryRequests.expiresAt, new Date()),
      ),
    )
    .all()
    .find((r) => {
      const previous = aiRecoveryPayloadSchema.parse(JSON.parse(r.payload));
      return (
        previous.kind === payload.kind &&
        (previous.kind === 'sharing' && payload.kind === 'sharing'
          ? previous.targetProfileId === payload.targetProfileId &&
            [...previous.categories].sort().join(',') === [...payload.categories].sort().join(',')
          : previous.kind === 'limit' &&
            payload.kind === 'limit' &&
            previous.setting === payload.setting &&
            previous.value === payload.value)
      );
    });
  if (prior) return card(prior, p);
  const row: Row = {
    id: randomUUID(),
    threadId,
    requesterUserId: p.userId,
    actorProfileId: p.profileId,
    payload: serialized,
    status: 'pending',
    approvedMode: null,
    approvedByUserId: null,
    baselineVersion: null,
    turnId: null,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 15 * 60_000),
  };
  getDatabase().insert(aiRecoveryRequests).values(row).run();
  return card(row, p);
}
export function listAiRecoveryRequests(p: RequestPrincipal, threadId?: string) {
  account(p);
  const rows = getDatabase()
    .select()
    .from(aiRecoveryRequests)
    .orderBy(desc(aiRecoveryRequests.createdAt))
    .limit(100)
    .all();
  return rows
    .filter((r) => {
      if (r.requesterUserId === p.userId && (!threadId || r.threadId === threadId)) return true;
      return (
        (r.status === 'pending' ||
          (r.approvedMode === 'once' && ['approved', 'used'].includes(r.status))) &&
        r.expiresAt.getTime() > Date.now() &&
        mayApprove(p, aiRecoveryPayloadSchema.parse(JSON.parse(r.payload)))
      );
    })
    .slice(0, 30)
    .reverse()
    .map((r) => card(r, p));
}
export function resolveAiRecovery(p: RequestPrincipal, id: string, raw: unknown) {
  const { decision } = z
    .object({ decision: z.enum(['once', 'permanent', 'decline', 'revoke']) })
    .strict()
    .parse(raw);
  account(p);
  return getDatabase().transaction(
    () => {
      const row = getDatabase()
        .select()
        .from(aiRecoveryRequests)
        .where(eq(aiRecoveryRequests.id, id))
        .get();
      if (!row) throw new AiRecoveryError('This approval request is unavailable.');
      const payload = aiRecoveryPayloadSchema.parse(JSON.parse(row.payload));
      const requester = getDatabase()
        .select()
        .from(user)
        .where(eq(user.id, row.requesterUserId))
        .get();
      const requesterLink = getDatabase()
        .select()
        .from(profileAuthLinks)
        .where(eq(profileAuthLinks.userId, row.requesterUserId))
        .get();
      if (!requester || requester.banned || requesterLink?.profileId !== row.actorProfileId)
        throw new AiRecoveryError(
          'The requesting account changed. Nothing was updated. Ask for a new request.',
        );
      if (!mayApprove(p, payload))
        throw new AiRecoveryError(
          'Only the data owner or an authorized administrator can approve this request.',
        );
      const repeated =
        decision === 'once' || decision === 'permanent'
          ? row.approvedMode === decision && ['approved', 'used'].includes(row.status)
          : decision === 'decline'
            ? row.status === 'declined' && row.approvedMode === null
            : row.status === 'declined' && row.approvedMode === 'once';
      if (repeated) return card(row, p);
      if (decision === 'revoke') {
        if (row.approvedMode !== 'once' || !['approved', 'used'].includes(row.status))
          throw new AiRecoveryError(
            'Only an active one-time approval can be revoked here. Review permanent settings to change ongoing access.',
          );
        getDatabase()
          .update(aiRecoveryRequests)
          .set({ status: 'declined', expiresAt: new Date() })
          .where(eq(aiRecoveryRequests.id, id))
          .run();
        if (row.turnId)
          abortAiTurn(
            row.turnId,
            new AiRecoveryError(
              'The one-time approval was revoked. Further use of the approved context has stopped.',
            ),
          );
        return card(
          getDatabase()
            .select()
            .from(aiRecoveryRequests)
            .where(eq(aiRecoveryRequests.id, id))
            .get()!,
          p,
        );
      }
      if (row.status !== 'pending' || row.expiresAt.getTime() <= Date.now())
        throw new AiRecoveryError('This request has ended. Ask the assistant for a new request.');
      let baselineVersion: number;
      if (payload.kind === 'sharing') {
        const policy = getAiDataPolicy(payload.targetProfileId);
        baselineVersion = policy.version;
        if (decision === 'permanent')
          updateAiSettings(payload.targetProfileId, {
            dataPolicy: {
              ...policy,
              ...Object.fromEntries(payload.categories.map((c) => [c, true])),
            },
          });
      } else {
        const global = getGlobalAiPolicy();
        baselineVersion = global.version;
        if (decision === 'permanent')
          saveGlobalAiSettings(p.profileId, {
            version: global.version,
            settings: {
              ...global.settings,
              [payload.setting]: Math.max(global.settings[payload.setting], payload.value),
            },
            users: [],
          });
      }
      getDatabase()
        .update(aiRecoveryRequests)
        .set({
          status: decision === 'decline' ? 'declined' : 'approved',
          approvedMode: decision === 'decline' ? null : decision,
          approvedByUserId: p.userId,
          baselineVersion,
        })
        .where(and(eq(aiRecoveryRequests.id, id), eq(aiRecoveryRequests.status, 'pending')))
        .run();
      return card(
        getDatabase().select().from(aiRecoveryRequests).where(eq(aiRecoveryRequests.id, id)).get()!,
        p,
      );
    },
    { behavior: 'immediate' },
  );
}
export type AiGrantedRecovery = {
  id: string;
  actorProfileId: string;
  payload: AiRecoveryPayload;
  expiresAt: number;
  baselineVersion: number;
  approvedByUserId: string;
};
export function claimAiRecoveries(
  p: RequestPrincipal,
  threadId: string,
  turnId: string,
  ids: string[],
): AiGrantedRecovery[] {
  account(p);
  if (!ids.length) return [];
  return getDatabase().transaction(
    () => {
      const grants: AiGrantedRecovery[] = [];
      for (const id of new Set(ids)) {
        const row = getDatabase()
          .select()
          .from(aiRecoveryRequests)
          .where(eq(aiRecoveryRequests.id, id))
          .get();
        if (
          !row ||
          row.requesterUserId !== p.userId ||
          row.threadId !== threadId ||
          row.actorProfileId !== p.profileId ||
          !row.approvedMode ||
          (row.approvedMode === 'once' && row.expiresAt.getTime() <= Date.now()) ||
          !(row.status === 'approved' || (row.status === 'used' && row.turnId === turnId)) ||
          !row.approvedByUserId ||
          row.baselineVersion === null
        )
          throw new AiRecoveryError(
            'This one-time approval has expired or was already used. Request approval again.',
          );
        const payload = aiRecoveryPayloadSchema.parse(JSON.parse(row.payload));
        if (row.approvedMode === 'permanent') {
          const stillAllowed =
            payload.kind === 'sharing'
              ? payload.categories.every((c) => getAiDataPolicy(payload.targetProfileId)[c])
              : getGlobalAiPolicy().settings[payload.setting] >= payload.value;
          if (!stillAllowed)
            throw new AiRecoveryError(
              'The permanent setting changed. Review settings before continuing.',
            );
          getDatabase()
            .update(aiRecoveryRequests)
            .set({ status: 'used', turnId })
            .where(eq(aiRecoveryRequests.id, id))
            .run();
          continue;
        }
        const grant = {
          id: row.id,
          actorProfileId: row.actorProfileId,
          payload,
          expiresAt: row.expiresAt.getTime(),
          baselineVersion: row.baselineVersion,
          approvedByUserId: row.approvedByUserId,
        };
        assertGrantValid(grant);
        getDatabase()
          .update(aiRecoveryRequests)
          .set({ status: 'used', turnId })
          .where(eq(aiRecoveryRequests.id, id))
          .run();
        grants.push(grant);
      }
      return grants;
    },
    { behavior: 'immediate' },
  );
}
function assertGrantValid(g: AiGrantedRecovery) {
  const approval = getDatabase()
    .select()
    .from(aiRecoveryRequests)
    .where(eq(aiRecoveryRequests.id, g.id))
    .get();
  if (
    !approval ||
    !['approved', 'used'].includes(approval.status) ||
    (approval.status === 'used' &&
      currentAiExecutionContext()?.turnId &&
      approval.turnId !== currentAiExecutionContext()?.turnId)
  )
    throw new AiRecoveryError(
      'The one-time approval was withdrawn. Request approval again if this data is still needed.',
    );
  if (Date.now() >= g.expiresAt)
    throw new AiRecoveryError('The one-time approval expired. Request approval again.');
  const approver = getDatabase().select().from(user).where(eq(user.id, g.approvedByUserId)).get();
  if (!approver || approver.banned) throw new AiRecoveryError('Approval is no longer valid.');
  if (g.payload.kind === 'limit') {
    if (approver.role !== 'admin' || getGlobalAiPolicy().version !== g.baselineVersion)
      throw new AiRecoveryError(
        'Administrator settings changed after approval. Request approval again.',
      );
  } else {
    const owner = getDatabase()
      .select()
      .from(profileAuthLinks)
      .where(eq(profileAuthLinks.profileId, g.payload.targetProfileId))
      .get();
    if (owner ? owner.userId !== approver.id : approver.role !== 'admin')
      throw new AiRecoveryError('The account that owns this data changed. Request approval again.');
    // Read the stored row, not the effective policy, to avoid granting through a stale consent.
    const policy = getDatabase()
      .select({ version: aiProfileSettings.version })
      .from(aiProfileSettings)
      .where(eq(aiProfileSettings.profileId, g.payload.targetProfileId))
      .get();
    if (policy?.version !== g.baselineVersion)
      throw new AiRecoveryError('Sharing settings changed after approval. Request approval again.');
  }
}
export function assertAiRecoveryGrants() {
  for (const grant of currentAiExecutionContext()?.recoveryGrants ?? []) assertGrantValid(grant);
}

/** A preflight failure that never reached a provider does not spend an approval. */
export function releaseUnusedAiRecoveries(p: RequestPrincipal, threadId: string, turnId: string) {
  const turn = getDatabase().select().from(aiChatTurns).where(eq(aiChatTurns.id, turnId)).get();
  if (turn?.status === 'running') return;
  const sent = getDatabase()
    .select({ id: aiExecutionTraces.id })
    .from(aiExecutionTraces)
    .where(eq(aiExecutionTraces.turnId, turnId))
    .limit(1)
    .get();
  if (sent) return;
  getDatabase()
    .update(aiRecoveryRequests)
    .set({ status: 'approved', turnId: null })
    .where(
      and(
        eq(aiRecoveryRequests.requesterUserId, p.userId),
        eq(aiRecoveryRequests.threadId, threadId),
        eq(aiRecoveryRequests.turnId, turnId),
        eq(aiRecoveryRequests.status, 'used'),
      ),
    )
    .run();
}
