'use client';

import { ToastNotice } from './toast-provider';

import { ToastMessage } from './toast-message';

import { Check, Sparkles, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { aiRecipeCandidateSchema, type AiRecipeCandidate } from '@/lib/domain/ai';
import type { RecipePayload } from '@/lib/domain/recipe';
import {
  applyRecipeEnhancement,
  canApplyEnhancementNutrition,
  recipeEnhancementDiff,
  type EnhancementField,
} from '@/lib/domain/recipe-enhancement';
import { AppDialog } from './app-dialog';
import { AsyncSkeleton, LoadingIndicator } from './skeleton';
import { useToast } from './toast-provider';
import styles from './recipe-enhancement-dialog.module.css';

export function RecipeEnhancementDialog({
  open,
  onClose,
  recipeId,
  recipe,
  revision,
}: {
  open: boolean;
  onClose: () => void;
  recipeId: string;
  recipe: RecipePayload;
  revision: number;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [readiness, setReadiness] = useState<{ enabled: boolean; message: string } | null>(null);
  const [candidate, setCandidate] = useState<AiRecipeCandidate | null>(null);
  const [selected, setSelected] = useState<EnhancementField[]>([]);
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState<'generate' | 'save' | null>(null);
  const [error, setError] = useState('');
  const [statusError, setStatusError] = useState('');
  const busy = useRef(false);
  const [baseline, setBaseline] = useState({ recipe, revision });
  const diff = candidate ? recipeEnhancementDiff(baseline.recipe, candidate.recipe) : [];
  const nutritionAllowed =
    !candidate || canApplyEnhancementNutrition(baseline.recipe, candidate.recipe, selected);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch('/api/v1/ai/status', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error('AI availability could not be checked. Close and reopen to try again.');
        const body = await response.json();
        if (typeof body?.status?.enabled !== 'boolean' || typeof body?.status?.message !== 'string')
          throw new Error('AI availability could not be checked.');
        if (!controller.signal.aborted) {
          setReadiness(body.status);
          setStatusError('');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setStatusError('AI availability could not be checked. Close and reopen to try again.');
      });
    return () => controller.abort();
  }, [open]);

  async function generate() {
    if (busy.current || !consent || !readiness?.enabled || statusError) return;
    busy.current = true;
    setBaseline({ recipe, revision });
    setPending('generate');
    setError('');
    try {
      const response = await fetch(`/api/v1/recipes/${recipeId}/improve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: true,
          mode: 'enhance',
          expectedRevision: revision,
          recipe,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          body?.error?.message ?? 'The recipe could not be enhanced. Please try again.',
        );
      const parsed = aiRecipeCandidateSchema.safeParse(body?.candidate);
      if (!parsed.success)
        throw new Error(
          'AI returned an incomplete recipe. Nothing has been saved. Please try again.',
        );
      setCandidate(parsed.data);
      setSelected(recipeEnhancementDiff(recipe, parsed.data.recipe).map((change) => change.field));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Check your connection and try again.');
    } finally {
      busy.current = false;
      setPending(null);
    }
  }

  async function save() {
    if (busy.current || !candidate || !selected.length) return;
    busy.current = true;
    setPending('save');
    setError('');
    try {
      const response = await fetch(`/api/v1/recipes/${recipeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...applyRecipeEnhancement(baseline.recipe, candidate.recipe, selected),
          expectedRevision: baseline.revision,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          body?.error?.message ?? 'The changes could not be saved. Your preview is still here.',
        );
      showToast(`${selected.length} recipe changes saved as a new revision.`, 'success');
      if (
        body?.nutritionMappingRestore?.missing ||
        body?.nutritionRecalculation?.status === 'unavailable'
      )
        showToast(
          body?.nutritionRecalculation?.message ??
            'Review pantry mappings and normalized nutrition for changed ingredients.',
          'info',
        );
      setCandidate(null);
      setConsent(false);
      onClose();
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Check your connection and try again. Your preview is still here.',
      );
    } finally {
      busy.current = false;
      setPending(null);
    }
  }

  return (
    <AppDialog
      open={open}
      onClose={() => {
        if (!busy.current) onClose();
      }}
      aria-labelledby="enhance-title"
      aria-describedby="enhance-description"
      className={styles.dialog}
    >
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            <Sparkles size={15} aria-hidden="true" /> Kitchen assistant
          </span>
          <h2 id="enhance-title">Enhance this recipe</h2>
        </div>
        <button
          type="button"
          className={styles.close}
          aria-label="Close enhancement"
          disabled={pending !== null}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <div className={styles.body}>
        <p id="enhance-description">
          {candidate
            ? 'Choose the changes to save as a new revision. Unchecked fields keep their current values.'
            : 'Improve servings, steps, timings, ingredients, categories, tags, and nutrition. You review every change before saving.'}
        </p>
        {error && <ToastMessage message={error} tone="error" />}
        {pending === 'generate' ? (
          <>
            <AsyncSkeleton variant="rows" label="Enhancing recipe and preparing your comparison" />
            <p>Reviewing ingredients and estimating servings, nutrition, and timings…</p>
          </>
        ) : candidate ? (
          <>
            <p className={styles.notice}>
              Nutrition and inferred servings or timings are estimates. Check ingredient amounts and
              allergens before accepting.
            </p>
            {(candidate.warnings.length > 0 || candidate.uncertainSegments.length > 0) && (
              <details className={styles.reviewNotes}>
                <summary>
                  {candidate.warnings.length + candidate.uncertainSegments.length} review notes
                </summary>
                {candidate.warnings.length > 0 && (
                  <section aria-label="AI review notes">
                    <h3>Review notes</h3>
                    <ul>
                      {candidate.warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </section>
                )}
                {candidate.uncertainSegments.length > 0 && (
                  <section aria-label="Uncertain recipe information">
                    <h3>Needs your attention</h3>
                    <ul>
                      {candidate.uncertainSegments.map((segment, index) => (
                        <li key={index}>
                          <strong>{segment.field}:</strong> {segment.rawText} — {segment.reason}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </details>
            )}
            <h3>
              {diff.length
                ? `${selected.length} of ${diff.length} changes selected`
                : 'No changes suggested'}
            </h3>
            {!nutritionAllowed && (
              <p className={styles.notice}>
                Nutrition suggestions use the proposed ingredients and servings. Select those
                changes to include the nutrition estimates.
              </p>
            )}
            {diff.map((change) => (
              <section className={styles.change} key={change.field}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.includes(change.field)}
                    disabled={
                      pending !== null ||
                      (!nutritionAllowed && change.field.startsWith('nutrition'))
                    }
                    onChange={(event) =>
                      setSelected((current) => {
                        const next = event.target.checked
                          ? [...current, change.field]
                          : current.filter((field) => field !== change.field);
                        return canApplyEnhancementNutrition(baseline.recipe, candidate.recipe, next)
                          ? next
                          : next.filter((field) => !field.startsWith('nutrition'));
                      })
                    }
                  />
                  {change.label}
                </label>
                <div className={styles.comparison}>
                  <div className={styles.before}>
                    <strong>− Current</strong>
                    <p>{change.before || 'Not set'}</p>
                  </div>
                  <div className={styles.after}>
                    <strong>+ Suggested</strong>
                    <p>{change.after || 'Not set'}</p>
                  </div>
                </div>
              </section>
            ))}
          </>
        ) : (
          <>
            <div className={styles.scope}>
              <Sparkles size={22} aria-hidden="true" />
              <div>
                <strong>A clearer recipe, ready for your kitchen</strong>
                <p>
                  Normalize ingredient wording and units, clarify the method, and fill useful gaps.
                  Source credits and shared notes are preserved.
                </p>
              </div>
            </div>
            {statusError ? (
              <ToastNotice tone="error">{statusError}</ToastNotice>
            ) : !readiness ? (
              <AsyncSkeleton variant="select" label="Checking AI availability" />
            ) : !readiness.enabled ? (
              <ToastNotice>{readiness.message}</ToastNotice>
            ) : null}
            <label className={styles.consent}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              Allow one paid AI enhancement request
            </label>
            <p className={styles.fine}>
              Nothing is saved automatically. AI can make mistakes; review inferred values and
              ingredient changes carefully.
            </p>
          </>
        )}
      </div>
      <footer className={styles.footer}>
        <button
          type="button"
          className="text-button"
          disabled={pending !== null}
          onClick={() => {
            setCandidate(null);
            setError('');
            setConsent(false);
            onClose();
          }}
        >
          {candidate ? 'Discard preview' : 'Cancel'}
        </button>
        {candidate ? (
          <button
            type="button"
            className="primary-button"
            disabled={pending !== null || !selected.length}
            aria-busy={pending === 'save'}
            onClick={() => void save()}
          >
            {pending === 'save' ? (
              <LoadingIndicator label="Saving enhancement" />
            ) : (
              <Check size={17} aria-hidden="true" />
            )}
            {pending === 'save' ? 'Saving…' : 'Save selected changes'}
          </button>
        ) : (
          <button
            type="button"
            className="primary-button"
            disabled={pending !== null || !consent || !readiness?.enabled || !!statusError}
            aria-busy={pending === 'generate'}
            onClick={() => void generate()}
          >
            {pending === 'generate' ? (
              <LoadingIndicator label="Enhancing recipe" />
            ) : (
              <Sparkles size={17} aria-hidden="true" />
            )}
            {pending === 'generate' ? 'Enhancing…' : 'Enhance recipe'}
          </button>
        )}
      </footer>
    </AppDialog>
  );
}
