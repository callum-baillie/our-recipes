import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { PantryAddFlow, type AddMode } from '@/components/pantry-add-flow';
import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { ensureDefaultPantryLocations, getPantryDashboard } from '@/lib/services/pantry-service';
import { scannerStationList } from '@/lib/services/scanner-station-service';

export const dynamic = 'force-dynamic';

const MODES: AddMode[] = ['scan', 'search', 'manual'];

export default async function AddToPantryPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const principal = await getAuthenticatedSessionPrincipal(
    new Request('http://localhost/pantry/add', { headers: await headers() }),
  );
  if (!principal) redirect('/sign-in');
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (actor.profileId) ensureDefaultPantryLocations(actor.profileId);
  const pantry = getPantryDashboard({ q: '', view: 'all', sort: 'name', includeInactive: false });
  const { mode } = await searchParams;

  return (
    <PantryAddFlow
      accountId={principal.userId}
      profileId={actor.profileId ?? 'none'}
      canEdit={Boolean(actor.profileId) && principal.role !== 'child'}
      locations={pantry.locations
        .filter((location) => !location.archivedAt)
        .map(({ id, path, storageType }) => ({ id, path, storageType }))}
      products={pantry.products
        .filter((product) => !product.archivedAt)
        .map(
          ({
            id,
            displayName,
            brand,
            defaultInventoryUnit,
            defaultPackageAmount,
            defaultPackageUnit,
          }) => ({
            id,
            displayName,
            brand,
            defaultInventoryUnit,
            defaultPackageAmount,
            defaultPackageUnit,
          }),
        )}
      stations={scannerStationList(principal).map(({ id, name }) => ({ id, name }))}
      // Older links used a separate Handheld Scanner tab; it is part of Scan now.
      initialMode={MODES.find((value) => value === mode) ?? 'scan'}
    />
  );
}
