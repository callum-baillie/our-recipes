'use client';

import { Plus, X } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';

type RecipeTagSelectorProps = {
  value: string[];
  onChange: (tags: string[]) => void;
};

function normalizeTag(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase().slice(0, 40);
}

function tagTone(tag: string): number {
  return Array.from(tag).reduce((total, character) => total + character.codePointAt(0)!, 0) % 5;
}

export function RecipeTagSelector({ value, onChange }: RecipeTagSelectorProps) {
  const labelId = useId();
  const [input, setInput] = useState('');
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const normalizedValue = useMemo(() => value.map(normalizeTag).filter(Boolean), [value]);

  useEffect(() => {
    fetch('/api/v1/tags')
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body: { tags?: Array<{ name?: string }> } | null) => {
        setAvailableTags(
          body?.tags?.flatMap((tag) => (tag.name ? [normalizeTag(tag.name)] : [])) ?? [],
        );
      })
      .catch(() => undefined);
  }, []);

  function addTag(rawTag = input) {
    const tag = normalizeTag(rawTag.replace(/,$/u, ''));
    if (!tag || normalizedValue.includes(tag) || normalizedValue.length >= 20) {
      setInput('');
      return;
    }
    onChange([...normalizedValue, tag]);
    setInput('');
  }

  const suggestions = availableTags
    .filter((tag) => !normalizedValue.includes(tag))
    .filter((tag) => !input.trim() || tag.includes(normalizeTag(input)))
    .slice(0, 8);

  return (
    <div className="recipe-tag-selector" aria-labelledby={labelId}>
      <span className="recipe-tag-selector-label" id={labelId}>
        Tags <em>(optional)</em>
      </span>
      {normalizedValue.length > 0 ? (
        <div className="recipe-tag-pill-list" aria-label="Selected recipe tags">
          {normalizedValue.map((tag) => (
            <span className={`recipe-tag-pill tag-tone-${tagTone(tag)}`} key={tag}>
              {tag}
              <button
                type="button"
                onClick={() => onChange(normalizedValue.filter((candidate) => candidate !== tag))}
                aria-label={`Remove ${tag} tag`}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="recipe-tag-input-row">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ',') return;
            event.preventDefault();
            addTag();
          }}
          aria-labelledby={labelId}
          placeholder="Add a tag"
          maxLength={40}
        />
        <button
          className="icon-button"
          type="button"
          onClick={() => addTag()}
          disabled={!input.trim() || normalizedValue.length >= 20}
          aria-label="Add tag"
        >
          <Plus size={17} aria-hidden="true" />
        </button>
      </div>
      {suggestions.length > 0 ? (
        <div className="recipe-tag-suggestions" aria-label="Available tags">
          {suggestions.map((tag) => (
            <button type="button" key={tag} onClick={() => addTag(tag)}>
              <Plus size={13} aria-hidden="true" /> {tag}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
