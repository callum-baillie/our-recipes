'use client';

import { Search, SlidersHorizontal, X } from 'lucide-react';
import Link from 'next/link';
import { useRef } from 'react';

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
};

function PreservedAdvancedFilters({ filters }: { filters: RecipeLibraryFiltersValue }) {
  return (
    <>
      {filters.creator ? <input type="hidden" name="creator" value={filters.creator} /> : null}
      {filters.collection ? (
        <input type="hidden" name="collection" value={filters.collection} />
      ) : null}
      {filters.status !== 'active' ? (
        <input type="hidden" name="status" value={filters.status} />
      ) : null}
      {filters.category ? <input type="hidden" name="category" value={filters.category} /> : null}
      {filters.cuisine ? <input type="hidden" name="cuisine" value={filters.cuisine} /> : null}
      {filters.maxTotalMinutes ? (
        <input type="hidden" name="maxTotalMinutes" value={filters.maxTotalMinutes} />
      ) : null}
      {filters.favorite ? <input type="hidden" name="favorite" value="true" /> : null}
      {filters.cooked ? <input type="hidden" name="cooked" value="true" /> : null}
      {filters.pantry ? <input type="hidden" name="pantry" value={filters.pantry} /> : null}
      {filters.maxCaloriesPerServing !== '' ? (
        <input type="hidden" name="maxCaloriesPerServing" value={filters.maxCaloriesPerServing} />
      ) : null}
      {filters.minProteinPerServing !== '' ? (
        <input type="hidden" name="minProteinPerServing" value={filters.minProteinPerServing} />
      ) : null}
      {filters.minFiberPerServing !== '' ? (
        <input type="hidden" name="minFiberPerServing" value={filters.minFiberPerServing} />
      ) : null}
      {filters.maxSodiumPerServing !== '' ? (
        <input type="hidden" name="maxSodiumPerServing" value={filters.maxSodiumPerServing} />
      ) : null}
      {filters.minNutritionCompleteness !== '' ? (
        <input
          type="hidden"
          name="minNutritionCompleteness"
          value={filters.minNutritionCompleteness}
        />
      ) : null}
      {filters.supportsNutrient ? (
        <input type="hidden" name="supportsNutrient" value={filters.supportsNutrient} />
      ) : null}
      {filters.nutritionFields.map((field) => (
        <input key={field} type="hidden" name="nutritionFields" value={field} />
      ))}
    </>
  );
}

export function RecipeLibraryFilters({
  filters,
  profiles,
  tags,
  collections,
}: RecipeLibraryFiltersProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const quickFormRef = useRef<HTMLFormElement>(null);
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
      <div className="library-toolbar">
        <form
          ref={quickFormRef}
          className="library-quick-filters"
          action="/recipes"
          method="get"
          role="search"
        >
          <PreservedAdvancedFilters filters={filters} />
          <label className="library-search-field">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Search recipes</span>
            <input name="q" defaultValue={filters.q} placeholder="Search recipes or ingredients" />
          </label>
          <label className="library-quick-select">
            <span className="sr-only">Tag</span>
            <select
              name="tag"
              defaultValue={filters.tag}
              onChange={() => quickFormRef.current?.requestSubmit()}
            >
              <option value="">Any tag</option>
              {tags.map((tag) => (
                <option value={tag} key={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>
          <label className="library-quick-select library-sort-select">
            <span className="sr-only">Sort</span>
            <select
              name="sort"
              defaultValue={filters.sort}
              onChange={() => quickFormRef.current?.requestSubmit()}
            >
              <option value="recently-updated">Recently updated</option>
              <option value="recently-added">Recently added</option>
              <option value="alphabetical">Alphabetical</option>
              <option value="highest-rated">Your highest rated</option>
              <option value="most-recently-cooked">Recently cooked</option>
              <option value="shortest-time">Shortest time</option>
              <option value="lowest-calories">Lowest calories per serving</option>
              <option value="highest-protein">Highest protein per serving</option>
              <option value="highest-fiber">Highest fiber per serving</option>
              <option value="lowest-sodium">Lowest sodium per serving</option>
              <option value="highest-nutrition-completeness">Highest Nutrition coverage</option>
            </select>
          </label>
          <button className="library-search-submit" type="submit" aria-label="Search recipes">
            <Search size={18} aria-hidden="true" />
          </button>
        </form>

        <button
          className="library-advanced-trigger"
          type="button"
          aria-haspopup="dialog"
          onClick={() => dialogRef.current?.showModal()}
        >
          <SlidersHorizontal size={17} aria-hidden="true" />
          Advanced search
        </button>
        {hasActiveFilters ? (
          <Link className="library-clear-filters" href="/recipes">
            Clear
          </Link>
        ) : null}
      </div>

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
              defaultValue={filters.q}
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
