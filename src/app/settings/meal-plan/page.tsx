import Link from 'next/link';

import { MealPlanPreferencesForm } from '@/components/app-preferences-forms';
import { getAppPreferences } from '@/lib/services/app-preferences-service';

export const dynamic = 'force-dynamic';

export default function MealPlanSettingsPage() {
  return (
    <main className="recipe-page settings-hub">
      <section className="settings-intro settings-hub-intro">
        <Link className="quiet-link" href="/settings">
          ← All settings
        </Link>
        <p className="eyebrow">MEALPLAN SETTINGS</p>
        <h1>Start every plan with the right shape.</h1>
        <p>Choose the shared week, range, and meal defaults used when opening Planner.</p>
      </section>
      <MealPlanPreferencesForm initial={getAppPreferences().mealPlan} />
    </main>
  );
}
