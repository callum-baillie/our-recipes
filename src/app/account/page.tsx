import { appRoleCan } from '@/lib/domain/permissions';
import { getAiReadiness } from '@/lib/services/ai-readiness-service';
import { KitchenInterview } from '@/components/kitchen-interview';
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
      {profile && (
        <KitchenInterview
          aiEnabled={getAiReadiness().enabled}
          profile={{ ...profile, role: principal.role, isLastAdmin: false }}
        />
      )}
      {appRoleCan(principal.accountRole, 'shared.update') &&
        appRoleCan(principal.role, 'shared.update') && (
          <section className="settings-card">
            <h2>Your household’s kitchen context</h2>
            <p>
              Food preferences help with shared meals. Each member’s AI sharing settings still
              control what the assistant can read.
            </p>
            {getHouseholdState()
              .profiles.filter(
                (member) =>
                  member.id !== principal.linkedProfileId && member.goalContext.kitchenInterview,
              )
              .map((member) => (
                <details key={member.id}>
                  <summary>{member.displayName}</summary>
                  <dl>
                    {Object.entries(member.goalContext.kitchenInterview!).map(([key, value]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd>{value || 'Not answered'}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              ))}
          </section>
        )}
      <AppearanceSettings />
    </main>
  );
}
