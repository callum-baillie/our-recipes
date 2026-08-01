import { MealPlanPreferencesForm } from '@/components/app-preferences-forms';
import { SettingsPageHeader } from '@/components/settings-page-header';
import { getAppPreferences } from '@/lib/services/app-preferences-service';

export const dynamic = 'force-dynamic';

export default function MealPlanSettingsPage() {
  return (
    <main className="recipe-page settings-hub">
      <SettingsPageHeader
        eyebrow="MEAL PLAN SETTINGS"
        title="Start every plan with the right shape."
        description="Choose the shared week, range, and meal defaults used when opening Planner."
      />
      <MealPlanPreferencesForm initial={getAppPreferences().mealPlan} />
    </main>
  );
}
