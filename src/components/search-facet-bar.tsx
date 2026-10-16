'use client';

import { Heart, MoreHorizontal, Search, SlidersHorizontal, ChevronUp } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import styles from './search-facet-bar.module.css';

export type SearchFacet = {
  key: string;
  label: string;
  count?: number;
  active?: boolean;
  icon?: 'heart';
};

/** A shared search surface: one inset search field and a bounded, expandable facet shelf. */
export function SearchFacetBar({
  query,
  onQueryChange,
  onSearch,
  onAdvanced,
  facets,
  onFacet,
  placeholder = 'Search',
  label = 'Search',
  advancedActive = false,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onSearch?: () => void;
  onAdvanced?: () => void;
  facets: SearchFacet[];
  onFacet: (key: string) => void;
  placeholder?: string;
  label?: string;
  advancedActive?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState(6);
  const shelf = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const signature = facets.map((f) => `${f.key}:${f.label}:${f.count ?? ''}`).join('|');
  useLayoutEffect(() => {
    const resize = () => {
      if (!shelf.current || !measure.current) return;
      const width = shelf.current.clientWidth;
      const sizes = Array.from(measure.current.children).map(
        (child) => child.getBoundingClientRect().width,
      );
      let row = 0,
        used = 0,
        count = 0;
      for (let i = 0; i < sizes.length; i++) {
        const size = Math.min(sizes[i], width);
        const reserve = i < sizes.length - 1 ? 52 : 0;
        if (used + size + (row === 1 ? reserve : 0) > width && used > 0) {
          row++;
          used = 0;
        }
        if (row > 1 || (row === 1 && used + size + reserve > width)) break;
        used += size + 8;
        count++;
      }
      setVisible(Math.max(1, count));
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (shelf.current) observer.observe(shelf.current);
    return () => observer.disconnect();
  }, [signature]);
  function content(facet: SearchFacet) {
    return (
      <>
        {facet.icon === 'heart' ? (
          <Heart aria-hidden="true" fill={facet.active ? 'currentColor' : 'none'} />
        ) : (
          facet.label
        )}
        {facet.count !== undefined && !facet.icon ? (
          <span className={styles.count}>{facet.count}</span>
        ) : null}
      </>
    );
  }
  return (
    <section className={styles.surface} aria-label={`${label} and filters`}>
      <form
        className={styles.search}
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch?.();
        }}
      >
        {onAdvanced ? (
          <button
            type="button"
            aria-label="Advanced search"
            title="Advanced search"
            aria-haspopup="dialog"
            data-active={advancedActive || undefined}
            onClick={onAdvanced}
          >
            <SlidersHorizontal />
          </button>
        ) : null}
        <input
          aria-label={label}
          type="search"
          maxLength={160}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={placeholder}
        />
        <button type="submit" aria-label={label} title={label}>
          <Search />
        </button>
      </form>
      <div className={styles.shelf} ref={shelf}>
        {(expanded ? facets : facets.slice(0, visible)).map((facet) => (
          <button
            key={facet.key}
            type="button"
            className={styles.chip}
            aria-label={facet.icon ? facet.label : undefined}
            title={facet.label}
            aria-pressed={Boolean(facet.active)}
            onClick={() => onFacet(facet.key)}
          >
            {content(facet)}
          </button>
        ))}
        {facets.length > visible ? (
          <button
            type="button"
            className={styles.more}
            aria-label={expanded ? 'Show fewer filters' : 'Show all filters'}
            title={expanded ? 'Show fewer filters' : 'Show all filters'}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp /> : <MoreHorizontal />}
          </button>
        ) : null}
      </div>
      <div ref={measure} className={styles.measure} aria-hidden="true">
        {facets.map((facet) => (
          <span key={facet.key} className={styles.chip}>
            {content(facet)}
          </span>
        ))}
      </div>
    </section>
  );
}

export function ResultsToolbar({
  summary,
  actions,
  sort,
  onSortChange,
  options,
}: {
  summary: ReactNode;
  actions?: ReactNode;
  sort: string;
  onSortChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className={styles.results}>
      <div className={styles.summary}>{summary}</div>
      <div className={styles.actions}>{actions}</div>
      <label className={styles.sort}>
        <span className="sr-only">Sort results</span>
        <select
          aria-label="Sort results"
          value={sort}
          onChange={(event) => onSortChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
