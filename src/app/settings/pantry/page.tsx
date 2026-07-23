import Link from 'next/link';

import { PantryPreferencesForm } from '@/components/app-preferences-forms';
import { getAppPreferences } from '@/lib/services/app-preferences-service';

export const dynamic = 'force-dynamic';

export default function PantrySettingsPage() {
  return (
    <main className="recipe-page settings-hub">
      <section className="settings-intro settings-hub-intro">
        <Link className="quiet-link" href="/settings">
          ← All settings
        </Link>
        <p className="eyebrow">PANTRY SETTINGS</p>
        <h1>Open Pantry on the stock that matters.</h1>
        <p>These shared display defaults apply at the start of each Pantry visit.</p>
      </section>
      <PantryPreferencesForm initial={getAppPreferences().pantry} />
    </main>
  );
}
