import Link from 'next/link';

import { RecipePreferencesForm } from '@/components/app-preferences-forms';
import { getAppPreferences } from '@/lib/services/app-preferences-service';

export const dynamic = 'force-dynamic';

export default function RecipeSettingsPage() {
  return (
    <main className="recipe-page settings-hub">
      <section className="settings-intro settings-hub-intro">
        <Link className="quiet-link" href="/settings">
          ← All settings
        </Link>
        <p className="eyebrow">RECIPE SETTINGS</p>
        <h1>Set up the cookbook for everyday use.</h1>
        <p>Shared defaults keep the library and new recipe editor predictable for everyone.</p>
      </section>
      <RecipePreferencesForm initial={getAppPreferences().recipes} />
    </main>
  );
}
