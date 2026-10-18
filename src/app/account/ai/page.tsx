import { headers } from 'next/headers';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';

import { AiSettingsForm } from '@/components/ai-settings-form';
import { SettingsPageHeader } from '@/components/settings-page-header';
import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { AiRuntimeSettingsForm } from '@/components/ai-runtime-settings-form';
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
  return (
    <main className="recipe-page settings-hub">
      <SettingsPageHeader
        eyebrow="AI SETTINGS"
        title="AI preferences"
        description="Choose a model for each task and decide which data this profile may send to OpenAI."
        icon={<Sparkles size={16} aria-hidden="true" />}
        aside={
          <Link className="text-button" href="/assist">
            Saved suggestions & corrections
          </Link>
        }
      />

      <AiRuntimeSettingsForm
        global={data.global}
        workloads={data.workloads}
        personal={data.account.preferences}
        enabled={data.account.enabled}
        version={data.account.version}
      />
      <AiSettingsForm initialSettings={data} privacyOnly />
    </main>
  );
}
