import { PantryPreferencesForm } from '@/components/app-preferences-forms';
import { SettingsPageHeader } from '@/components/settings-page-header';
import { getAppPreferences } from '@/lib/services/app-preferences-service';

export const dynamic = 'force-dynamic';

export default function PantrySettingsPage() {
  return (
    <main className="recipe-page settings-hub">
      <SettingsPageHeader
        eyebrow="PANTRY SETTINGS"
        title="Open Pantry on the stock that matters."
        description="These shared display defaults apply at the start of each Pantry visit."
      />
      <PantryPreferencesForm initial={getAppPreferences().pantry} />
    </main>
  );
}
