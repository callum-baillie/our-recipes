'use client';

import { X } from 'lucide-react';
import { AppDialog } from './app-dialog';
import styles from './recipe-library-filters.module.css';
import { useRouter, useSearchParams } from 'next/navigation';
import { SearchFacetBar } from './search-facet-bar';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';

type FilterOption = {
  value: string;
  label: string;
};

export type RecipeLibraryFiltersValue = {
  q: string;
  sort: string;
  creator: string;
  tag: string;
  collection: string;
  status: string;
  category: string;
  cuisine: string;
  maxTotalMinutes: number | '';
  favorite: boolean;
  cooked: boolean;
  pantry: string;
  maxCaloriesPerServing: number | '';
  minProteinPerServing: number | '';
  minFiberPerServing: number | '';
  maxSodiumPerServing: number | '';
  minNutritionCompleteness: number | '';
  supportsNutrient: string;
  nutritionFields: string[];
};

type RecipeLibraryFiltersProps = {
  filters: RecipeLibraryFiltersValue;
  profiles: FilterOption[];
  tags: string[];
  collections: FilterOption[];
  facets: Array<{ key: string; label: string; field: string; value: string; count: number }>;
};

export function RecipeLibraryFilters({
  filters,
  profiles,
  tags,
  collections,
  facets,
}: RecipeLibraryFiltersProps) {
  const [open, setOpen] = useState(false);
  const [groupValues, setGroupValues] = useState<Record<string, unknown>>(filters);
  const router = useRouter();
  const search = useSearchParams();
  const [draft, setDraft] = useState(filters.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const sync = () => setDraft(new URLSearchParams(window.location.search).get('q') ?? '');
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function resetFilters() {
    if (timer.current) clearTimeout(timer.current);
    setDraft('');
    setOpen(false);
  }
  function navigate(patch: Record<string, string | null>) {
    if (timer.current) clearTimeout(timer.current);
    const params = new URLSearchParams(search.toString());
    params.delete('page');
    params.set('q', draft);
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`/recipes?${params}`, { scroll: false });
  }
  const hasActiveFilters = Boolean(
    filters.q ||
    filters.tag ||
    filters.sort !== 'recently-updated' ||
    filters.creator ||
    filters.collection ||
    filters.status !== 'active' ||
    filters.category ||
    filters.cuisine ||
    filters.maxTotalMinutes ||
    filters.favorite ||
    filters.cooked ||
    filters.pantry ||
    filters.maxCaloriesPerServing !== '' ||
    filters.minProteinPerServing !== '' ||
    filters.minFiberPerServing !== '' ||
    filters.maxSodiumPerServing !== '' ||
    filters.minNutritionCompleteness !== '' ||
    filters.supportsNutrient ||
    filters.nutritionFields.join(',') !== 'energy_kcal,protein,fiber',
  );

  return (
    <>
      <SearchFacetBar
        label="Search recipes"
        placeholder="Search recipes or ingredients"
        query={draft}
        onQueryChange={(value) => {
          setDraft(value);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => navigate({ q: value }), 350);
        }}
        onSearch={() => navigate({ q: draft })}
        onAdvanced={() => {
          setGroupValues(filters);
          setOpen(true);
        }}
        advancedActive={hasActiveFilters}
        facets={[
          {
            key: 'all',
            label: 'All recipes',
            active: !filters.category && !filters.cuisine && !filters.tag && !filters.favorite,
          },
          { key: 'favorite', label: 'Favorites', icon: 'heart', active: filters.favorite },
          ...facets.map((facet) => ({
            ...facet,
            label: `${facet.label} · ${facet.field === 'tag' ? 'Tag' : facet.field === 'cuisine' ? 'Cuisine' : 'Category'}`,
            active: filters[facet.field as 'tag' | 'category' | 'cuisine'] === facet.value,
          })),
        ]}
        onFacet={(key) => {
          if (key === 'all')
            return navigate({ category: null, cuisine: null, tag: null, favorite: null });
          if (key === 'favorite') return navigate({ favorite: filters.favorite ? null : 'true' });
          const facet = facets.find((item) => item.key === key);
          if (facet)
            navigate({
              [facet.field]:
                filters[facet.field as 'tag' | 'category' | 'cuisine'] === facet.value
                  ? null
                  : facet.value,
            });
        }}
      />

      {hasActiveFilters ? (
        <div className={styles.activeSummary} aria-label="Active recipe filters">
          {[
            filters.q && `Search: ${filters.q}`,
            filters.tag && `Tag: ${filters.tag}`,
            filters.category && `Category: ${filters.category}`,
            filters.cuisine && `Cuisine: ${filters.cuisine}`,
            filters.creator &&
              `Creator: ${profiles.find((p) => p.value === filters.creator)?.label ?? filters.creator}`,
            filters.collection &&
              `Collection: ${collections.find((c) => c.value === filters.collection)?.label ?? filters.collection}`,
            filters.pantry && `Pantry: ${filters.pantry}`,
            filters.favorite && 'Favorites',
            filters.cooked && 'Cooked by me',
            filters.status !== 'active' && `Status: ${filters.status}`,
            filters.maxTotalMinutes && `Time ≤ ${filters.maxTotalMinutes} min`,
            filters.maxCaloriesPerServing !== '' &&
              `Calories ≤ ${filters.maxCaloriesPerServing} kcal`,
            filters.minProteinPerServing !== '' && `Protein ≥ ${filters.minProteinPerServing}g`,
            filters.minFiberPerServing !== '' && `Fiber ≥ ${filters.minFiberPerServing}g`,
            filters.maxSodiumPerServing !== '' && `Sodium ≤ ${filters.maxSodiumPerServing}mg`,
            filters.minNutritionCompleteness !== '' &&
              `Nutrition data ≥ ${filters.minNutritionCompleteness}%`,
            filters.supportsNutrient && `Has ${filters.supportsNutrient.replaceAll('_', ' ')}`,
          ]
            .filter(Boolean)
            .map((value) => (
              <span key={String(value)}>{value}</span>
            ))}
          <Link className="inline-link" href="/recipes" onClick={resetFilters}>
            Reset all
          </Link>
        </div>
      ) : null}
      {open ? (
        <AppDialog
          onClose={() => setOpen(false)}
          className={styles.dialog}
          aria-labelledby="library-filter-dialog-title"
        >
          <div className="library-filter-dialog-heading">
            <div>
              <h2 id="library-filter-dialog-title">Advanced search</h2>
            </div>
            <button
              className="library-dialog-close"
              type="button"
              aria-label="Close advanced search"
              onClick={() => setOpen(false)}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <form
            className={styles.form}
            action="/recipes"
            method="get"
            onChange={(event) => {
              const values = new FormData(event.currentTarget);
              setGroupValues({
                ...Object.fromEntries(values),
                nutritionFields: values.getAll('nutritionFields'),
              });
            }}
          >
            <div className={styles.body}>
              {['category', 'cuisine'].map((field) => (
                <datalist id={`recipe-${field}-options`} key={field}>
                  {facets
                    .filter((facet) => facet.field === field)
                    .map((facet) => (
                      <option value={facet.value} key={facet.key} />
                    ))}
                </datalist>
              ))}
              <label className="library-dialog-search">
                <span>Search recipes</span>
                <input
                  name="q"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Title, ingredient, or description"
                />
              </label>
              <section className={styles.group}>
                <h3>Recipe filters</h3>
                <div className="library-advanced-grid">
                  <label>
                    <span>Sort</span>
                    <select name="sort" defaultValue={filters.sort}>
                      <option value="recently-updated">Recently updated</option>
                      <option value="recently-added">Recently added</option>
                      <option value="alphabetical">Alphabetical</option>
                      <option value="highest-rated">Your highest rated</option>
                      <option value="most-recently-cooked">Most recently cooked</option>
                      <option value="shortest-time">Shortest time</option>
                      <option value="lowest-calories">Lowest calories per serving</option>
                      <option value="highest-protein">Highest protein per serving</option>
                      <option value="highest-fiber">Highest fiber per serving</option>
                      <option value="lowest-sodium">Lowest sodium per serving</option>
                      <option value="highest-nutrition-completeness">
                        Highest nutrition-data completeness
                      </option>
                    </select>
                  </label>
                  <label>
                    <span>Creator</span>
                    <select name="creator" defaultValue={filters.creator}>
                      <option value="">Everyone</option>
                      {profiles.map((profile) => (
                        <option value={profile.value} key={profile.value}>
                          {profile.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Tag</span>
                    <select name="tag" defaultValue={filters.tag}>
                      <option value="">Any tag</option>
                      {tags.map((tag) => (
                        <option value={tag} key={tag}>
                          {tag}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Collection</span>
                    <select name="collection" defaultValue={filters.collection}>
                      <option value="">Any collection</option>
                      {collections.map((collection) => (
                        <option value={collection.value} key={collection.value}>
                          {collection.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Status</span>
                    <select name="status" defaultValue={filters.status}>
                      <option value="active">Active</option>
                      <option value="archived">Archived</option>
                      <option value="trash">Trash</option>
                      <option value="all">All statuses</option>
                    </select>
                  </label>
                  <label>
                    <span>Category</span>
                    <input
                      list="recipe-category-options"
                      name="category"
                      defaultValue={filters.category}
                      placeholder="e.g. Dinner"
                    />
                  </label>
                  <label>
                    <span>Cuisine</span>
                    <input
                      list="recipe-cuisine-options"
                      name="cuisine"
                      defaultValue={filters.cuisine}
                      placeholder="e.g. Italian"
                    />
                  </label>
                </div>
              </section>
              <FilterGroup
                title="Time and pantry"
                summary={[
                  groupValues.maxTotalMinutes && `Up to ${groupValues.maxTotalMinutes} min`,
                  groupValues.pantry && `Pantry: ${groupValues.pantry}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              >
                <div className="library-advanced-grid">
                  <label>
                    <span>Maximum total time (minutes)</span>
                    <input
                      name="maxTotalMinutes"
                      type="number"
                      min="1"
                      defaultValue={filters.maxTotalMinutes}
                    />
                  </label>
                  <label>
                    <span>Pantry availability</span>
                    <select name="pantry" defaultValue={filters.pantry}>
                      <option value="">Any pantry availability</option>
                      <option value="ready">Pantry ready</option>
                      <option value="partial">Pantry short</option>
                      <option value="unknown">Pantry unknown</option>
                    </select>
                  </label>
                </div>
              </FilterGroup>
              <FilterGroup
                title="Nutrition"
                summary={[
                  ['maxCaloriesPerServing', 'Calories ≤', 'kcal'],
                  ['minProteinPerServing', 'Protein ≥', 'g'],
                  ['minFiberPerServing', 'Fiber ≥', 'g'],
                  ['maxSodiumPerServing', 'Sodium ≤', 'mg'],
                  ['minNutritionCompleteness', 'Data completeness ≥', '%'],
                  ['supportsNutrient', 'Has value for', ''],
                ]
                  .filter(([key]) => groupValues[key] !== '' && groupValues[key] !== undefined)
                  .map(([key, label, unit]) => `${label} ${groupValues[key]}${unit}`)
                  .join(' · ')}
              >
                <p className="muted">
                  Nutrition-data completeness describes how much nutrition information is available.
                </p>
                <div className="library-advanced-grid">
                  <label>
                    <span>Maximum calories per serving (kcal)</span>
                    <input
                      name="maxCaloriesPerServing"
                      type="number"
                      min="0"
                      step="any"
                      defaultValue={filters.maxCaloriesPerServing}
                    />
                  </label>
                  <label>
                    <span>Minimum protein per serving (g)</span>
                    <input
                      name="minProteinPerServing"
                      type="number"
                      min="0"
                      step="any"
                      defaultValue={filters.minProteinPerServing}
                    />
                  </label>
                  <label>
                    <span>Minimum fiber per serving (g)</span>
                    <input
                      name="minFiberPerServing"
                      type="number"
                      min="0"
                      step="any"
                      defaultValue={filters.minFiberPerServing}
                    />
                  </label>
                  <label>
                    <span>Maximum sodium per serving (mg)</span>
                    <input
                      name="maxSodiumPerServing"
                      type="number"
                      min="0"
                      step="any"
                      defaultValue={filters.maxSodiumPerServing}
                    />
                  </label>
                  <label>
                    <span>Minimum nutrition-data completeness (%)</span>
                    <input
                      name="minNutritionCompleteness"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      defaultValue={filters.minNutritionCompleteness}
                    />
                  </label>
                  <label>
                    <span>Has per-serving value for</span>
                    <select name="supportsNutrient" defaultValue={filters.supportsNutrient}>
                      <option value="">Any nutrient coverage</option>
                      <option value="energy_kcal">Calories</option>
                      <option value="protein">Protein</option>
                      <option value="carbohydrate">Carbohydrate</option>
                      <option value="total_fat">Fat</option>
                      <option value="fiber">Fiber</option>
                      <option value="sodium">Sodium</option>
                      <option value="calcium">Calcium</option>
                      <option value="iron">Iron</option>
                      <option value="potassium">Potassium</option>
                      <option value="vitamin_d">Vitamin D</option>
                    </select>
                  </label>
                </div>
              </FilterGroup>
              <FilterGroup
                title="Personal choices"
                summary={[groupValues.favorite && 'Favorites', groupValues.cooked && 'Cooked by me']
                  .filter(Boolean)
                  .join(' · ')}
              >
                <fieldset className="library-check-filters">
                  <legend>Personal filters</legend>
                  <label>
                    <input
                      name="favorite"
                      type="checkbox"
                      value="true"
                      defaultChecked={filters.favorite}
                    />
                    Favorites
                  </label>
                  <label>
                    <input
                      name="cooked"
                      type="checkbox"
                      value="true"
                      defaultChecked={filters.cooked}
                    />
                    Cooked by me
                  </label>
                </fieldset>
              </FilterGroup>
              <FilterGroup
                title="Display options"
                summary={`${Array.isArray(groupValues.nutritionFields) ? groupValues.nutritionFields.length : filters.nutritionFields.length} card nutrition facts`}
              >
                <p className="muted">
                  Choose up to five facts. Clear all to use your profile defaults. These options do
                  not restrict matching recipes.
                </p>
                <fieldset className="library-check-filters">
                  <legend>Compact nutrition facts on cards</legend>
                  {[
                    ['energy_kcal', 'Calories'],
                    ['protein', 'Protein'],
                    ['carbohydrate', 'Carbohydrate'],
                    ['total_fat', 'Fat'],
                    ['fiber', 'Fiber'],
                    ['sodium', 'Sodium'],
                  ].map(([value, label]) => (
                    <label key={value}>
                      <input
                        name="nutritionFields"
                        type="checkbox"
                        value={value}
                        defaultChecked={filters.nutritionFields.includes(value)}
                        disabled={
                          Array.isArray(groupValues.nutritionFields) &&
                          groupValues.nutritionFields.length >= 5 &&
                          !groupValues.nutritionFields.includes(value)
                        }
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
              </FilterGroup>
            </div>
            <div className="library-dialog-actions">
              <button className="primary-button compact" type="submit">
                Show recipes
              </button>
              <Link className="text-button" href="/recipes" onClick={resetFilters}>
                Reset all
              </Link>
            </div>
          </form>
        </AppDialog>
      ) : null}
    </>
  );
}

function FilterGroup({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <details className={styles.group}>
      <summary>
        <strong>{title}</strong>
        <span>{summary || 'Any'}</span>
      </summary>
      <div className={styles.groupBody}>{children}</div>
    </details>
  );
}
