import 'server-only';
import { randomUUID, createHash } from 'node:crypto';
import { and, eq, isNull, ne, or } from 'drizzle-orm';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import {
  taskPreferences,
  aiJobs,
  aiChatThreads,
  aiActionProposals,
  user,
  profileAuthLinks,
  profiles,
} from '@/lib/db/schema';
import { taskSettingsSchema } from '@/lib/domain/task-settings';
import { localIsoDate, addLocalDateDays } from '@/lib/domain/local-date';
import { aiMealPlanGenerationRequestSchema } from '@/lib/domain/ai-assistant';
import { generateAiMealPlanProposal } from './ai-meal-plan-service';
import { getAiWorkloadSetting } from './ai-settings-service';
import { captureAiExecutionApproval } from './ai-execution-service';
import { aiApprovedExecutionSchema } from '@/lib/domain/ai-approved-execution';
import { z } from 'zod';
import { normalizeAppRole } from '@/lib/domain/permissions';
import type { RequestPrincipal } from './auth-service';
import { createAiChatPrivacyGuard } from './ai-chat-service';
import { currentAiExecutionContext, withAiExecutionContext } from './ai-execution-context';
function ownerActive(userId: string, profileId: string) {
  return getDatabase()
    .select({ role: user.role, banned: user.banned, archivedAt: profiles.archivedAt })
    .from(user)
    .innerJoin(profileAuthLinks, eq(profileAuthLinks.userId, user.id))
    .innerJoin(profiles, eq(profiles.id, profileAuthLinks.profileId))
    .where(and(eq(user.id, userId), eq(profiles.id, profileId)))
    .get();
}
function scheduledPrincipal(userId: string, profileId: string, role: string): RequestPrincipal {
  const accountRole = normalizeAppRole(role);
  // ownerActive has checked the current account's link to this same profile.
  // This identifies a server-authorized scheduled operation, not a browser session.
  return {
    kind: 'session',
    userId,
    profileId,
    linkedProfileId: profileId,
    role: accountRole,
    accountRole,
    activeProfileRole: accountRole,
    sessionId: null,
    apiKeyId: null,
  };
}
export function enqueueScheduledPlans(now = new Date()) {
  ensureDatabase();
  const db = getDatabase();
  for (const row of db.select().from(taskPreferences).all()) {
    let raw: unknown;
    try {
      raw = JSON.parse(row.settings);
    } catch {
      continue;
    }
    const parsed = taskSettingsSchema.safeParse(raw);
    if (!parsed.success) continue;
    const settings = parsed.data;
    if (!settings.weeklyPlanEnabled || !settings.allowPaidGeneration) continue;
    const owner = ownerActive(row.userId, row.profileId);
    if (!owner || owner.banned || owner.archivedAt || owner.role === 'child') continue;
    const date = localIsoDate(now, settings.timezone);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const hour = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: settings.timezone,
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(now),
    );
    if (weekday !== settings.weekday || hour < settings.hour || row.lastScheduledDate === date)
      continue;
    const start = addLocalDateDays(date, settings.aheadDays);
    const request = aiMealPlanGenerationRequestSchema.parse({
      mode: 'ai',
      startDate: start,
      endDate: addLocalDateDays(start, settings.days - 1),
      mealSlots: settings.mealSlots,
      servings: settings.servings,
      sourceMode: settings.sourceMode,
      occupiedSlotMode: 'keep',
      selectedProfileIds: settings.selectedProfileIds ?? [row.profileId],
      instructions: settings.instructions,
    });
    const setting = getAiWorkloadSetting(row.profileId, 'meal_plan_generation');
    if (!setting.enabled) continue;
    const approvedOptions = captureAiExecutionApproval(row.profileId, 'meal_plan_generation');
    db.transaction((transaction) => {
      const claimed = transaction
        .update(taskPreferences)
        .set({ lastScheduledDate: date })
        .where(
          and(
            eq(taskPreferences.profileId, row.profileId),
            eq(taskPreferences.version, row.version),
            or(
              isNull(taskPreferences.lastScheduledDate),
              ne(taskPreferences.lastScheduledDate, date),
            ),
          ),
        )
        .run();
      if (!claimed.changes) return;
      const id = randomUUID(),
        threadId = randomUUID();
      transaction
        .insert(aiChatThreads)
        .values({
          id: threadId,
          profileId: row.profileId,
          title: `Meal-plan draft · ${start}`,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      // Seed metadata before any evidence/proposal can enter this new thread.
      createAiChatPrivacyGuard({
        profileId: row.profileId,
        threadId,
        principal: scheduledPrincipal(row.userId, row.profileId, owner.role),
      });
      transaction
        .insert(aiJobs)
        .values({
          id,
          profileId: row.profileId,
          threadId,
          kind: 'meal_plan_generation',
          status: 'queued',
          executionMode: 'direct',
          model: setting.model,
          payload: JSON.stringify({ userId: row.userId, request, approvedOptions }),
          sourceDigest: createHash('sha256')
            .update(JSON.stringify({ request, approvedOptions }))
            .digest('hex'),
          attempts: 0,
          nextAttemptAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    });
  }
}
export async function runScheduledPlanJob(job: typeof aiJobs.$inferSelect) {
  const parsed = z
    .object({
      userId: z.string().min(1),
      request: aiMealPlanGenerationRequestSchema,
      approvedOptions: aiApprovedExecutionSchema.refine(
        (value) => value.workload === 'meal_plan_generation',
        'The reviewed workload must match this scheduled plan.',
      ),
    })
    .strict()
    .safeParse(JSON.parse(job.payload));
  if (!parsed.success)
    throw new Error(
      'This scheduled task has no valid approved configuration. Review and schedule a new draft.',
    );
  const payload = parsed.data;
  if (payload.approvedOptions.model !== job.model)
    throw new Error('The scheduled configuration changed. Review and schedule a new draft.');
  const owner = ownerActive(payload.userId, job.profileId);
  const row = getDatabase()
    .select()
    .from(taskPreferences)
    .where(eq(taskPreferences.profileId, job.profileId))
    .get();
  const settings = row ? taskSettingsSchema.parse(JSON.parse(row.settings)) : null;
  if (
    !owner ||
    owner.banned ||
    owner.archivedAt ||
    owner.role === 'child' ||
    !settings?.weeklyPlanEnabled ||
    !settings.allowPaidGeneration
  )
    throw new Error('Automation authorization is no longer active.');
  if (!job.threadId) throw new Error('The scheduled conversation is no longer available.');
  const principal = scheduledPrincipal(payload.userId, job.profileId, owner.role);
  const assertPrivacy = createAiChatPrivacyGuard({
    profileId: job.profileId,
    threadId: job.threadId,
    principal,
  });
  const parentAssert = currentAiExecutionContext()?.assertOwned;
  const result = await withAiExecutionContext(
    {
      assertOwned: () => {
        parentAssert?.();
        assertPrivacy();
      },
    },
    () =>
      generateAiMealPlanProposal({
        actorProfileId: job.profileId,
        principal,
        threadId: job.threadId,
        request: payload.request,
        approvedOptions: payload.approvedOptions,
      }),
  );
  const completed = getDatabase()
    .update(aiJobs)
    .set({
      status: 'completed',
      actionId: result.proposal.id,
      result: JSON.stringify({ actionId: result.proposal.id }),
      completedAt: new Date(),
      updatedAt: new Date(),
      leaseToken: null,
      leaseExpiresAt: null,
    })
    .where(
      and(
        eq(aiJobs.id, job.id),
        eq(aiJobs.status, 'running'),
        eq(aiJobs.leaseToken, job.leaseToken!),
      ),
    )
    .run();
  if (!completed.changes)
    getDatabase()
      .update(aiActionProposals)
      .set({ status: 'cancelled', decidedAt: new Date() })
      .where(
        and(eq(aiActionProposals.id, result.proposal.id), eq(aiActionProposals.status, 'pending')),
      )
      .run();
}
