import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { getHouseholdState } from '@/lib/services/household-service';
import { PersonalProfileSettings } from '@/components/personal-profile-settings';
import { AppearanceSettings } from '@/components/theme-toggle';
import { SettingsPageHeader } from '@/components/settings-page-header';
export const dynamic = 'force-dynamic';
export default async function AccountPage() {
  const principal = await getAuthenticatedSessionPrincipal(
    new Request('http://localhost/account', { headers: await headers() }),
  );
  if (!principal) redirect('/sign-in');
  const profile = getHouseholdState().profiles.find((p) => p.id === principal.linkedProfileId);
  return (
    <main className="recipe-page settings-hub">
      <SettingsPageHeader
        eyebrow="MY PROFILE"
        title="Your preferences"
        description="Manage your own profile and the way Bòrd looks on this device."
      />
      {profile && (
        <PersonalProfileSettings
          profile={{ ...profile, role: principal.role, isLastAdmin: false }}
        />
      )}
      <AppearanceSettings />
    </main>
  );
}
