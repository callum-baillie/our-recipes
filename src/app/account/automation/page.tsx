import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { getTaskSettings } from '@/lib/services/task-settings-service';
import { listProfiles } from '@/lib/services/household-service';
import { TaskSettings } from '@/components/task-settings';
export const dynamic = 'force-dynamic';
export default async function AutomationPage() {
  const principal = await getAuthenticatedSessionPrincipal(
    new Request('http://localhost/account/automation', { headers: await headers() }),
  );
  if (!principal) redirect('/sign-in');
  return (
    <TaskSettings
      initial={getTaskSettings(principal.linkedProfileId)}
      profileId={principal.linkedProfileId}
      canEdit={principal.role !== 'child'}
      profiles={listProfiles().map((profile) => ({ id: profile.id, name: profile.displayName }))}
    />
  );
}
