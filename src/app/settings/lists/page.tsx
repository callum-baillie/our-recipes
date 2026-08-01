import { ListSettingsManager } from '@/components/list-settings-manager';
import { SettingsPageHeader } from '@/components/settings-page-header';
import { getListSettingsWorkspace } from '@/lib/services/list-settings-service';

export const dynamic = 'force-dynamic';

export default function ListSettingsPage() {
  const workspace = getListSettingsWorkspace();
  return (
    <main className="recipe-page settings-hub">
      <SettingsPageHeader
        eyebrow="LIST SETTINGS"
        title="Shopping, in your order."
        description="Choose how lists behave, then map each supermarket in the order you walk it."
      />
      <ListSettingsManager initialWorkspace={workspace} />
    </main>
  );
}
