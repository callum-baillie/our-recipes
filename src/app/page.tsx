import { cookies } from 'next/headers';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { HouseholdHome } from '@/components/household-home';
import { SetupWizard } from '@/components/setup-wizard';
import { getHouseholdState } from '@/lib/services/household-service';
import { ensureBackupScheduler } from '@/lib/services/backup-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function HomePage() {
  ensureBackupScheduler();
  const state = getHouseholdState();
  if (!state.household) return <SetupWizard />;

  const cookieStore = await cookies();
  const actor = getActorContext(cookieStore.get(ACTIVE_PROFILE_COOKIE)?.value);
  return <HouseholdHome {...state} activeProfileId={actor.profileId} />;
}
