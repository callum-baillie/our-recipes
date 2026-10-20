'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
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
import {
  calendarDateSchema,
  exportDateLabel,
  exportOptionsSchema,
  type PdfExportOptions,
} from '@/lib/domain/pdf-export';
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
type Prepared = {
  url: string;
  fingerprint: string;
  filename: string;
  identity: string;
  preparedAt: string;
};
export function PrintWorkspace({
  initial,
  recipes,
  lists,
  stores,
  locations,
}: {
  initial: Record<string, string>;
  recipes: { id: string; title: string; servings?: string }[];
  lists: Choice[];
  stores: Choice[];
  locations: Choice[];
}) {
  const [kind, setKind] = useState<Kind>(
    kinds.some((item) => item.value === initial.kind) ? (initial.kind as Kind) : 'recipes',
  );
  const [selected, setSelected] = useState<string[]>(
    [
      ...new Set(
        initial.recipes?.split(',').filter((id) => recipes.some((recipe) => recipe.id === id)) ??
          [],
      ),
    ].slice(0, 100),
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
  const [servingDrafts, setServingDrafts] = useState<Record<string, string>>({});
  const [selectionNotice, setSelectionNotice] = useState('');
  const [preview, setPreview] = useState<Prepared | null>(null);
  const [operation, setOperation] = useState<{ format: 'pdf' | 'zip'; identity: string } | null>(
    null,
  );
  const [failure, setFailure] = useState<{
    format: 'pdf' | 'zip';
    message: string;
    identity: string;
  } | null>(null);
  const [zipStatus, setZipStatus] = useState('');
  const [printStatus, setPrintStatus] = useState('');
  const objectUrl = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const single = selected.length === 1 ? selected[0] : undefined;
  const servings = single ? (servingDrafts[single] ?? '') : '';
  const servingError =
    servings !== '' &&
    (!Number.isFinite(Number(servings)) || Number(servings) <= 0 || Number(servings) > 1000)
      ? 'Enter a yield greater than 0 and no more than 1,000, or leave it blank for the original yield.'
      : '';
  const datesValid =
    calendarDateSchema.safeParse(start).success && calendarDateSchema.safeParse(end).success;
  const days = datesValid ? Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1 : 0;
  const calendarValid = datesValid && days > 0;
  const rangeError = !datesValid
    ? 'Enter a real first and last day.'
    : days < 1
      ? 'The last day must be on or after the first day.'
      : days > 56
        ? 'PDF and ZIP schedules support 1–56 days. Shorten the range; calendar export has its own scope.'
        : '';
  const recipeSections = kind === 'recipes' || (kind === 'meal-plan' && includeRecipes);
  const common = {
    ...options,
    organizeByStore:
      options.organizeByStore &&
      (kind === 'shopping-list' || (recipeSections && options.includeIngredients)),
    format: 'pdf' as const,
  };
  const routeError =
    common.organizeByStore && !stores.some((store) => store.id === options.storeId)
      ? stores.length
        ? 'Choose an available store for this export.'
        : 'No saved stores are available. Add a store in Household settings, or turn off the route override.'
      : '';
  const sourceError =
    kind === 'recipes'
      ? !selected.length
        ? recipes.length
          ? 'Choose at least one recipe.'
          : 'Your recipebook has no recipes to print.'
        : servingError
      : kind === 'shopping-list' && !lists.some((list) => list.id === listId)
        ? listId
          ? 'This list is unavailable or archived. Choose an available list explicitly.'
          : 'There are no available grocery lists to print.'
        : kind === 'meal-plan'
          ? rangeError
          : '';
  const valid = !sourceError && !routeError;
  const payload =
    kind === 'recipes'
      ? {
          ...common,
          recipeIds: selected,
          ...(single && servings && !servingError ? { servings: Number(servings) } : {}),
        }
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
          : `/api/v1/shopping-lists/${encodeURIComponent(listId)}/export/pdf`;
  const fingerprint = JSON.stringify({ endpoint, payload });
  const stale = !valid || preview?.fingerprint !== fingerprint;
  const period = calendarValid
    ? `${exportDateLabel(start)} – ${exportDateLabel(end)} · ${days} ${days === 1 ? 'day' : 'days'} · ${Math.ceil(days / 7)} seven-day ${days <= 7 ? 'section' : 'sections'}`
    : 'Choose a date range';
  const context =
    kind === 'recipes'
      ? `${selected.length} ${selected.length === 1 ? 'recipe' : 'recipes'} selected${single ? ` · ${recipes.find((r) => r.id === single)?.title ?? ''}` : ' · selection order'}`
      : kind === 'meal-plan'
        ? period
        : kind === 'pantry'
          ? `Active stock batches · ${locations.find((location) => location.id === locationId)?.name ?? 'All locations'}${locationId ? ' · this location only' : ''}`
          : (lists.find((list) => list.id === listId)?.name ?? 'Unavailable grocery list');
  const identity = `${kinds.find((item) => item.value === kind)!.label} · ${context} · ${options.paper}`;
  const matches = recipes.filter((recipe) =>
    recipe.title.toLowerCase().includes(query.toLowerCase()),
  );
  const hiddenSelected = selected.filter(
    (id) => !matches.some((recipe) => recipe.id === id),
  ).length;
  function option<K extends keyof PdfExportOptions>(key: K, value: PdfExportOptions[K]) {
    setOptions((current) => ({ ...current, [key]: value }));
  }
  async function generate(format: 'pdf' | 'zip' = 'pdf') {
    if (lock.current || !valid) return;
    lock.current = true;
    const abort = new AbortController();
    controller.current = abort;
    setOperation({ format, identity });
    setFailure(null);
    setPrintStatus('');
    if (format === 'zip') setZipStatus('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, format }),
        signal: abort.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.error?.message ?? `The ${format.toUpperCase()} could not be prepared. Try again.`,
        );
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
        setZipStatus(`ZIP prepared; download started. ${identity}.`);
      } else {
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = url;
        setPreview({ url, fingerprint, filename, identity, preparedAt: new Date().toISOString() });
      }
    } catch (cause) {
      if (!abort.signal.aborted)
        setFailure({
          format,
          identity,
          message: cause instanceof Error ? cause.message : 'Export failed. Try again.',
        });
    } finally {
      if (!abort.signal.aborted) {
        lock.current = false;
        setOperation(null);
      }
    }
  }
  useEffect(
    () => () => {
      controller.current?.abort();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );
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
  const storeControl = common.organizeByStore ? (
    <div className={styles.suboptions}>
      <label>
        <span id="print-store-label">Store</span>
        <select
          aria-labelledby="print-store-label"
          value={options.storeId ?? ''}
          onChange={(event) => option('storeId', event.target.value || undefined)}
          aria-invalid={!!routeError}
          aria-describedby="print-route-help"
        >
          <option value="">Choose a store</option>
          {stores.map((store) => (
            <option value={store.id} key={store.id}>
              {store.name}
            </option>
          ))}
        </select>
      </label>
      <p id="print-route-help">
        {routeError ||
          'Uses saved aisle routes and item mappings for this export only. Unassigned items stay together.'}
      </p>
    </div>
  ) : null;
  const updateAction = (
    <button
      type="button"
      className={stale ? 'primary-button' : 'secondary-button'}
      disabled={!!operation || !valid}
      onClick={() => void generate()}
    >
      {operation?.format === 'pdf' ? <ButtonSpinner /> : <RefreshCw size={17} />}
      {operation?.format === 'pdf' ? 'Preparing PDF…' : stale ? 'Update preview' : 'Refresh PDF'}
    </button>
  );
  return (
    <main className={styles.page}>
      <PageHeader
        title="Export & print"
        description="Prepare a document, then open, print or download it."
      />
      <div className={styles.context}>
        <p>
          {context} · {options.paper}
        </p>
        <nav aria-label="Print workspace sections">
          <a href="#print-options">Options</a>
          <a href="#print-output">Document & downloads</a>
        </nav>
      </div>
      <div className={styles.workspace}>
        <aside
          id="print-options"
          tabIndex={-1}
          className={styles.sidebar}
          aria-label="Print options"
        >
          <nav className={styles.types} aria-label="Document type">
            {kinds.map((item) => (
              <button
                type="button"
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
            <h2>Paper</h2>
            <label>
              <span id="print-paper-label">Paper size</span>
              <select
                aria-labelledby="print-paper-label"
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
              <h2>Choose recipes</h2>
              <p>
                {selected.length} {selected.length === 1 ? 'recipe' : 'recipes'} selected · up to
                100
              </p>
              <input
                aria-label="Find recipes to print"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find recipes…"
              />
              <p>
                {matches.length} matching {matches.length === 1 ? 'recipe' : 'recipes'}
                {hiddenSelected ? ` · ${hiddenSelected} selected outside this search` : ''}
              </p>
              <div className={styles.selectionActions}>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    const additions = matches.filter((item) => !selected.includes(item.id));
                    const added = additions.slice(0, 100 - selected.length);
                    setSelected((current) => [...current, ...added.map((item) => item.id)]);
                    setSelectionNotice(
                      `Added ${added.length} matching recipes.${additions.length > added.length ? ' The 100-card limit leaves some matches unselected.' : ''}`,
                    );
                  }}
                >
                  Add matching recipes
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setSelected([]);
                    setSelectionNotice(
                      'All selections cleared, including those outside this search.',
                    );
                  }}
                >
                  Clear all selections
                </button>
              </div>
              {selectionNotice && <p role="status">{selectionNotice}</p>}
              {selected.length >= 100 && (
                <p>100-card limit reached. Deselect a recipe to add another.</p>
              )}
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
              {!matches.length && (
                <p>
                  {recipes.length ? (
                    <>
                      No recipes match.{' '}
                      <button type="button" className="text-button" onClick={() => setQuery('')}>
                        Clear search
                      </button>
                    </>
                  ) : (
                    <>
                      Your recipebook is empty. <Link href="/recipes">Open recipes</Link>
                    </>
                  )}
                </p>
              )}
              {!!selected.length && (
                <details className={styles.disclosure}>
                  <summary>Review selected recipes ({selected.length})</summary>
                  <p>Cards follow this selection order.</p>
                  <ol>
                    {selected.map((id) => (
                      <li key={id}>
                        {recipes.find((r) => r.id === id)?.title}
                        <button
                          type="button"
                          className="text-button"
                          aria-label={`Remove ${recipes.find((r) => r.id === id)?.title}`}
                          onClick={() =>
                            setSelected((current) => current.filter((value) => value !== id))
                          }
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
              {single && (
                <label>
                  <span id="print-serving-label">Yield for this exported card</span>
                  <input
                    type="number"
                    min="0.01"
                    max="1000"
                    step="any"
                    value={servings}
                    onChange={(event) =>
                      setServingDrafts((current) => ({ ...current, [single]: event.target.value }))
                    }
                    placeholder="Original recipe yield"
                    aria-labelledby="print-serving-label"
                    aria-invalid={!!servingError}
                    aria-describedby="print-serving-help"
                  />
                  <small id="print-serving-help">
                    {servingError ||
                      `Original yield: ${recipes.find((r) => r.id === single)?.servings || 'not recorded'}. Blank keeps the original yield. Quantities stay unchanged if its base yield is not numeric.`}
                  </small>
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
                  aria-describedby="print-range-help"
                />
              </label>
              <label>
                Last day
                <input
                  type="date"
                  min={start}
                  value={end}
                  onChange={(event) => setEnd(event.target.value)}
                  aria-invalid={!!rangeError}
                  aria-describedby="print-range-help"
                />
              </label>
              <p id="print-range-help">{rangeError || period}</p>
              <p>
                Seven-day sections start on First day; dense content can continue onto another page.
              </p>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={includeRecipes}
                  onChange={(event) => setIncludeRecipes(event.target.checked)}
                />
                Append recipe cards to the schedule
              </label>
              <p>
                Cards use each meal’s planned recipe version, adaptations and servings. Repeated
                unchanged recipes share a card only when version and servings match.
              </p>
              <p>
                {includeRecipes
                  ? 'PDF: schedule followed by recipe cards. ZIP: schedule PDF, individual card PDFs and a README.'
                  : 'Schedule only. Existing saved meal content is unchanged.'}
              </p>
              <Link href="/planner">Review planned meals</Link>
            </section>
          )}
          {recipeSections && (
            <section>
              <h2>Recipe content</h2>
              {check('includeIngredients', 'Ingredients')}
              {options.includeIngredients && (
                <div className={styles.suboptions}>
                  {check('ingredientCheckboxes', 'Ingredient checkboxes')}
                  {check('organizeByStore', 'Group ingredients by store aisle')}
                  <p>Store grouping retains the original ingredient group names.</p>
                  {storeControl}
                </div>
              )}
              {check('includeMethod', 'Cooking method (numbered)')}
              <details className={styles.disclosure}>
                <summary>Optional recipe details</summary>
                {check('includeImage', 'Recipe photo')}
                {check('includeNutrition', 'Recipe-provided nutrition per serving')}
                {check('includeEquipment', 'Equipment')}
                {check('includeSource', 'Recipe source')}
              </details>
            </section>
          )}
          {kind === 'shopping-list' && (
            <section>
              <h2>Grocery list</h2>
              <label>
                <span id="print-list-label">List</span>
                <select
                  aria-labelledby="print-list-label"
                  value={listId}
                  onChange={(event) => setListId(event.target.value)}
                  aria-invalid={!!sourceError}
                >
                  {!lists.some((list) => list.id === listId) && (
                    <option value={listId}>
                      {listId ? 'Requested list unavailable or archived' : 'No available lists'}
                    </option>
                  )}
                  {lists.map((list) => (
                    <option value={list.id} key={list.id}>
                      {list.name}
                    </option>
                  ))}
                </select>
              </label>
              {sourceError && (
                <p>
                  {sourceError} <Link href="/lists">Open lists</Link>
                </p>
              )}
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={includeChecked}
                  onChange={(event) => setIncludeChecked(event.target.checked)}
                />
                Include completed (checked) items
              </label>
              <p>Default order uses saved list aisles and its store route where available.</p>
              {check('organizeByStore', 'Choose another store route for this export')}
              {storeControl}
            </section>
          )}
          {kind === 'pantry' && (
            <section>
              <h2>Stock batches</h2>
              <label>
                <span id="print-location-label">Location</span>
                <select
                  aria-labelledby="print-location-label"
                  value={locationId}
                  onChange={(event) => setLocationId(event.target.value)}
                >
                  <option value="">All locations</option>
                  {locations.map((location) => (
                    <option value={location.id} key={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                Active batches only. A selected location includes that location, without its
                descendants. Pantry browsing filters are not carried here.
              </p>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={includeDates}
                  onChange={(event) => setIncludeDates(event.target.checked)}
                />
                Include date details
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
          <section>
            {check(
              'includeNotes',
              kind === 'pantry'
                ? 'Include stock notes'
                : kind === 'shopping-list'
                  ? 'Include list and item notes'
                  : 'Include recipe and meal notes',
            )}
          </section>
          {kind === 'recipes' && single && (
            <details className={styles.disclosure}>
              <summary>Other recipe formats</summary>
              <p>
                Exports the saved recipe itself. These files do not inherit PDF sections or the
                yield override.
              </p>
              <a href={`/api/v1/recipes/${single}/export`} download>
                Download JSON-LD
              </a>
              <a href={`/api/v1/recipes/${single}/export/markdown`} download>
                Download Markdown
              </a>
            </details>
          )}
          <div className={styles.prepare}>
            {(sourceError || routeError) && <p role="status">{sourceError || routeError}</p>}
            {updateAction}
            <a href="#print-output">Go to document & downloads</a>
          </div>
        </aside>
        <section
          id="print-output"
          tabIndex={-1}
          className={styles.preview}
          aria-label="PDF preview"
          aria-busy={operation?.format === 'pdf'}
        >
          <header>
            <h2>Prepared document</h2>
            <a href="#print-options">Back to options</a>
          </header>
          <p role="status">
            {operation?.format === 'pdf'
              ? `Preparing PDF · ${operation.identity}`
              : preview
                ? stale
                  ? 'Previous PDF · options changed. Update the preview for these options.'
                  : 'PDF prepared · matches these options.'
                : valid
                  ? 'Ready to prepare a PDF.'
                  : 'Choose valid content in Options to prepare a PDF.'}
          </p>
          {preview && (
            <p className={styles.hint}>
              {preview.identity}
              <br />
              Prepared{' '}
              <time dateTime={preview.preparedAt}>
                {new Date(preview.preparedAt).toLocaleString()}
              </time>
              . Household data may have changed since preparation.
            </p>
          )}
          {preview && (
            <div className={styles.outputActions}>
              <a
                className={!stale ? 'primary-button' : 'secondary-button'}
                href={preview.url}
                target="_blank"
                rel="noreferrer"
              >
                {stale ? 'Open previous PDF' : 'Open PDF'}
              </a>
              {stale ? (
                <button type="button" className="secondary-button" disabled>
                  Download PDF
                </button>
              ) : (
                <a className="secondary-button" href={preview.url} download={preview.filename}>
                  <Download size={17} />
                  Download PDF
                </a>
              )}
              <button
                type="button"
                className="secondary-button"
                disabled={!!operation || stale}
                onClick={() => {
                  try {
                    if (!frame.current?.contentWindow) throw new Error('No viewer');
                    frame.current.contentWindow.focus();
                    frame.current.contentWindow.print();
                    setPrintStatus(
                      'Print requested. If no print menu appears, use Open PDF and its share/print menu.',
                    );
                  } catch {
                    setPrintStatus(
                      'Embedded printing is unavailable. Use Open PDF and its share/print menu.',
                    );
                  }
                }}
              >
                <Printer size={17} />
                Print PDF
              </button>
            </div>
          )}
          <p className={styles.hint}>
            Prepared does not confirm that this browser has displayed the PDF pages. Use Open PDF if
            the embedded viewer is blank or cannot print.
          </p>
          {printStatus && <p role="status">{printStatus}</p>}
          {failure?.format === 'pdf' && (
            <div role="alert" className={styles.error}>
              <p>{failure.message}</p>
              <p>
                {failure.identity}.{' '}
                {preview
                  ? 'The previous PDF is retained; its preparation time and option match are shown above.'
                  : 'No PDF was prepared.'}
              </p>
              <a href="#print-options">Review options</a> ·{' '}
              <button
                type="button"
                className="text-button"
                disabled={!!operation || !valid}
                onClick={() => void generate()}
              >
                Try PDF again
              </button>
            </div>
          )}
          <details className={styles.viewer} open>
            <summary>Embedded PDF viewer</summary>
            <div className={styles.previewDocument}>
              {operation?.format === 'pdf' && (
                <AsyncSkeleton
                  className={styles.documentLoading}
                  label="Preparing PDF"
                  variant="panel"
                />
              )}
              {preview ? (
                <iframe ref={frame} src={preview.url} title={preview.identity} />
              ) : (
                <div className={styles.empty}>
                  <Printer size={36} />
                  <h3>
                    {operation?.format === 'pdf' ? 'Preparing your PDF' : 'No prepared document'}
                  </h3>
                  <p>
                    {sourceError || routeError || 'Your prepared document will be available here.'}
                  </p>
                </div>
              )}
            </div>
          </details>
          <section className={styles.formats}>
            <h2>Additional downloads</h2>
            <p>
              {kind === 'recipes'
                ? 'ZIP builds separate PDFs for the selected recipe cards using current options.'
                : kind === 'meal-plan'
                  ? 'ZIP builds the schedule PDF and any included individual recipe-card PDFs using current options.'
                  : 'ZIP wraps this document in a single-PDF archive using current options.'}{' '}
              This is not an app backup.
            </p>
            <button
              type="button"
              className="secondary-button"
              disabled={!!operation || !valid}
              onClick={() => void generate('zip')}
            >
              {operation?.format === 'zip' && <ButtonSpinner />}
              {operation?.format === 'zip' ? 'Preparing ZIP…' : 'Build & download ZIP'}
            </button>
            {operation?.format === 'zip' && (
              <p role="status">
                Preparing ZIP · {operation.identity}. The prepared PDF above is unchanged.
              </p>
            )}
            {zipStatus && <p role="status">{zipStatus}</p>}
            {failure?.format === 'zip' && (
              <p role="alert" className={styles.error}>
                {failure.message} · {failure.identity}. The PDF above is unchanged.
              </p>
            )}
            {kind === 'meal-plan' && (
              <div>
                <h3>Calendar file</h3>
                <p>
                  Active planned meals as all-day events for the chosen dates. Independent of paper,
                  appended cards and PDF sections; printable schedules may also include cooked
                  meals.
                </p>
                {calendarValid ? (
                  <a
                    className="secondary-button"
                    href={`/api/v1/meal-plan/export?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`}
                  >
                    Download calendar (.ics)
                  </a>
                ) : (
                  <p>Choose real dates in chronological order to download a calendar.</p>
                )}
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
