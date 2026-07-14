import Link from 'next/link';

import { MealPlanner } from '@/components/meal-planner';
import { listPlannedMeals } from '@/lib/services/planning-service';
import { listRecipes } from '@/lib/services/recipe-service';
import { isoDateSchema } from '@/lib/domain/planning';

export const dynamic = 'force-dynamic';

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function weekRange(candidate?: string) {
  const today = candidate ? new Date(`${candidate}T12:00:00`) : new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    weekStart: monday.toISOString().slice(0, 10),
    weekEnd: sunday.toISOString().slice(0, 10),
  };
}

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const selected = (await searchParams).week;
  const { weekStart, weekEnd } = weekRange(
    isoDateSchema.safeParse(selected).success ? selected : undefined,
  );
  return (
    <main className="recipe-page">
      <header className="recipe-header">
        <Link className="wordmark" href="/">
          <span className="wordmark-mark">✦</span>
          <span>Our Recipes</span>
        </Link>
        <Link className="quiet-link" href="/lists">
          Shopping lists
        </Link>
      </header>
      <section className="planner-heading">
        <p className="eyebrow">MEAL PLANNING</p>
        <h1>Make the week feel lighter.</h1>
        <p className="muted">
          Plan recipes you already trust, then turn them into a list you can adjust.
        </p>
      </section>
      <MealPlanner
        weekStart={weekStart}
        weekEnd={weekEnd}
        meals={listPlannedMeals(weekStart, weekEnd)}
        recipes={listRecipes()}
        previousWeekStart={addDays(weekStart, -7)}
        nextWeekStart={addDays(weekStart, 7)}
      />
    </main>
  );
}
