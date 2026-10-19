import { headers } from 'next/headers';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';

import { AiSettingsForm } from '@/components/ai-settings-form';
import { SettingsPageHeader } from '@/components/settings-page-header';
import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { AiRuntimeSettingsForm } from '@/components/ai-runtime-settings-form';
import { getHouseholdState } from '@/lib/services/household-service';
import { getPersonalAiSettings } from '@/lib/services/ai-settings-service';

export const dynamic = 'force-dynamic';

export default async function AiSettingsPage() {
  const principal = await getAuthenticatedSessionPrincipal(
    new Request('http://localhost/account/ai', { headers: await headers() }),
  );
  if (!principal)
    return (
      <main className="recipe-page settings-hub">
        <SettingsPageHeader
          eyebrow="AI SETTINGS"
          title="Choose a household profile first."
          description="AI privacy choices belong to each profile."
        />
        <Link href="/settings/profiles">Open profile settings</Link>
      </main>
    );
  const data = getPersonalAiSettings(principal.userId, principal.linkedProfileId);
  const personName =
    getHouseholdState().profiles.find((profile) => profile.id === principal.linkedProfileId)
      ?.displayName ?? 'Your profile';
  return (
    <main className="recipe-page settings-hub">
      <SettingsPageHeader
        eyebrow="AI SETTINGS"
        title="AI preferences"
        description={`${personName} · Defaults and privacy for your signed-in account. Switching the viewed household person does not retarget these forms.`}
        icon={<Sparkles size={16} aria-hidden="true" />}
        aside={
          <Link className="text-button" href="/assist">
            Saved suggestions & corrections
          </Link>
        }
      />

      <nav className="settings-section-index" aria-label="AI preference sections">
        <a href="#ai-defaults">My AI defaults</a>
        <a href="#ai-privacy">Privacy and summaries</a>
      </nav>
      <AiRuntimeSettingsForm
        global={data.global}
        workloads={data.workloads}
        personal={data.account.preferences}
        enabled={data.account.enabled}
        version={data.account.version}
      />
      <AiSettingsForm initialSettings={data} privacyOnly personName={personName} />
    </main>
  );
}
