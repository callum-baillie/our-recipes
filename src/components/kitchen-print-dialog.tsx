'use client';

import { Download, Printer, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import styles from './kitchen-print-dialog.module.css';

type RecipeChoice = { id: string; title: string };
type PrintProps =
  | { kind: 'recipes'; recipes: RecipeChoice[]; browse?: boolean }
  | { kind: 'meal-plan'; start: string; end: string };
function daysAfter(day: string, days: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function KitchenPrintDialog(props: PrintProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [paper, setPaper] = useState('A4');
  const [format, setFormat] = useState('pdf');
  const [nutrition, setNutrition] = useState(true);
  const [notes, setNotes] = useState(true);
  const [includeRecipes, setIncludeRecipes] = useState(true);
  const [start, setStart] = useState(props.kind === 'meal-plan' ? props.start : '');
  const [end, setEnd] = useState(props.kind === 'meal-plan' ? props.end : '');
  const [servings, setServings] = useState('');
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    props.kind === 'recipes' && !props.browse
      ? Object.fromEntries(props.recipes.map((r) => [r.id, r.title]))
      : {},
  );
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [choices, setChoices] = useState<RecipeChoice[]>(
    props.kind === 'recipes' ? props.recipes : [],
  );
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searchError, setSearchError] = useState('');
  const browse = props.kind === 'recipes' && Boolean(props.browse);
  const single = props.kind === 'recipes' && !props.browse && props.recipes.length === 1;
  const title =
    props.kind === 'meal-plan'
      ? 'Print your meal plan'
      : single
        ? 'Print recipe card'
        : 'Print recipe collection';
  useEffect(() => {
    if (!open || !browse) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setSearchError('');
      try {
        const response = await fetch(
          `/api/v1/recipes?${new URLSearchParams({ q: query, page: String(page), sort: 'alphabetical' })}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error('Your recipes could not be loaded. Please try again.');
        const body = await response.json();
        if (controller.signal.aborted) return;
        setChoices(body.library.recipes);
        setPages(body.library.totalPages);
      } catch (error) {
        if (!controller.signal.aborted)
          setSearchError(error instanceof Error ? error.message : 'Unable to load recipes.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, browse, page, query]);
  function show() {
    setError('');
    if (props.kind === 'meal-plan') {
      setStart(props.start);
      setEnd(props.end);
    }
    setOpen(true);
    dialog.current?.showModal();
  }
  async function download(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const common = { paper, format, includeNutrition: nutrition, includeNotes: notes };
      const payload =
        props.kind === 'meal-plan'
          ? { ...common, start, end, includeRecipes }
          : {
              ...common,
              recipeIds: Object.keys(selected),
              ...(single && servings ? { servings: Number(servings) } : {}),
            };
      const response = await fetch(
        props.kind === 'meal-plan' ? '/api/v1/meal-plan/export/pdf' : '/api/v1/exports/recipes/pdf',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.error?.message ?? 'The print pack could not be prepared. Please try again.',
        );
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download =
        response.headers.get('content-disposition')?.match(/filename="([^"]+)"/u)?.[1] ??
        `bord-print-pack.${format}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      dialog.current?.close();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The download failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className={styles.trigger} type="button" onClick={show}>
        <Printer size={17} aria-hidden="true" />
        {props.kind === 'meal-plan'
          ? 'Print / export'
          : single
            ? 'Print recipe card'
            : 'Print / export recipes'}
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        onClose={() => setOpen(false)}
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
        aria-label={title}
      >
        <header>
          <div>
            <p className="eyebrow">READY FOR YOUR KITCHEN</p>
            <h2>{title}</h2>
            <p>
              {props.kind === 'meal-plan'
                ? 'A day-by-day schedule, with recipe cards ready to cook from.'
                : 'Keep your favourites together or give each recipe its own PDF.'}
            </p>
          </div>
          <button
            type="button"
            className={styles.close}
            disabled={busy}
            onClick={() => dialog.current?.close()}
            aria-label="Close print options"
          >
            <X size={22} />
          </button>
        </header>
        <form onSubmit={download}>
          <fieldset disabled={busy} className={styles.fields}>
            {props.kind === 'meal-plan' ? (
              <section>
                <h3>1. Choose your dates</h3>
                <div className={styles.row}>
                  <label>
                    From
                    <input
                      type="date"
                      required
                      value={start}
                      onChange={(e) => {
                        setStart(e.target.value);
                        if (e.target.value > end) setEnd(e.target.value);
                      }}
                    />
                  </label>
                  <label>
                    Through
                    <input
                      type="date"
                      required
                      min={start}
                      max={start ? daysAfter(start, 55) : undefined}
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                    />
                  </label>
                </div>
                <div className={styles.presets} aria-label="Date range shortcuts">
                  {[1, 2, 4, 8].map((weeks) => (
                    <button
                      key={weeks}
                      type="button"
                      onClick={() => setEnd(daysAfter(start, weeks * 7 - 1))}
                      disabled={!start}
                    >
                      {weeks} week{weeks === 1 ? '' : 's'}
                    </button>
                  ))}
                </div>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={includeRecipes}
                    onChange={(e) => setIncludeRecipes(e.target.checked)}
                  />
                  <span>
                    Include recipe cards
                    <small>
                      Sized for the servings in your plan. Repeated recipes share a card when the
                      version and serving count match.
                    </small>
                  </span>
                </label>
              </section>
            ) : browse ? (
              <section>
                <h3>
                  1. Choose recipes <span>{Object.keys(selected).length} / 100</span>
                </h3>
                <label className={styles.search}>
                  <Search size={17} />
                  <input
                    aria-label="Find recipes to export"
                    type="search"
                    placeholder="Find a recipe…"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
                <div className={styles.presets}>
                  <button
                    type="button"
                    disabled={loading || !!searchError}
                    onClick={() =>
                      setSelected((current) =>
                        Object.fromEntries(
                          Object.entries({
                            ...current,
                            ...Object.fromEntries(choices.map((r) => [r.id, r.title])),
                          }).slice(0, 100),
                        ),
                      )
                    }
                  >
                    Select this page
                  </button>
                  <button type="button" onClick={() => setSelected({})}>
                    Clear selection
                  </button>
                </div>
                {searchError ? (
                  <p role="alert" className={styles.error}>
                    {searchError}
                  </p>
                ) : null}
                <div className={styles.choices} aria-busy={loading}>
                  {loading ? (
                    <p>Finding recipes…</p>
                  ) : choices.length ? (
                    choices.map((recipe) => (
                      <label key={recipe.id} className={styles.check}>
                        <input
                          type="checkbox"
                          checked={Boolean(selected[recipe.id])}
                          disabled={Object.keys(selected).length >= 100 && !selected[recipe.id]}
                          onChange={(e) =>
                            setSelected((current) => {
                              const next = { ...current };
                              if (e.target.checked) next[recipe.id] = recipe.title;
                              else delete next[recipe.id];
                              return next;
                            })
                          }
                        />
                        <span>{recipe.title}</span>
                      </label>
                    ))
                  ) : (
                    <p>No matching recipes. Try another search.</p>
                  )}
                </div>
                {pages > 1 ? (
                  <div className={styles.presets}>
                    <button
                      type="button"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </button>
                    <span>
                      Page {page} of {pages}
                    </span>
                    <button
                      type="button"
                      disabled={page >= pages || loading}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </button>
                  </div>
                ) : null}
                <p className={styles.help}>
                  Selections stay with you as you search or change pages.
                </p>
              </section>
            ) : (
              <section>
                <h3>{props.recipes.map((r) => r.title).join(', ')}</h3>
                {single ? (
                  <label>
                    Servings (optional)
                    <input
                      type="number"
                      min="0.01"
                      max="1000"
                      step="any"
                      placeholder="Use the recipe’s original servings"
                      value={servings}
                      onChange={(e) => setServings(e.target.value)}
                    />
                  </label>
                ) : null}
              </section>
            )}
            <section>
              <h3>{single ? 'Options' : '2. Choose your print pack'}</h3>
              <div className={styles.row}>
                <label>
                  Paper size
                  <select value={paper} onChange={(e) => setPaper(e.target.value)}>
                    <option>A4</option>
                    <option value="Letter">US Letter</option>
                  </select>
                </label>
                <label>
                  Download
                  <select value={format} onChange={(e) => setFormat(e.target.value)}>
                    <option value="pdf">One combined PDF</option>
                    <option value="zip">Separate PDFs in a ZIP</option>
                  </select>
                </label>
              </div>
              <p className={styles.help}>
                {format === 'pdf'
                  ? 'Each recipe starts on a new page. Open the PDF to print it.'
                  : 'The ZIP contains a separate PDF for each recipe, plus the schedule when included.'}
              </p>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={nutrition}
                  onChange={(e) => setNutrition(e.target.checked)}
                />
                Nutrition estimates
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={notes}
                  onChange={(e) => setNotes(e.target.checked)}
                />
                Kitchen notes and tips
              </label>
            </section>
          </fieldset>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <footer>
            <span aria-live="polite">
              {busy
                ? 'Preparing your print pack…'
                : props.kind === 'recipes'
                  ? `${Object.keys(selected).length} recipe${Object.keys(selected).length === 1 ? '' : 's'} selected`
                  : 'Skipped and cancelled meals are left out.'}
            </span>
            <button
              className="primary-button"
              disabled={busy || (props.kind === 'recipes' && !Object.keys(selected).length)}
              type="submit"
            >
              <Download size={17} />
              {busy ? 'Preparing…' : 'Download'}
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
}
