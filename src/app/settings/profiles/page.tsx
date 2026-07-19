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
    <>
      <header className="recipe-page settings-header">
        <div className="recipe-header">
          <Link className="wordmark" href="/">
            <span className="wordmark-mark" aria-hidden="true" />
            <span>Our Recipes</span>
          </Link>
          <Link className="quiet-link" href="/">
            Back to kitchen
          </Link>
        </div>
      </header>
      <ProfileSettings initialProfiles={state.profiles} activeProfileId={actor.profileId} />
    </>
  );
}
