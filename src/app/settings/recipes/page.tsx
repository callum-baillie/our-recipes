import { RecipePreferencesForm } from '@/components/app-preferences-forms';
import { SettingsPageHeader } from '@/components/settings-page-header';
import { getAppPreferences } from '@/lib/services/app-preferences-service';

export const dynamic = 'force-dynamic';

export default function RecipeSettingsPage() {
  return (
    <main className="recipe-page settings-hub">
      <SettingsPageHeader
        eyebrow="RECIPE SETTINGS"
        title="Set up the cookbook for everyday use."
        description="Shared defaults keep the library and new recipe editor predictable for everyone."
      />
      <RecipePreferencesForm initial={getAppPreferences().recipes} />
    </main>
  );
}
