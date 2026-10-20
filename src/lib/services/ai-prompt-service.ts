import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, lt } from 'drizzle-orm';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import { aiPromptVersions, user } from '@/lib/db/schema';
import { aiWorkloadSchema, type AiWorkload } from '@/lib/domain/ai-assistant';
import {
  AI_PROMPT_DEFINITIONS,
  PROMPT_CONTRACT_VERSION,
  aiPromptUpdateSchema,
  renderTaskGuidance,
  type AiPromptSnapshot,
} from '@/lib/domain/ai-prompts';
import { DecisionError } from '@/lib/providers/decisions-provider';
import type { RequestPrincipal } from './auth-service';

function snapshot(row: typeof aiPromptVersions.$inferSelect): AiPromptSnapshot {
  return {
    workload: aiWorkloadSchema.parse(row.workload),
    version: row.version,
    template: row.template,
    changeNote: row.changeNote,
    createdAt: row.createdAt.toISOString(),
  };
}
export function getPromptHistory(workload: AiWorkload, beforeVersion?: number): AiPromptSnapshot[] {
  ensureDatabase();
  return getDatabase()
    .select()
    .from(aiPromptVersions)
    .where(
      and(
        eq(aiPromptVersions.workload, workload),
        beforeVersion === undefined ? undefined : lt(aiPromptVersions.version, beforeVersion),
      ),
    )
    .orderBy(desc(aiPromptVersions.version))
    .limit(10)
    .all()
    .map(snapshot);
}
export function getEffectivePrompt(workload: AiWorkload) {
  ensureDatabase();
  const row = getDatabase()
    .select()
    .from(aiPromptVersions)
    .where(eq(aiPromptVersions.workload, workload))
    .orderBy(desc(aiPromptVersions.version))
    .limit(1)
    .get();
  const value: AiPromptSnapshot = row
    ? snapshot(row)
    : {
        workload,
        version: 0,
        template: AI_PROMPT_DEFINITIONS[workload].defaultTemplate,
        changeNote: 'Built-in guidance',
        createdAt: null,
      };
  return {
    ...value,
    promptGuidance: renderTaskGuidance(workload, value.template),
    promptVersion: `${PROMPT_CONTRACT_VERSION}:${workload}:${value.version}`,
  };
}
export function getPromptAdministration() {
  return aiWorkloadSchema.options.map((workload) => ({
    ...getEffectivePrompt(workload),
    history: getPromptHistory(workload),
  }));
}
export function savePrompt(p: RequestPrincipal, raw: unknown) {
  ensureDatabase();
  // Administrative configuration never grants access to private conversation or diary content.
  const currentAccount = getDatabase().select().from(user).where(eq(user.id, p.userId)).get();
  if (p.accountRole !== 'admin' || currentAccount?.role !== 'admin' || currentAccount.banned)
    throw new DecisionError('An installation administrator must save prompt guidance.', 403);
  const input = aiPromptUpdateSchema.parse(raw);
  return getDatabase().transaction((tx) => {
    const current = getEffectivePrompt(input.workload);
    if (current.version !== input.expectedVersion)
      throw new DecisionError(
        'This prompt changed. Compare the current version with your draft before saving.',
        409,
      );
    tx.insert(aiPromptVersions)
      .values({
        id: randomUUID(),
        workload: input.workload,
        version: current.version + 1,
        template: input.template,
        changeNote: input.changeNote,
        updatedByUserId: p.userId,
        createdAt: new Date(),
      })
      .run();
    return getEffectivePrompt(input.workload);
  });
}
