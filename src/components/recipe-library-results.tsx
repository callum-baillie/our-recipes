'use client';
import { useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Printer, Trash2, X } from 'lucide-react';
import { ResultsToolbar } from './search-facet-bar';
import { AssistedReviewButton } from './assisted-review-button';

const options = [
  ['recently-updated', 'Recently updated'],
  ['recently-added', 'Recently added'],
  ['alphabetical', 'A–Z'],
  ['highest-rated', 'Highest rated'],
  ['most-recently-cooked', 'Recently cooked'],
  ['shortest-time', 'Shortest time'],
  ['lowest-calories', 'Lowest calories'],
  ['highest-protein', 'Highest protein'],
  ['highest-fiber', 'Highest fiber'],
  ['lowest-sodium', 'Lowest sodium'],
  ['highest-nutrition-completeness', 'Nutrition coverage'],
].map(([value, label]) => ({ value, label }));

export function RecipeLibraryResults({
  recipes,
  total,
  overall,
  sort,
  children,
}: {
  recipes: Array<{ id: string; title: string; currentRevision: number }>;
  total: number;
  overall: number;
  sort: string;
  children: ReactNode[];
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const confirm = useRef<HTMLDialogElement>(null);
  const activeSelected = selected.filter((id) => recipes.some((recipe) => recipe.id === id));
  const exportIds = activeSelected.length ? activeSelected : recipes.map((recipe) => recipe.id);
  async function trash() {
    setBusy(true);
    setStatus('');
    const failed: string[] = [];
    for (const recipe of recipes.filter((recipe) => activeSelected.includes(recipe.id))) {
      try {
        const response = await fetch(`/api/v1/recipes/${recipe.id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'trash', expectedRevision: recipe.currentRevision }),
        });
        if (!response.ok) failed.push(recipe.title);
      } catch {
        failed.push(recipe.title);
      }
    }
    setBusy(false);
    setSelected(
      failed.length
        ? activeSelected.filter((id) =>
            failed.includes(recipes.find((recipe) => recipe.id === id)!.title),
          )
        : [],
    );
    setStatus(
      failed.length
        ? `Could not move to trash: ${failed.join(', ')}. Refresh and try again.`
        : 'Selected recipes moved to trash.',
    );
    confirm.current?.close();
    router.refresh();
  }
  return (
    <>
      <ResultsToolbar
        summary={
          <>
            <strong>{total}</strong>
            <span className="sr-only"> filtered recipes out of </span>
            <span aria-hidden="true"> / </span>
            {overall}
            <span className="results-word"> results</span>
          </>
        }
        sort={sort}
        options={options}
        onSortChange={(value) => {
          const params = new URLSearchParams(search.toString());
          params.set('sort', value);
          params.delete('page');
          router.replace(`/recipes?${params}`, { scroll: false });
        }}
        actions={
          <>
            <AssistedReviewButton
              task="cleanup"
              tasks={['cleanup', 'recipe_review']}
              query={search.get('q') ?? ''}
              title="Review recipe data"
            />
            <button
              type="button"
              title="Move selected recipes to trash"
              aria-label="Move selected recipes to trash"
              disabled={busy || !recipes.length}
              onClick={() => {
                if (!selecting) {
                  setSelecting(true);
                  setStatus('Select the recipes to move to trash.');
                } else if (activeSelected.length) confirm.current?.showModal();
                else setStatus('Select at least one recipe first.');
              }}
            >
              <Trash2 />
            </button>
            <a
              aria-label="Export or print recipes"
              title={
                activeSelected.length
                  ? `Print ${activeSelected.length} selected recipes`
                  : 'Print recipes on this page'
              }
              aria-disabled={!exportIds.length || undefined}
              href={
                exportIds.length ? `/print?kind=recipes&recipes=${exportIds.join(',')}` : undefined
              }
            >
              <Printer />
              <span className="action-label">Print</span>
            </a>
          </>
        }
      />
      {selecting && recipes.length ? (
        <div className="recipe-selection-bar">
          <button
            type="button"
            onClick={() => {
              setSelecting(false);
              setSelected([]);
            }}
          >
            Done
          </button>
          <label>
            <input
              type="checkbox"
              checked={activeSelected.length === recipes.length}
              onChange={(event) =>
                setSelected(event.target.checked ? recipes.map((recipe) => recipe.id) : [])
              }
            />{' '}
            Select this page
          </label>
          <span>{activeSelected.length} selected</span>
        </div>
      ) : null}
      {status ? (
        <p role="status" className="muted">
          {status}
        </p>
      ) : null}
      <section
        className="home-recipe-grid all-recipes-grid library-recipe-grid"
        aria-label="Recipe results"
      >
        {children.map((child, index) => (
          <div className="recipe-result-item" key={recipes[index].id}>
            {selecting ? (
              <label className="recipe-select">
                <input
                  aria-label={`Select ${recipes[index].title}`}
                  type="checkbox"
                  checked={activeSelected.includes(recipes[index].id)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, recipes[index].id]
                        : current.filter((id) => id !== recipes[index].id),
                    )
                  }
                />
              </label>
            ) : null}
            {child}
          </div>
        ))}
      </section>
      <dialog ref={confirm} className="bulk-confirm-dialog" aria-labelledby="bulk-trash-title">
        <h2 id="bulk-trash-title">Move {activeSelected.length} recipes to trash?</h2>
        <p>You can restore them from the recipebook’s Trash view.</p>
        <div className="form-actions">
          <button type="button" disabled={busy} onClick={() => confirm.current?.close()}>
            <X /> Cancel
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={busy}
            onClick={() => void trash()}
          >
            {busy ? 'Moving…' : 'Move to trash'}
          </button>
        </div>
      </dialog>
    </>
  );
}
