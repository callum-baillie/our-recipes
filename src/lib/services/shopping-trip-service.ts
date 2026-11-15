import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import { shoppingTrips } from '@/lib/db/schema';
import { shoppingTripSchema } from '@/lib/domain/shopping-trips';
import type { RequestPrincipal } from './auth-service';
export function listShoppingTrips(p: RequestPrincipal) {
  ensureDatabase();
  return getDatabase()
    .select()
    .from(shoppingTrips)
    .where(and(eq(shoppingTrips.ownerUserId, p.userId), eq(shoppingTrips.profileId, p.profileId)))
    .orderBy(desc(shoppingTrips.occurredOn), desc(shoppingTrips.createdAt))
    .limit(100)
    .all();
}
export function recordShoppingTrip(p: RequestPrincipal, input: unknown) {
  ensureDatabase();
  const value = shoppingTripSchema.parse(input);
  const row = {
    ...value,
    id: randomUUID(),
    ownerUserId: p.userId,
    profileId: p.profileId,
    createdAt: new Date(),
  };
  getDatabase().insert(shoppingTrips).values(row).run();
  return row;
}
