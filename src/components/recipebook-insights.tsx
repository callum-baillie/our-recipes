'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Clock3, Globe2 } from 'lucide-react';
import { parseRecipeTaxonomyValues } from '@/lib/domain/recipe';

type InsightRecipe = {
  category: string;
  cuisine: string;
  prepMinutes: number;
  cookMinutes: number;
  restMinutes: number;
};
function frequencies(recipes: InsightRecipe[], field: 'category' | 'cuisine') {
  const counts = new Map<string, { label: string; count: number }>();
  for (const recipe of recipes)
    for (const label of new Set(
      parseRecipeTaxonomyValues(recipe[field])
        .map((value) => value.trim())
        .filter(Boolean),
    )) {
      const key = label.toLocaleLowerCase();
      const entry = counts.get(key) ?? { label, count: 0 };
      entry.count++;
      counts.set(key, entry);
    }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
export function RecipebookInsights({ recipes }: { recipes: InsightRecipe[] }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    // Also catches imports and assistant changes made while this page remains open.
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [router]);
  const meals = frequencies(recipes, 'category');
  const cuisines = frequencies(recipes, 'cuisine');
  const quick = recipes.filter((r) => {
    const minutes = r.prepMinutes + r.cookMinutes + r.restMinutes;
    return minutes > 0 && minutes <= 30;
  }).length;
  return (
    <section className="recipebook-insights" aria-labelledby="recipebook-insights-title">
      <header>
        <h2 id="recipebook-insights-title">Recipebook insights</h2>
        <p>Across your active recipebook · updates as recipes change</p>
      </header>
      <div className="recipebook-insight-grid">
        <div>
          <BookOpen size={20} />
          <strong>{recipes.length}</strong>
          <span>saved recipes</span>
          <small>{quick} ready in 30 minutes or less · based on recorded times</small>
        </div>
        <div>
          <Clock3 size={20} />
          <h3>Meal types</h3>
          {meals.length ? (
            <ul>
              {meals.slice(0, 6).map((item) => (
                <li key={item.label}>
                  <span>{item.label}</span>
                  <b>{item.count}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p>Add meal categories to discover your collection’s balance.</p>
          )}
          <small>Recipes can belong to more than one meal type.</small>
        </div>
        <div>
          <Globe2 size={20} />
          <h3>Most collected cuisines</h3>
          {cuisines.length ? (
            <ul>
              {cuisines.slice(0, 5).map((item) => (
                <li key={item.label}>
                  <span>{item.label}</span>
                  <b>{item.count}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p>Add cuisines to see the flavors you return to.</p>
          )}
          <small>
            {cuisines.length} cuisines · {recipes.filter((r) => !r.cuisine.trim()).length} recipes
            without a cuisine
          </small>
        </div>
      </div>
    </section>
  );
}
