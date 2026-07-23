import { cookies } from 'next/headers';
import Link from 'next/link';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { ProfileSettings } from '@/components/profile-settings';
import { getHouseholdState } from '@/lib/services/household-service';

export const dynamic = 'force-dynamic';

export default async function ProfileSettingsPage() {
  const state = getHouseholdState(true);
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  return (
    <main className="recipe-page settings-hub">
      <section className="settings-intro settings-hub-intro">
        <Link className="quiet-link" href="/settings">
          ← All settings
        </Link>
        <p className="eyebrow">PROFILE SETTINGS</p>
        <h1>Make the app feel right for each person.</h1>
        <p>Manage names, avatars, colors, units, locale, time zone, and archived profiles.</p>
      </section>
      <ProfileSettings initialProfiles={state.profiles} activeProfileId={actor.profileId} />
    </main>
  );
}
