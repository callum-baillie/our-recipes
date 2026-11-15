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
      {expiredWaste && expiredWaste.batches > 0 && (
        <section className="pantry-waste-note" aria-label="Expired pantry waste">
          <div>
            <h2>Discarded as expired</h2>
            <p>
              {expiredWaste.batches} {expiredWaste.batches === 1 ? 'batch' : 'batches'}
              {expiredWaste.quantities.length > 0 &&
                ` · ${expiredWaste.quantities
                  .map((item) => `${Number(item.quantity.toFixed(3))} ${item.unit}`)
                  .join(' · ')}`}
            </p>
          </div>
          <small>
            Counts items explicitly marked expired. Ordinary removals and reversed disposals are
            excluded.
          </small>
        </section>
      )}
    </main>
  );
}
