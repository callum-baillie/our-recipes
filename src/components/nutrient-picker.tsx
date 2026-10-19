'use client';
import { useState } from 'react';

export function NutrientPicker({
  name,
  title,
  initial,
  definitions,
  maximum,
  onChange,
}: {
  name: string;
  title: string;
  initial: string[];
  maximum: number;
  definitions: Array<{
    code: string;
    displayName: string;
    category?: string;
    canonicalUnit?: string;
  }>;
  onChange: () => void;
}) {
  const [selected, setSelected] = useState(initial);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const matches = definitions.filter(
    (item) =>
      selected.includes(item.code) ||
      ((!category || category === item.category) &&
        `${item.displayName} ${item.code}`.toLowerCase().includes(query.toLowerCase())),
  );
  return (
    <fieldset className="nutrient-picker" data-nutrient-picker={name}>
      <legend>{title}</legend>
      {selected.map((code) => (
        <input key={code} type="hidden" name={name} value={code} />
      ))}
      <p>
        {selected.length} selected · Choose 1–{maximum}.{' '}
        {selected.length >= maximum ? 'Limit reached; deselect a choice to add another.' : ''}
      </p>
      <div className="nutrient-selected">
        {selected.map((code) => (
          <button
            className="text-button"
            type="button"
            key={code}
            aria-label={`Remove ${definitions.find((item) => item.code === code)?.displayName ?? code}`}
            onClick={() => {
              setSelected((current) => current.filter((item) => item !== code));
              onChange();
            }}
          >
            {definitions.find((item) => item.code === code)?.displayName ?? code} ×
          </button>
        ))}
      </div>
      <details className="settings-disclosure">
        <summary>Choose nutrients</summary>
        <label>
          Search nutrients
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label>
          Category
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">All categories</option>
            {[...new Set(definitions.map((item) => item.category).filter(Boolean))].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <div className="nutrient-catalogue">
          {matches.map((item) => (
            <label key={item.code}>
              <input
                type="checkbox"
                checked={selected.includes(item.code)}
                disabled={!selected.includes(item.code) && selected.length >= maximum}
                onChange={(event) => {
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, item.code]
                      : current.filter((code) => code !== item.code),
                  );
                  onChange();
                }}
              />
              <span>
                {item.displayName} {item.canonicalUnit ? `(${item.canonicalUnit})` : ''}
                <small>
                  {item.category} · {item.code}
                </small>
              </span>
            </label>
          ))}
        </div>
        {!matches.length && <p>No matches. Your selections are retained.</p>}
      </details>
      {!selected.length && <p role="alert">Choose at least one nutrient before saving.</p>}
    </fieldset>
  );
}
