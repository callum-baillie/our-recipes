'use client';

import { SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';
import styles from './home-recipe-filters.module.css';

export type HomeFilters = { q: string; category: string; tag: string; sort: string };

export function HomeRecipeFilters({ filters, tags }: { filters: HomeFilters; tags: string[] }) {
  const id = useId();
  const activeCount = [filters.tag, filters.category, filters.sort !== 'recently-updated'].filter(
    Boolean,
  ).length;
  const active = Boolean(filters.q || activeCount);
  return (
    <form
      id="home-search"
      className={styles.form}
      action="/#all-recipes-title"
      method="get"
      role="search"
    >
      <label className={styles.query}>
        <span>Search recipes</span>
        <input
          key={filters.q}
          type="search"
          name="q"
          maxLength={160}
          defaultValue={filters.q}
          placeholder="Recipes or ingredients"
        />
      </label>
      <button className="primary-button compact" type="submit">
        Search
      </button>
      <details className={styles.filters}>
        <summary>
          <SlidersHorizontal size={16} aria-hidden="true" /> Filters
          {activeCount ? ` (${activeCount})` : ''}
        </summary>
        <div className={styles.fields} id={id}>
          <label>
            <span>Tag</span>
            <select key={filters.tag} name="tag" defaultValue={filters.tag}>
              <option value="">Any tag</option>
              {tags.map((tag) => (
                <option value={tag} key={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Category</span>
            <input
              key={filters.category}
              name="category"
              defaultValue={filters.category}
              placeholder="e.g. Dinner"
            />
          </label>
          <label>
            <span>Sort</span>
            <select key={filters.sort} name="sort" defaultValue={filters.sort}>
              <option value="recently-updated">Recently updated</option>
              <option value="recently-added">Recently added</option>
              <option value="alphabetical">Alphabetical</option>
              <option value="shortest-time">Shortest time</option>
              <option value="highest-rated">Highest rated</option>
              <option value="most-recently-cooked">Recently cooked</option>
              <option value="lowest-calories">Lowest calories</option>
              <option value="highest-protein">Highest protein</option>
              <option value="highest-fiber">Highest fiber</option>
              <option value="lowest-sodium">Lowest sodium</option>
              <option value="highest-nutrition-completeness">Nutrition data completeness</option>
            </select>
          </label>
        </div>
      </details>
      {active ? (
        <Link className="text-button" href="/">
          Clear filters
        </Link>
      ) : null}
      {activeCount ? (
        <p className={styles.summary}>
          Active:{' '}
          {[
            filters.tag && `Tag: ${filters.tag}`,
            filters.category && `Category: ${filters.category}`,
            filters.sort !== 'recently-updated' && `Sort: ${filters.sort.replaceAll('-', ' ')}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      ) : null}
    </form>
  );
}
