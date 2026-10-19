'use client';

import { useEffect, useRef, useState } from 'react';

/** Per-person, per-task drafts live only in this browser tab, including recovery navigation. */
export function useNutritionDraft<T extends Record<string, string>>(scope: string, defaults: T) {
  const [draft, setDraft] = useState<T>(defaults);
  const current = useRef(defaults);
  const initial = useRef(defaults);
  const [baseline, setBaseline] = useState(defaults);
  const edited = useRef(false);
  const [notice, setNotice] = useState('');
  const storageKey = `bord-nutrition-draft-v1:${scope}`;
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  useEffect(() => {
    if (!dirty || !notice.includes('unavailable')) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const navigate = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.target === '_blank' || anchor.getAttribute('href')?.startsWith('#'))
        return;
      if (
        !window.confirm(
          'Draft recovery is unavailable. Leave this page and discard these unsaved fields?',
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', protect);
    document.addEventListener('click', navigate, true);
    return () => {
      window.removeEventListener('beforeunload', protect);
      document.removeEventListener('click', navigate, true);
    };
  }, [dirty, notice]);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (!raw || raw.length > 64_000 || edited.current || !active) return;
        const stored = JSON.parse(raw) as { values?: unknown };
        if (!stored.values || typeof stored.values !== 'object' || Array.isArray(stored.values))
          return;
        const entries = Object.entries(stored.values);
        if (
          entries.length > 100 ||
          entries.some(
            ([key, value]) => key.length > 150 || typeof value !== 'string' || value.length > 4_000,
          )
        )
          return;
        const recovered = { ...initial.current, ...stored.values } as T;
        current.current = recovered;
        setDraft(recovered);
        setNotice('Draft restored in this tab. Review its date and values before saving.');
      } catch {
        if (active) setNotice('Draft recovery is unavailable. Keep this page open while editing.');
      }
    });
    return () => {
      active = false;
    };
  }, [storageKey]);
  function update(patch: Partial<T>) {
    edited.current = true;
    const next = { ...current.current, ...patch };
    current.current = next;
    setDraft(next);
    try {
      const payload = JSON.stringify({ values: next });
      if (
        payload.length > 64_000 ||
        Object.keys(next).length > 100 ||
        Object.values(next).some((value) => value.length > 4_000)
      )
        throw new Error('Draft is too large for recovery');
      sessionStorage.setItem(storageKey, payload);
    } catch {
      setNotice('Draft recovery is unavailable. Keep this page open while editing.');
    }
  }
  function clear(next?: T) {
    if (next) {
      initial.current = next;
      setBaseline(next);
    }
    edited.current = false;
    current.current = initial.current;
    setDraft(initial.current);
    setNotice('');
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* Editing remains available. */
    }
  }
  return {
    draft,
    update,
    clear,
    notice,
    dirty,
  };
}
