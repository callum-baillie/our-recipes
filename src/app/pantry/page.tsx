import { cookies } from 'next/headers';

import { PantryManager } from '@/components/pantry-manager';
import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { ensureDefaultPantryLocations } from '@/lib/services/pantry-service';
import { getAppPreferences } from '@/lib/services/app-preferences-service';

export const dynamic = 'force-dynamic';

export default async function PantryPage() {
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (actor.profileId) ensureDefaultPantryLocations(actor.profileId);
  const preferences = getAppPreferences().pantry;

  return (
    <main>
      <PantryManager canEdit={Boolean(actor.profileId)} initialPreferences={preferences} />
    </main>
  );
}
