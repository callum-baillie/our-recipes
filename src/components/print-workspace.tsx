'use client';
import { useEffect, useRef, useState } from 'react';
import { AsyncSkeleton, ButtonSpinner } from './skeleton';
import {
  BookOpen,
  CalendarDays,
  ShoppingBasket,
  Package,
  Download,
  Printer,
  RefreshCw,
} from 'lucide-react';
import { PageHeader } from './page-header';
import { exportOptionsSchema, type PdfExportOptions } from '@/lib/domain/pdf-export';
import { localIsoDate } from '@/lib/domain/local-date';
import styles from './print-workspace.module.css';
type Choice = { id: string; name: string };
type Kind = 'recipes' | 'meal-plan' | 'shopping-list' | 'pantry';
const kinds = [
  { value: 'recipes', label: 'Recipe cards', icon: BookOpen },
  { value: 'meal-plan', label: 'Meal plans', icon: CalendarDays },
  { value: 'shopping-list', label: 'Grocery lists', icon: ShoppingBasket },
  { value: 'pantry', label: 'Pantry inventory', icon: Package },
] as const;
export function PrintWorkspace({
  initial,
  recipes,
  lists,
  stores,
  locations,
}: {
  initial: Record<string, string>;
  recipes: { id: string; title: string }[];
  lists: Choice[];
  stores: Choice[];
  locations: Choice[];
}) {
  const [kind, setKind] = useState<Kind>(
    kinds.some((item) => item.value === initial.kind) ? (initial.kind as Kind) : 'recipes',
  );
  const [selected, setSelected] = useState(
    initial.recipes
      ?.split(',')
      .filter((id) => recipes.some((recipe) => recipe.id === id))
      .slice(0, 100) ?? [],
  );
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<PdfExportOptions>(() => exportOptionsSchema.parse({}));
  const [start, setStart] = useState(
    initial.start ?? localIsoDate(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone),
  );
  const [end, setEnd] = useState(
    initial.end ?? localIsoDate(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone),
  );
  const [includeRecipes, setIncludeRecipes] = useState(true);
  const [includeChecked, setIncludeChecked] = useState(false);
  const [includeDates, setIncludeDates] = useState(true);
  const [countColumn, setCountColumn] = useState(true);
  const [listId, setListId] = useState(initial.list ?? lists[0]?.id ?? '');
  const [locationId, setLocationId] = useState('');
  const [servings, setServings] = useState('');
  const [preview, setPreview] = useState<{
    url: string;
    fingerprint: string;
    filename: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const objectUrl = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const common = {
    ...options,
    organizeByStore:
      options.organizeByStore &&
      (kind === 'shopping-list' ||
        (options.includeIngredients &&
          (kind === 'recipes' || (kind === 'meal-plan' && includeRecipes)))),
    format: 'pdf',
  };
  const payload =
    kind === 'recipes'
      ? { ...common, recipeIds: selected, ...(servings ? { servings: Number(servings) } : {}) }
      : kind === 'meal-plan'
        ? { ...common, start, end, includeRecipes }
        : {
            ...common,
            includeChecked,
            includeDates,
            countColumn,
            ...(locationId && kind === 'pantry' ? { locationId } : {}),
          };
  const endpoint =
    kind === 'recipes'
      ? '/api/v1/exports/recipes/pdf'
      : kind === 'meal-plan'
        ? '/api/v1/meal-plan/export/pdf'
        : kind === 'pantry'
          ? '/api/v1/pantry/export/pdf'
          : `/api/v1/shopping-lists/${listId}/export/pdf`;
  const fingerprint = JSON.stringify({ endpoint, payload });
  const valid =
    kind === 'recipes' ? selected.length > 0 : kind === 'shopping-list' ? !!listId : true;
  const stale = preview?.fingerprint !== fingerprint;
  function option<K extends keyof PdfExportOptions>(key: K, value: PdfExportOptions[K]) {
    setOptions((current) => ({ ...current, [key]: value }));
  }
  async function generate(format: 'pdf' | 'zip' = 'pdf') {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, format }),
        signal: abort.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? 'The print pack could not be prepared.');
      }
      const blob = await response.blob();
      if (abort.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const filename =
        response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ??
        `bord-export.${format}`;
      if (format === 'zip') {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = url;
        setPreview({ url, fingerprint, filename });
      }
    } catch (cause) {
      if (!abort.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'Export failed.');
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  useEffect(
    () => () => {
      controller.current?.abort();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );
  // First preview is requested once; subsequent expensive renders are explicit.
  const initialPreview = useRef(false);
  useEffect(() => {
    if (initialPreview.current || !valid) return;
    const timer = window.setTimeout(() => {
      initialPreview.current = true;
      void generate();
    }, 0);
    return () => window.clearTimeout(timer);
  });
  const check = (
    key:
      | 'includeIngredients'
      | 'ingredientCheckboxes'
      | 'includeMethod'
      | 'includeImage'
      | 'includeNutrition'
      | 'includeNotes'
      | 'includeEquipment'
      | 'includeSource'
      | 'organizeByStore',
    label: string,
  ) => (
    <label className={styles.check}>
      <input
        type="checkbox"
        checked={options[key]}
        onChange={(event) => option(key, event.target.checked)}
      />
      {label}
    </label>
  );
  const matches = recipes.filter((recipe) =>
    recipe.title.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <main className={styles.page}>
      <PageHeader
        title="Export & print"
        description="Choose what goes on paper, preview it, then print or download."
      />
      <div className={styles.workspace}>
        <aside className={styles.sidebar} aria-label="Print options">
          <nav className={styles.types} aria-label="Document type">
            {kinds.map((item) => (
              <button
                key={item.value}
                onClick={() => setKind(item.value)}
                aria-pressed={kind === item.value}
              >
                <item.icon size={19} />
                {item.label}
              </button>
            ))}
          </nav>
          <section>
            <h2>Paper & download</h2>
            <label>
              Paper size
              <select
                value={options.paper}
                onChange={(event) => option('paper', event.target.value as 'A4' | 'Letter')}
              >
                <option>A4</option>
                <option value="Letter">US Letter</option>
              </select>
            </label>
          </section>
          {kind === 'recipes' && (
            <section>
              <h2>
                Recipe cards <small>{selected.length}/100</small>
              </h2>
              <input
                aria-label="Find recipes to print"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find recipes…"
              />
              <div className={styles.selectionActions}>
                <button
                  onClick={() =>
                    setSelected((current) =>
                      [...new Set([...current, ...matches.map((item) => item.id)])].slice(0, 100),
                    )
                  }
                >
                  Select matching (up to 100)
                </button>
                <button onClick={() => setSelected([])}>Clear</button>
              </div>
              <div className={styles.recipeChoices}>
                {matches.map((recipe) => (
                  <label className={styles.check} key={recipe.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(recipe.id)}
                      disabled={!selected.includes(recipe.id) && selected.length >= 100}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, recipe.id]
                            : current.filter((id) => id !== recipe.id),
                        )
                      }
                    />
                    {recipe.title}
                  </label>
                ))}
              </div>
              {selected.length === 1 && (
                <label>
                  Servings
                  <input
                    type="number"
                    min="0.01"
                    max="1000"
                    step="any"
                    value={servings}
                    onChange={(event) => setServings(event.target.value)}
                    placeholder="Original recipe servings"
                  />
                </label>
              )}
            </section>
          )}
          {kind === 'meal-plan' && (
            <section>
              <h2>Meal schedule</h2>
              <label>
                First day
                <input
                  type="date"
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                />
              </label>
              <label>
                Last day
                <input
                  type="date"
                  min={start}
                  value={end}
                  onChange={(event) => setEnd(event.target.value)}
                />
              </label>
              <p>Up to eight weeks, with each seven-day schedule on its own page.</p>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={includeRecipes}
                  onChange={(event) => setIncludeRecipes(event.target.checked)}
                />
                Include separate recipe cards
              </label>
              <a
                href={`/api/v1/meal-plan/export?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`}
              >
                Download calendar (.ics)
              </a>
            </section>
          )}
          {(kind === 'recipes' || (kind === 'meal-plan' && includeRecipes)) && (
            <section>
              <h2>Recipe sections</h2>
              {check('includeIngredients', 'Ingredients')}
              {options.includeIngredients && (
                <div className={styles.suboptions}>
                  {check('ingredientCheckboxes', 'Checkboxes for shopping')}
                  {check('organizeByStore', 'Order ingredients by store')}
                </div>
              )}
              {check('includeMethod', 'Numbered method')}
              {check('includeImage', 'Recipe photo')}
              {check('includeNutrition', 'Nutrition information')}
              {check('includeEquipment', 'Equipment')}
              {check('includeSource', 'Recipe source')}
            </section>
          )}
          {kind === 'shopping-list' && (
            <section>
              <h2>Grocery list</h2>
              <label>
                List
                <select value={listId} onChange={(event) => setListId(event.target.value)}>
                  {lists.map((list) => (
                    <option value={list.id} key={list.id}>
                      {list.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={includeChecked}
                  onChange={(event) => setIncludeChecked(event.target.checked)}
                />
                Include checked items
              </label>
              {check('organizeByStore', 'Use a store route')}
            </section>
          )}
          {common.organizeByStore && kind !== 'pantry' && (
            <section>
              <label>
                Store
                <select
                  value={options.storeId ?? ''}
                  onChange={(event) => option('storeId', event.target.value || undefined)}
                >
                  <option value="">Choose a store</option>
                  {stores.map((store) => (
                    <option value={store.id} key={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </label>
              <p>Uses your saved aisle route and item mappings. Unassigned items stay together.</p>
            </section>
          )}
          {kind === 'pantry' && (
            <section>
              <h2>Inventory sheet</h2>
              <label>
                Location
                <select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                  <option value="">All locations</option>
                  {locations.map((location) => (
                    <option value={location.id} key={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={includeDates}
                  onChange={(event) => setIncludeDates(event.target.checked)}
                />
                Recorded expiry dates
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={countColumn}
                  onChange={(event) => setCountColumn(event.target.checked)}
                />
                Space to write a stock count
              </label>
            </section>
          )}
          <section>{check('includeNotes', 'Notes and kitchen tips')}</section>
          {kind === 'recipes' && selected.length === 1 && (
            <details>
              <summary>Other formats</summary>
              <a href={`/api/v1/recipes/${selected[0]}/export`} download>
                JSON-LD
              </a>
              <a href={`/api/v1/recipes/${selected[0]}/export/markdown`} download>
                Markdown
              </a>
            </details>
          )}
          <button
            className={styles.primary}
            disabled={busy || !valid}
            onClick={() => void generate()}
          >
            {busy ? <ButtonSpinner /> : <RefreshCw size={17} />}
            {busy ? 'Preparing PDF…' : stale ? 'Update preview' : 'Refresh preview'}
          </button>
        </aside>
        <section className={styles.preview} aria-label="PDF preview" aria-busy={busy}>
          <header>
            <p role="status">
              {busy
                ? 'Preparing your print pack…'
                : preview
                  ? stale
                    ? 'Options changed — update the preview.'
                    : 'Preview is up to date.'
                  : 'Select content to preview.'}
            </p>
            <div>
              {preview && (
                <>
                  <a href={preview.url} target="_blank" rel="noreferrer">
                    {stale ? 'Open previous preview' : 'Open PDF'}
                  </a>
                  {stale ? (
                    <button disabled title="Update the preview to download your changed options">
                      <Download size={17} />
                      Download PDF
                    </button>
                  ) : (
                    <a href={preview.url} download={preview.filename}>
                      <Download size={17} />
                      Download PDF
                    </a>
                  )}
                  <button
                    disabled={busy || stale}
                    onClick={() => {
                      try {
                        frame.current?.contentWindow?.focus();
                        frame.current?.contentWindow?.print();
                      } catch {
                        window.open(preview.url, '_blank', 'noopener');
                      }
                    }}
                  >
                    <Printer size={17} />
                    Print
                  </button>
                </>
              )}
              <button disabled={busy || !valid} onClick={() => void generate('zip')}>
                Download ZIP
              </button>
            </div>
          </header>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <div className={styles.previewDocument}>
            {busy ? (
              <AsyncSkeleton
                className={styles.documentLoading}
                label="Preparing printable document"
                variant="panel"
              />
            ) : null}
            {preview ? (
              <iframe ref={frame} src={preview.url} title="Your printable PDF" />
            ) : (
              <div className={styles.empty}>
                <Printer size={44} />
                <h2>{busy ? 'Preparing your preview' : 'Your print preview'}</h2>
                <p>
                  {valid
                    ? 'Your document will appear here.'
                    : 'Choose at least one recipe or a shopping list to begin.'}
                </p>
              </div>
            )}
          </div>
          <p className={styles.hint}>
            If your mobile browser cannot display or print the embedded PDF, use Open PDF and its
            share/print menu.
          </p>
        </section>
      </div>
    </main>
  );
}
