'use client';

import { ChevronLeft, ChevronRight, Heart, Search, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import styles from './search-facet-bar.module.css';

export type SearchFacet = {
  key: string;
  label: string;
  count?: number;
  active?: boolean;
  icon?: 'heart';
};

/** A shared search field with a single scrollable row of quick filters. */
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
  const shelfId = useId();
  const shelf = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ previous: false, next: false });
  const activeKey = facets.findLast((facet) => facet.active)?.key;
  const updateScroll = useCallback(() => {
    const element = shelf.current;
    if (!element) return;
    const previous = element.scrollLeft > 2;
    const next = element.scrollLeft + element.clientWidth < element.scrollWidth - 2;
    setScroll((current) =>
      current.previous === previous && current.next === next ? current : { previous, next },
    );
  }, []);
  useEffect(() => {
    const observer = new ResizeObserver(updateScroll);
    if (shelf.current) observer.observe(shelf.current);
    if (track.current) observer.observe(track.current);
    updateScroll();
    return () => observer.disconnect();
  }, [updateScroll]);
  useEffect(() => {
    const element = shelf.current;
    const active = Array.from(
      track.current?.querySelectorAll<HTMLButtonElement>('button') ?? [],
    ).find((button) => button.dataset.facetKey === activeKey);
    if (!element || !active) return;
    const bounds = element.getBoundingClientRect();
    const button = active.getBoundingClientRect();
    if (button.left < bounds.left) element.scrollLeft -= bounds.left - button.left + 4;
    else if (button.right > bounds.right) element.scrollLeft += button.right - bounds.right + 4;
    updateScroll();
  }, [activeKey, updateScroll]);
  function scrollFilters(direction: number) {
    const element = shelf.current;
    if (!element) return;
    element.scrollBy({
      left: direction * element.clientWidth * 0.75,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }
  function content(facet: SearchFacet) {
    return (
      <>
        {facet.icon === 'heart' ? (
          <Heart aria-hidden="true" fill={facet.active ? 'currentColor' : 'none'} />
        ) : (
          <span className={styles.facetLabel}>{facet.label}</span>
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
        <button type="submit" aria-label={label} title={label}>
          <Search aria-hidden="true" />
        </button>
        <input
          aria-label={label}
          type="search"
          maxLength={160}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={placeholder}
        />
        {onAdvanced ? (
          <button
            type="button"
            aria-label="Advanced search"
            title="Advanced search"
            aria-haspopup="dialog"
            data-active={advancedActive || undefined}
            onClick={onAdvanced}
          >
            <SlidersHorizontal aria-hidden="true" />
          </button>
        ) : null}
      </form>
      {facets.length > 0 && (
        <div className={styles.facetRow}>
          {scroll.previous || scroll.next ? (
            <button
              className={styles.scrollButton}
              type="button"
              aria-label="Scroll filters backward"
              aria-controls={shelfId}
              disabled={!scroll.previous}
              onClick={() => scrollFilters(-1)}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
          ) : null}
          <div
            id={shelfId}
            className={styles.shelf}
            ref={shelf}
            onScroll={updateScroll}
            data-can-previous={scroll.previous || undefined}
            data-can-next={scroll.next || undefined}
            role="group"
            aria-label={`${label} quick filters`}
          >
            <div className={styles.track} ref={track}>
              {facets.map((facet) => (
                <button
                  key={facet.key}
                  data-facet-key={facet.key}
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
            </div>
          </div>
          {scroll.previous || scroll.next ? (
            <button
              className={styles.scrollButton}
              type="button"
              aria-label="Scroll filters forward"
              aria-controls={shelfId}
              disabled={!scroll.next}
              onClick={() => scrollFilters(1)}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          ) : null}
        </div>
      )}
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
