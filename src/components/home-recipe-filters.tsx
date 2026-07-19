'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export type HomeFilters = {
  q: string;
  category: string;
  tag: string;
  sort: string;
};

export function HomeRecipeFilters({ filters, tags }: { filters: HomeFilters; tags: string[] }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const disclosureRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const hasActiveFilters = Boolean(
    filters.q || filters.tag || filters.category || filters.sort !== 'recently-updated',
  );

  useEffect(() => {
    if (!mobileOpen) return;

    function dismissOutside(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        disclosureRef.current &&
        !disclosureRef.current.contains(event.target)
      ) {
        setMobileOpen(false);
      }
    }

    function dismissWithKeyboard(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setMobileOpen(false);
      toggleRef.current?.focus();
    }

    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', dismissWithKeyboard);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('keydown', dismissWithKeyboard);
    };
  }, [mobileOpen]);

  return (
    <div
      className="home-filter-disclosure"
      data-active={hasActiveFilters ? 'true' : 'false'}
      data-open={mobileOpen ? 'true' : 'false'}
      ref={disclosureRef}
    >
      <button
        className="home-filter-toggle"
        type="button"
        aria-controls="home-recipe-filter-panel"
        aria-expanded={mobileOpen}
        aria-label={
          mobileOpen ? 'Hide recipe search and filters' : 'Show recipe search and filters'
        }
        onClick={() => setMobileOpen((current) => !current)}
        ref={toggleRef}
      >
        <Search size={20} aria-hidden="true" />
        <span className="sr-only">Search recipes</span>
      </button>

      <form
        id="home-recipe-filter-panel"
        className="home-recipe-filters"
        action="/"
        method="get"
        role="search"
      >
        <label className="home-search-field">
          <span>Search recipes</span>
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Search by title, ingredient, or description"
          />
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
          <span>Category</span>
          <input name="category" defaultValue={filters.category} placeholder="e.g. Dinner" />
        </label>
        <label>
          <span>Sort</span>
          <select name="sort" defaultValue={filters.sort}>
            <option value="recently-updated">Recently updated</option>
            <option value="recently-added">Recently added</option>
            <option value="alphabetical">Alphabetical</option>
            <option value="shortest-time">Shortest time</option>
            <option value="highest-rated">Highest rated</option>
          </select>
        </label>
        <button className="primary-button compact" type="submit">
          Search
        </button>
        {hasActiveFilters ? (
          <Link className="text-button" href="/">
            Clear
          </Link>
        ) : null}
      </form>
    </div>
  );
}
