import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { cookies, headers } from 'next/headers';

import { PantryManager } from '@/components/pantry-manager';
import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import {
  ensureDefaultPantryLocations,
  getExpiredPantryWasteMetrics,
} from '@/lib/services/pantry-service';
import { getAppPreferences } from '@/lib/services/app-preferences-service';

export const dynamic = 'force-dynamic';

export default async function PantryPage() {
  const principal = await getAuthenticatedSessionPrincipal(
    new Request('http://localhost/pantry', { headers: await headers() }),
  );
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (actor.profileId) ensureDefaultPantryLocations(actor.profileId);
  const preferences = getAppPreferences().pantry;
  const expiredWaste = principal ? getExpiredPantryWasteMetrics() : null;

  return (
    <main>
      <PantryManager
        key={`${principal?.userId}:${actor.profileId}`}
        profileId={actor.profileId ?? 'none'}
        accountId={principal?.userId ?? 'signed-out'}
        canEdit={Boolean(actor.profileId)}
        initialPreferences={preferences}
      />
      {expiredWaste && (
        <section className="settings-card" aria-label="Expired pantry waste">
          <h2>Expired items</h2>
          <p>{expiredWaste.batches} batches discarded as expired.</p>
          {expiredWaste.quantities.length > 0 && (
            <p>
              {expiredWaste.quantities
                .map((item) => `${Number(item.quantity.toFixed(3))} ${item.unit}`)
                .join(' · ')}
            </p>
          )}
          <p>
            Tracks items explicitly marked expired. Ordinary removals and reversed disposals are
            excluded.
          </p>
        </section>
      )}
    </main>
  );
}
