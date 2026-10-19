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
  const [active, setActive] = useState(-1);
  const [placement, setPlacement] = useState({ above: false, height: 300 });
  const anchorRef = useRef<HTMLDivElement>(null);
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

  const custom =
    input.trim() &&
    !options.some((option) => option.toLocaleLowerCase() === input.trim().toLocaleLowerCase()) &&
    !selectedKeys.has(input.trim().toLocaleLowerCase())
      ? input.trim()
      : null;
  const choices = [...suggestions, ...(custom ? [custom] : [])];
  const atLimit = normalizedValue.length >= MAX_RECIPE_TAXONOMY_VALUES;
  useEffect(() => {
    if (!open) return;
    function place() {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      const bottom = top + (viewport?.height ?? innerHeight);
      const below = bottom - rect.bottom - 12;
      const above = rect.top - top - 12;
      const flip = below < 240 && above > below;
      setPlacement({ above: flip, height: Math.max(60, Math.min(320, flip ? above : below)) });
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);
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
    setActive(-1);
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
      <div className="recipe-taxonomy-combobox" ref={anchorRef}>
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && active >= 0 && choices[active] ? `${listId}-${active}` : undefined
          }
          aria-invalid={Boolean(error)}
          value={input}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            setInput(event.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Tab') {
              setOpen(false);
              return;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
              setActive(-1);
              return;
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              const next = choices.length
                ? (active + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length
                : -1;
              setActive(next);
              requestAnimationFrame(() =>
                document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: 'nearest' }),
              );
              return;
            }
            if (event.key !== 'Enter' && event.key !== ',' && event.key !== ';') return;
            event.preventDefault();
            addValue(open && active >= 0 ? choices[active] : input);
            setActive(-1);
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
        {open ? (
          <div
            className="recipe-taxonomy-menu"
            style={{
              maxHeight: placement.height,
              top: placement.above ? 'auto' : 'calc(100% + .25rem)',
              bottom: placement.above ? 'calc(100% + .25rem)' : 'auto',
            }}
            id={listId}
            role="listbox"
            aria-label={`${label} options`}
          >
            {atLimit ? (
              <span className="recipe-taxonomy-menu-empty">
                Limit reached: choose up to {MAX_RECIPE_TAXONOMY_VALUES} values.
              </span>
            ) : choices.length ? (
              choices.map((option, index) => (
                <button
                  type="button"
                  role="option"
                  id={`${listId}-${index}`}
                  aria-selected={active === index}
                  key={option}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => addValue(option)}
                >
                  <span>{option === custom ? `Add “${option}”` : option}</span>
                  <Plus size={15} aria-hidden="true" />
                </button>
              ))
            ) : (
              <span className="recipe-taxonomy-menu-empty">
                <Check size={15} aria-hidden="true" /> No unselected suggestions. Type a custom
                value.
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
