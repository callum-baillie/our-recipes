import { cookies } from 'next/headers';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { ProfileSettings } from '@/components/profile-settings';
import { SettingsPageHeader } from '@/components/settings-page-header';
import { getHouseholdState } from '@/lib/services/household-service';
import { listProfileAccessAccounts } from '@/lib/services/auth-service';
import { listHouseholdGuardianAssignments } from '@/lib/services/nutrition-profile-service';

export const dynamic = 'force-dynamic';

export default async function ProfileSettingsPage() {
  const state = getHouseholdState(true);
  const accessAccounts = listProfileAccessAccounts();
  const accessByProfile = new Map(accessAccounts.map((account) => [account.profileId, account]));
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  return (
    <main className="recipe-page settings-hub">
      <SettingsPageHeader
        eyebrow="PROFILE SETTINGS"
        title="Make the app feel right for each person."
        description="Manage names, avatars, colors, units, locale, time zone, and archived profiles."
      />
      <ProfileSettings
        initialProfiles={state.profiles.map((profile) => ({
          ...profile,
          role: accessByProfile.get(profile.id)?.role ?? 'parent',
          isLastAdmin: accessByProfile.get(profile.id)?.isLastAdmin ?? false,
        }))}
        initialGuardians={listHouseholdGuardianAssignments()}
        activeProfileId={actor.profileId}
      />
    </main>
  );
}
