import Link from 'next/link';

import { ListSettingsManager } from '@/components/list-settings-manager';
import { getListSettingsWorkspace } from '@/lib/services/list-settings-service';

export const dynamic = 'force-dynamic';

export default function ListSettingsPage() {
  const workspace = getListSettingsWorkspace();
  return (
    <main className="recipe-page settings-hub">
      <section className="settings-intro settings-hub-intro list-settings-intro">
        <p className="eyebrow">LIST SETTINGS</p>
        <h1>Shopping, in your order.</h1>
        <p>Choose how lists behave, then map each supermarket in the order you walk it.</p>
        <Link className="quiet-link" href="/settings">
          ← All settings
        </Link>
      </section>
      <ListSettingsManager initialWorkspace={workspace} />
    </main>
  );
}
