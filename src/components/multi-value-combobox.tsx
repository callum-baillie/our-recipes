'use client';

import { Check, ChevronDown, Plus, X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';

type MultiValueComboboxProps = {
  label: string;
  helper: string;
  placeholder: string;
  options: readonly string[];
  value: string[];
  onChange: (value: string[]) => void;
};

function normalizedValues(values: readonly string[]): string[] {
  return [
    ...new Map(
      values
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => [value.toLocaleLowerCase(), value.slice(0, 120)]),
    ).values(),
  ].slice(0, 50);
}

export function MultiValueCombobox({
  label,
  helper,
  placeholder,
  options,
  value,
  onChange,
}: MultiValueComboboxProps) {
  const inputId = useId();
  const listId = useId();
  const helpId = useId();
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const selectedValues = useMemo(() => normalizedValues(value), [value]);
  const selectedKeys = useMemo(
    () => new Set(selectedValues.map((item) => item.toLocaleLowerCase())),
    [selectedValues],
  );
  const suggestions = options
    .filter((option) => !selectedKeys.has(option.toLocaleLowerCase()))
    .filter(
      (option) =>
        !input.trim() || option.toLocaleLowerCase().includes(input.trim().toLocaleLowerCase()),
    )
    .slice(0, 8);

  function addValue(rawValue = input) {
    const candidate = rawValue.replace(/[,;]$/u, '').trim().slice(0, 120);
    if (!candidate || selectedValues.length >= 50) return;
    const matchingOption = options.find(
      (option) => option.toLocaleLowerCase() === candidate.toLocaleLowerCase(),
    );
    const nextValue = matchingOption ?? candidate;
    if (!selectedKeys.has(nextValue.toLocaleLowerCase())) {
      onChange([...selectedValues, nextValue]);
    }
    setInput('');
    setOpen(false);
  }

  return (
    <div
      className="multi-value-field"
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        if (input.trim()) addValue();
        setOpen(false);
      }}
    >
      <label htmlFor={inputId}>
        <span>{label}</span>
      </label>
      {selectedValues.length > 0 ? (
        <div className="multi-value-pills" aria-label={`Selected ${label.toLocaleLowerCase()}`}>
          {selectedValues.map((item) => (
            <span key={item}>
              {item}
              <button
                type="button"
                onClick={() =>
                  onChange(
                    selectedValues.filter(
                      (candidate) => candidate.toLocaleLowerCase() !== item.toLocaleLowerCase(),
                    ),
                  )
                }
                aria-label={`Remove ${item} from ${label.toLocaleLowerCase()}`}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="multi-value-combobox">
        <input
          id={inputId}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-describedby={helpId}
          autoComplete="off"
          value={input}
          placeholder={placeholder}
          maxLength={120}
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
            if (event.key === 'Backspace' && !input && selectedValues.length > 0) {
              onChange(selectedValues.slice(0, -1));
              return;
            }
            if (event.key !== 'Enter' && event.key !== ',' && event.key !== ';') return;
            event.preventDefault();
            addValue();
          }}
        />
        <button
          type="button"
          className="multi-value-toggle"
          aria-label={`${open ? 'Close' : 'Open'} common ${label.toLocaleLowerCase()}`}
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((current) => !current)}
        >
          <ChevronDown size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="multi-value-add"
          disabled={!input.trim() || selectedValues.length >= 50}
          aria-label={`Add ${label.toLocaleLowerCase()}`}
          onClick={() => addValue()}
        >
          <Plus size={16} aria-hidden="true" />
        </button>
        {open ? (
          <div id={listId} className="multi-value-menu" role="listbox" aria-label={label}>
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
                  <Plus size={14} aria-hidden="true" />
                </button>
              ))
            ) : input.trim() ? (
              <button type="button" role="option" aria-selected="false" onClick={() => addValue()}>
                <span>Add “{input.trim()}”</span>
                <Plus size={14} aria-hidden="true" />
              </button>
            ) : (
              <span className="multi-value-empty">
                <Check size={14} aria-hidden="true" /> Common values selected
              </span>
            )}
          </div>
        ) : null}
      </div>
      <small id={helpId}>{helper}</small>
    </div>
  );
}
