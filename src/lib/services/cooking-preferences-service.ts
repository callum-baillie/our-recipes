import 'server-only';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { profiles } from '@/lib/db/schema';
import { getDatabase } from '@/lib/db/client';
import {
  cookingPreferencesSchema,
  cookingPreferencesUpdateSchema,
} from '@/lib/domain/cooking-preferences';
import { authorizeKitchen } from './kitchen-inventory-service';
import type { RequestPrincipal } from './auth-service';
import { DecisionError } from '@/lib/providers/decisions-provider';
export function readCookingPreferences(p: RequestPrincipal) {
  if (p.kind !== 'session')
    throw new DecisionError(
      'Use your signed-in account to read personal cooking preferences.',
      403,
    );
  authorizeKitchen(p, 'personal.read');
  const profile = getDatabase()
    .select()
    .from(profiles)
    .where(eq(profiles.id, p.linkedProfileId))
    .get()!;
  const stored = profile.goalContext.cookingPreferences ?? null;
  return {
    subject: 'Your signed-in account',
    preferences: cookingPreferencesSchema.parse(stored ?? {}),
    revision: createHash('sha256').update(JSON.stringify(stored)).digest('hex'),
  };
}
export function saveCookingPreferences(p: RequestPrincipal, raw: unknown) {
  authorizeKitchen(p, 'personal.update');
  if (p.kind !== 'session')
    throw new DecisionError(
      'Use your signed-in account to save personal cooking preferences.',
      403,
    );
  const input = cookingPreferencesUpdateSchema.parse(raw);
  return getDatabase().transaction((tx) => {
    if (readCookingPreferences(p).revision !== input.expectedRevision)
      throw new DecisionError(
        'Your cooking preferences changed. Keep your draft and review the latest values.',
        409,
      );
    const profile = tx.select().from(profiles).where(eq(profiles.id, p.linkedProfileId)).get()!;
    tx.update(profiles)
      .set({
        goalContext: { ...profile.goalContext, cookingPreferences: input.preferences },
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, p.linkedProfileId))
      .run();
    return readCookingPreferences(p);
  });
}
