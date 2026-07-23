'use client';

import { Search } from 'lucide-react';
import { useId, useState } from 'react';

import { BrandIcon } from '@/components/brand-icon';
import { BRAND_ICON_CATEGORIES, brandIconLabel, type BrandIconId } from '@/lib/appearance';

export function BrandIconPicker({
  selected,
  onSelect,
}: {
  selected: BrandIconId;
  onSelect: (icon: BrandIconId) => void;
}) {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();

  return (
    <fieldset className="brand-icon-fieldset">
      <legend>Kitchen icon</legend>
      <p>
        This mark represents your kitchen in the header and install icon. The Bòrd table logo stays
        on product surfaces.
      </p>
      <label className="brand-icon-search" htmlFor={searchId}>
        <span>Find an icon</span>
        <span>
          <Search size={17} aria-hidden="true" />
          <input
            id={searchId}
            type="search"
            value={query}
            placeholder="Search kitchen, food, baking, or drinks"
            onChange={(event) => setQuery(event.target.value)}
          />
        </span>
      </label>
      <div className="brand-icon-categories">
        {BRAND_ICON_CATEGORIES.map((category) => {
          const icons = category.icons.filter((icon) =>
            brandIconLabel(icon).toLowerCase().includes(normalizedQuery),
          );
          if (!icons.length) return null;
          return (
            <section key={category.id} aria-labelledby={`brand-icons-${category.id}`}>
              <h3 id={`brand-icons-${category.id}`}>{category.label}</h3>
              <div className="brand-icon-grid" role="radiogroup" aria-label={category.label}>
                {icons.map((icon) => {
                  const active = selected === icon;
                  return (
                    <button
                      key={icon}
                      className={active ? 'brand-icon-option selected' : 'brand-icon-option'}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-label={`Use ${brandIconLabel(icon)} as the kitchen icon`}
                      title={brandIconLabel(icon)}
                      onClick={() => onSelect(icon)}
                    >
                      <BrandIcon icon={icon} size={23} strokeWidth={2.1} />
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      {normalizedQuery &&
      !BRAND_ICON_CATEGORIES.some((category) =>
        category.icons.some((icon) => brandIconLabel(icon).toLowerCase().includes(normalizedQuery)),
      ) ? (
        <p className="brand-icon-empty" role="status">
          No culinary icons match “{query}”.
        </p>
      ) : null}
    </fieldset>
  );
}
