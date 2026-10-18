import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { AiRuntimeSettingsForm } from '@/components/ai-runtime-settings-form';
import { SettingsPageHeader } from '@/components/settings-page-header';
import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { getGlobalAiSettings } from '@/lib/services/ai-settings-service';
export const dynamic = 'force-dynamic';
export default async function GlobalAiPage() {
  const principal = await getAuthenticatedSessionPrincipal(
    new Request('http://localhost/settings/ai', { headers: await headers() }),
  );
  if (!principal || principal.accountRole !== 'admin') notFound();
  const data = getGlobalAiSettings(principal.linkedProfileId);
  return (
    <main className="recipe-page settings-hub">
      <SettingsPageHeader
        eyebrow="AI SETTINGS"
        title="Global AI settings"
        description="Manage models, processing defaults, generation limits, and account access."
      />
      <AiRuntimeSettingsForm
        global={data.settings}
        workloads={data.workloads}
        version={data.version}
        accounts={data.users}
      />
    </main>
  );
}
