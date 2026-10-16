'use client';

import { X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SearchFacetBar } from './search-facet-bar';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

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
  const dialogRef = useRef<HTMLDialogElement>(null);
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
        onAdvanced={() => dialogRef.current?.showModal()}
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

      <dialog
        ref={dialogRef}
        className="library-filter-dialog"
        aria-labelledby="library-filter-dialog-title"
      >
        <div className="library-filter-dialog-heading">
          <div>
            <p className="eyebrow">FIND A RECIPE</p>
            <h2 id="library-filter-dialog-title">Advanced search</h2>
          </div>
          <button
            className="library-dialog-close"
            type="button"
            aria-label="Close advanced search"
            onClick={() => dialogRef.current?.close()}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <form className="library-advanced-form" action="/recipes" method="get">
          <label className="library-dialog-search">
            <span>Search recipes</span>
            <input
              name="q"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Title, ingredient, or description"
            />
          </label>
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
                <option value="highest-nutrition-completeness">Highest Nutrition coverage</option>
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
              <span>Pantry coverage</span>
              <select name="pantry" defaultValue={filters.pantry}>
                <option value="">Any Pantry coverage</option>
                <option value="ready">Pantry ready</option>
                <option value="partial">Pantry short</option>
                <option value="unknown">Pantry unknown</option>
              </select>
            </label>
            <label>
              <span>Category</span>
              <input name="category" defaultValue={filters.category} placeholder="e.g. Dinner" />
            </label>
            <label>
              <span>Cuisine</span>
              <input name="cuisine" defaultValue={filters.cuisine} placeholder="e.g. Italian" />
            </label>
            <label>
              <span>Maximum minutes</span>
              <input
                name="maxTotalMinutes"
                type="number"
                min="1"
                defaultValue={filters.maxTotalMinutes}
              />
            </label>
            <label>
              <span>Maximum calories per serving</span>
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
              <span>Minimum Nutrition coverage (%)</span>
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
          <fieldset className="library-check-filters">
            <legend>Compact Nutrition facts on cards</legend>
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
                />
                {label}
              </label>
            ))}
          </fieldset>
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
              <input name="cooked" type="checkbox" value="true" defaultChecked={filters.cooked} />
              Cooked by me
            </label>
          </fieldset>
          <div className="library-dialog-actions">
            <button className="primary-button compact" type="submit">
              Show recipes
            </button>
            {hasActiveFilters ? (
              <Link className="text-button" href="/recipes">
                Reset all
              </Link>
            ) : null}
          </div>
        </form>
      </dialog>
    </>
  );
}
