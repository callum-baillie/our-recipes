import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { integrationState } from '@/lib/services/integration-service';
import { IntegrationsManager } from '@/components/integrations-manager';
import { SettingsPageHeader } from '@/components/settings-page-header';
export const dynamic = 'force-dynamic';
export default async function IntegrationsPage() {
  const principal = await getAuthenticatedSessionPrincipal(
    new Request('http://localhost/settings/integrations', { headers: await headers() }),
  );
  if (!principal) redirect('/sign-in');
  return (
    <main className="recipe-page">
      <SettingsPageHeader
        eyebrow="INTEGRATIONS"
        title="Your connected apps"
        description="Bring your measurements into Bòrd automatically. Manage connections for your signed-in account, choose who each scale profile belongs to, and set a sync schedule."
      />
      <IntegrationsManager initial={integrationState(principal)} />
    </main>
  );
}
