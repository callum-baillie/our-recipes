'use client';

import { Check, ChevronDown, Plus, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import {
  MAX_RECIPE_TAXONOMY_VALUES,
  MAX_RECIPE_TAXONOMY_VALUE_LENGTH,
  normalizeRecipeTaxonomyValues,
} from '@/lib/domain/recipe';

type RecipeTaxonomySelectorProps = {
  label: string;
  value: string[];
  options: readonly string[];
  onChange: (values: string[]) => void;
  error?: string;
};

function toneFor(value: string): number {
  return Array.from(value).reduce((total, character) => total + character.codePointAt(0)!, 0) % 5;
}

export function RecipeTaxonomySelector({
  label,
  value,
  options,
  onChange,
  error,
}: RecipeTaxonomySelectorProps) {
  const inputId = useId();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const normalizedValue = useMemo(
    () =>
      normalizeRecipeTaxonomyValues(value).map(
        (item) =>
          options.find((option) => option.toLocaleLowerCase() === item.toLocaleLowerCase()) ?? item,
      ),
    [options, value],
  );
  const selectedKeys = useMemo(
    () => new Set(normalizedValue.map((item) => item.toLocaleLowerCase())),
    [normalizedValue],
  );
  const suggestions = options
    .filter((option) => !selectedKeys.has(option.toLocaleLowerCase()))
    .filter(
      (option) =>
        !input.trim() || option.toLocaleLowerCase().includes(input.trim().toLocaleLowerCase()),
    );

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, []);

  function addValue(rawValue = input) {
    const candidate = normalizeRecipeTaxonomyValues([rawValue.replace(/[,;]$/u, '')])[0];
    if (!candidate || normalizedValue.length >= MAX_RECIPE_TAXONOMY_VALUES) return;
    const matchingOption = options.find(
      (option) => option.toLocaleLowerCase() === candidate.toLocaleLowerCase(),
    );
    const nextValue = matchingOption ?? candidate;
    if (selectedKeys.has(nextValue.toLocaleLowerCase())) {
      setInput('');
      return;
    }
    onChange([...normalizedValue, nextValue]);
    setInput('');
    setOpen(false);
  }

  return (
    <div className="recipe-taxonomy-selector" ref={rootRef}>
      <label className="recipe-taxonomy-label" htmlFor={inputId}>
        {label} <em>(optional)</em>
      </label>
      {normalizedValue.length > 0 ? (
        <div
          className="recipe-taxonomy-pill-list"
          aria-label={`Selected ${label.toLocaleLowerCase()}`}
        >
          {normalizedValue.map((item) => (
            <span className={`recipe-taxonomy-pill tag-tone-${toneFor(item)}`} key={item}>
              {item}
              <button
                type="button"
                onClick={() =>
                  onChange(
                    normalizedValue.filter(
                      (candidate) => candidate.toLocaleLowerCase() !== item.toLocaleLowerCase(),
                    ),
                  )
                }
                aria-label={`Remove ${item} from ${label.toLocaleLowerCase()}`}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="recipe-taxonomy-combobox">
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={Boolean(error)}
          value={input}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            setInput(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
              return;
            }
            if (event.key !== 'Enter' && event.key !== ',' && event.key !== ';') return;
            event.preventDefault();
            addValue();
          }}
          placeholder={`Add ${label.toLocaleLowerCase()}`}
          maxLength={MAX_RECIPE_TAXONOMY_VALUE_LENGTH}
          disabled={normalizedValue.length >= MAX_RECIPE_TAXONOMY_VALUES}
        />
        <button
          className="recipe-taxonomy-toggle"
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-label={`${open ? 'Close' : 'Open'} ${label.toLocaleLowerCase()} options`}
          aria-expanded={open}
          aria-controls={listId}
        >
          <ChevronDown size={18} aria-hidden="true" />
        </button>
        <button
          className="recipe-taxonomy-add"
          type="button"
          onClick={() => addValue()}
          disabled={!input.trim() || normalizedValue.length >= MAX_RECIPE_TAXONOMY_VALUES}
          aria-label={`Add ${label.toLocaleLowerCase()}`}
        >
          <Plus size={17} aria-hidden="true" />
        </button>
        {open ? (
          <div
            className="recipe-taxonomy-menu"
            id={listId}
            role="listbox"
            aria-label={`${label} options`}
          >
            {suggestions.length > 0 ? (
              suggestions.map((option) => (
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  key={option}
                  onClick={() => addValue(option)}
                >
                  <span>{option}</span>
                  <Plus size={15} aria-hidden="true" />
                </button>
              ))
            ) : input.trim() && normalizedValue.length < MAX_RECIPE_TAXONOMY_VALUES ? (
              <button type="button" role="option" aria-selected="false" onClick={() => addValue()}>
                <span>Add “{input.trim()}”</span>
                <Plus size={15} aria-hidden="true" />
              </button>
            ) : (
              <span className="recipe-taxonomy-menu-empty">
                <Check size={15} aria-hidden="true" /> All available options are selected.
              </span>
            )}
          </div>
        ) : null}
      </div>
      <small
        className={error ? undefined : 'recipe-taxonomy-help'}
        role={error ? 'alert' : undefined}
      >
        {error ?? `Choose multiple or type your own (up to ${MAX_RECIPE_TAXONOMY_VALUES}).`}
      </small>
    </div>
  );
}
