import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { cookies, headers } from 'next/headers';

import { PantryManager } from '@/components/pantry-manager';
import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { ensureDefaultPantryLocations } from '@/lib/services/pantry-service';
import { getAppPreferences } from '@/lib/services/app-preferences-service';

export const dynamic = 'force-dynamic';

export default async function PantryPage() {
  const principal = await getAuthenticatedSessionPrincipal(
    new Request('http://localhost/pantry', { headers: await headers() }),
  );
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (actor.profileId) ensureDefaultPantryLocations(actor.profileId);
  const preferences = getAppPreferences().pantry;

  return (
    <main>
      <PantryManager
        key={`${principal?.userId}:${actor.profileId}`}
        profileId={actor.profileId ?? 'none'}
        accountId={principal?.userId ?? 'signed-out'}
        canEdit={Boolean(actor.profileId)}
        initialPreferences={preferences}
      />
    </main>
  );
}
