'use client';
import { useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckSquare, Printer, Trash2, X } from 'lucide-react';
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
    const failed: Array<{ id: string; title: string }> = [];
    for (const recipe of recipes.filter((recipe) => activeSelected.includes(recipe.id))) {
      try {
        const response = await fetch(`/api/v1/recipes/${recipe.id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'trash', expectedRevision: recipe.currentRevision }),
        });
        if (!response.ok) failed.push({ id: recipe.id, title: recipe.title });
      } catch {
        failed.push({ id: recipe.id, title: recipe.title });
      }
    }
    setBusy(false);
    setSelected(failed.map((recipe) => recipe.id));
    setStatus(
      failed.length
        ? `Could not move to trash: ${failed.map((recipe) => recipe.title).join(', ')}. Refresh and try again.`
        : 'Selected recipes moved to trash. Restore them from the Trash view.',
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
            {!selecting ? (
              <button
                type="button"
                disabled={busy || !recipes.length}
                onClick={() => {
                  setSelecting(true);
                  setStatus('Select recipes for printing or moving to trash.');
                }}
              >
                <CheckSquare aria-hidden="true" /> Select recipes
              </button>
            ) : null}
            <a
              aria-label={
                activeSelected.length
                  ? `Print ${activeSelected.length} selected recipes`
                  : 'Print recipes on this page'
              }
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
              <span className="action-label">
                {activeSelected.length
                  ? `Print selected (${activeSelected.length})`
                  : 'Print this page'}
              </span>
            </a>
          </>
        }
      />
      {selecting && recipes.length ? (
        <div className="recipe-selection-bar">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setSelecting(false);
              setSelected([]);
            }}
          >
            Cancel selection
          </button>
          <label>
            <input
              type="checkbox"
              disabled={busy}
              checked={activeSelected.length === recipes.length}
              onChange={(event) =>
                setSelected(event.target.checked ? recipes.map((recipe) => recipe.id) : [])
              }
            />{' '}
            Select this page
          </label>
          <span>{activeSelected.length} selected</span>
          <button
            type="button"
            className="secondary-button"
            disabled={busy || !activeSelected.length}
            onClick={() => confirm.current?.showModal()}
          >
            <Trash2 size={16} aria-hidden="true" /> Move to trash
          </button>
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
                  disabled={busy}
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
        <ul className="bulk-trash-recipes">
          {recipes
            .filter((recipe) => activeSelected.includes(recipe.id))
            .map((recipe) => (
              <li key={recipe.id}>{recipe.title}</li>
            ))}
        </ul>
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
