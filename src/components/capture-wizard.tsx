'use client';

import { ToastMessage } from './toast-message';

import { ArrowLeft, ChevronLeft, FileText, Link2, ShieldCheck, Sparkles } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { PageHeader } from '@/components/page-header';
import Link from 'next/link';
import { RecipeForm } from '@/components/recipe-form';
import { AsyncSkeleton, LoadingIndicator } from '@/components/skeleton';
import { useToast } from '@/components/toast-provider';
import type { AiRecipeCandidate } from '@/lib/domain/ai';
import type { CaptureCandidate, CaptureDraft } from '@/lib/domain/capture';

export function CaptureWizard({ initialKind = 'text' }: { initialKind?: 'text' | 'url' }) {
  const { showToast } = useToast();
  const [kind, setKind] = useState<'text' | 'url'>(initialKind);
  const [values, setValues] = useState({ text: '', url: '' });
  const [errors, setErrors] = useState<Record<'text' | 'url', string | null>>({
    text: null,
    url: null,
  });
  const value = values[kind];
  const setValue = (value: string) => setValues((current) => ({ ...current, [kind]: value }));
  const error = errors[kind];
  const setError = (error: string | null) =>
    setErrors((current) => ({ ...current, [kind]: error }));
  const inputId = useId();
  const requestPending = useRef(false);
  const [draft, setDraft] = useState<CaptureDraft | null>(null);
  const [candidates, setCandidates] = useState<CaptureCandidate[] | null>(null);
  const [pending, setPending] = useState(false);
  const [aiPending, setAiPending] = useState(false);
  const [aiVersion, setAiVersion] = useState(0);
  const [aiImprove, setAiImprove] = useState(false);

  async function askOpenAiToReview(targetDraft = draft) {
    if (!targetDraft) return;
    setAiPending(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/ai/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: true,
          kind: 'text-normalization',
          sourceText: targetDraft.originalText.slice(0, 30_000),
          sourceLabel: targetDraft.provenance.sourceName,
          improve: aiImprove,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        candidate?: AiRecipeCandidate;
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.candidate) {
        const message = body?.error?.message ?? 'OpenAI could not organize this recipe.';
        setError(message);
        showToast(message, 'error');
        return;
      }
      setDraft({
        ...targetDraft,
        recipe: body.candidate.recipe,
        provenance: {
          ...targetDraft.provenance,
          warnings: [
            ...(targetDraft.provenance.warnings ?? []),
            'OpenAI suggested this review draft. Check every field before saving.',
          ],
        },
      });
      setAiVersion((version) => version + 1);
      showToast('AI review draft ready. Check the details before saving.', 'success');
    } catch {
      const message =
        'OpenAI could not be reached. Your locally prepared draft is still available to edit.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setAiPending(false);
    }
  }

  async function createDraft(candidateIndex?: number) {
    if (requestPending.current) return;
    if (kind === 'text' && value.trim().length < 20) return;
    if (kind === 'url') {
      try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      } catch {
        setError('Enter a valid public recipe link beginning with https://.');
        return;
      }
    }
    requestPending.current = true;
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/capture-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          kind === 'text'
            ? { kind, text: value }
            : { kind, url: value, ...(candidateIndex === undefined ? {} : { candidateIndex }) },
        ),
      });
      const body = (await response.json().catch(() => null)) as {
        draft?: CaptureDraft;
        candidates?: CaptureCandidate[];
        error?: { message?: string };
      } | null;
      if (!response.ok || !body) {
        const message = body?.error?.message ?? 'We could not prepare a safe review draft.';
        setError(message);
        showToast(message, 'error');
        return;
      }
      if (body.candidates) {
        setCandidates(body.candidates);
        showToast('Choose the recipe you want to organize.', 'info');
        return;
      }
      if (body.draft) {
        setDraft(body.draft);
        await askOpenAiToReview(body.draft);
        return;
      }
      const message = 'The capture response did not contain a recipe review draft.';
      setError(message);
      showToast(message, 'error');
    } catch {
      const message = 'The recipe source could not be reached. Check the connection and try again.';
      setError(message);
      showToast(message, 'error');
    } finally {
      requestPending.current = false;
      setPending(false);
    }
  }

  if (draft)
    return (
      <section className="capture-review">
        <div className="capture-provenance">
          <ShieldCheck size={20} aria-hidden="true" />
          <div>
            <strong>Review before saving</strong>
            <p>{draft.provenance.extractionNotice}</p>
            <span>Source: {draft.provenance.sourceName}</span>
            {draft.provenance.extractionMethod && (
              <span>Method: {draft.provenance.extractionMethod.replace(/^url-/u, 'URL ')}</span>
            )}
          </div>
        </div>
        {draft.provenance.warnings && draft.provenance.warnings.length > 0 && (
          <aside className="capture-warnings" aria-label="Capture warnings">
            {draft.provenance.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </aside>
        )}
        <details>
          <summary>View original extracted text</summary>
          <pre>{draft.originalText}</pre>
        </details>
        {aiPending ? (
          <AsyncSkeleton label="OpenAI is organizing your recipe" variant="panel" />
        ) : error ? (
          <aside className="ai-review-fallback">
            <p>{error}</p>
            <div>
              <button
                className="text-button"
                type="button"
                onClick={() => void askOpenAiToReview()}
              >
                <Sparkles size={16} aria-hidden="true" /> Try AI review again
              </button>
              <span>You can also edit the locally prepared draft below.</span>
            </div>
          </aside>
        ) : null}
        {!aiPending && (
          <RecipeForm
            key={`capture-review-${aiVersion}`}
            initial={draft.recipe}
            confirmationLabel="Confirm and add to cookbook"
          />
        )}
      </section>
    );

  if (candidates)
    return (
      <section className="capture-layout">
        <div className="capture-intro">
          <p className="eyebrow">CHOOSE A RECIPE</p>
          <h1>Which recipe should we review?</h1>
          <p>
            These candidates came from bounded, deterministic markup on the safely fetched page.
            Nothing has been saved.
          </p>
        </div>
        <div className="capture-card capture-candidates" aria-live="polite">
          {candidates.map((candidate) => (
            <article key={candidate.index}>
              <p className="eyebrow">{candidate.source.replace('-', ' ').toUpperCase()}</p>
              <h2>{candidate.title}</h2>
              {candidate.summary && <p>{candidate.summary}</p>}
              {candidate.warnings.length > 0 && (
                <p className="capture-candidate-warning">{candidate.warnings[0]}</p>
              )}
              <button
                className="secondary-button"
                type="button"
                onClick={() => void createDraft(candidate.index)}
                disabled={pending}
              >
                {pending ? <LoadingIndicator label="Preparing recipe" /> : <Sparkles size={17} />}
                {pending ? 'Preparing recipe…' : 'Review with AI'}
              </button>
            </article>
          ))}
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setCandidates(null);
              setError(null);
            }}
          >
            <ChevronLeft size={16} aria-hidden="true" /> Edit URL
          </button>
          {error && <ToastMessage message={error} tone="error" />}
        </div>
      </section>
    );

  return (
    <section className="capture-layout">
      <PageHeader
        title={kind === 'text' ? 'Text or idea' : 'Recipe link'}
        description={
          kind === 'text'
            ? 'Paste a recipe or describe an idea to create an editable draft.'
            : 'Import a public recipe link into an editable draft.'
        }
        leading={
          <Link className="quiet-link editor-back-link" href="/recipes">
            <ArrowLeft size={16} aria-hidden="true" />
            Back to recipes
          </Link>
        }
      />
      <form
        className="capture-card"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void createDraft();
        }}
      >
        <div className="capture-tabs" role="group" aria-label="Recipe input method">
          <button
            type="button"
            aria-pressed={kind === 'text'}
            disabled={pending || aiPending}
            onClick={() => setKind('text')}
          >
            <FileText size={17} /> Text or idea
          </button>
          <button
            type="button"
            aria-pressed={kind === 'url'}
            disabled={pending || aiPending}
            onClick={() => setKind('url')}
          >
            <Link2 size={17} /> Recipe link
          </button>
        </div>
        {kind === 'text' ? (
          <label>
            <span>Recipe text or request</span>
            <textarea
              id={inputId}
              aria-describedby={`${inputId}-help${error ? ` ${inputId}-error` : ''}`}
              aria-invalid={Boolean(error)}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              rows={5}
              placeholder={
                'Paste a recipe here, or describe one: “Create a quick lemon pasta for four…”'
              }
            />
          </label>
        ) : (
          <label>
            <span>Public recipe URL</span>
            <input
              type="url"
              id={inputId}
              aria-describedby={`${inputId}-help${error ? ` ${inputId}-error` : ''}`}
              aria-invalid={Boolean(error)}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="https://example.com/recipe"
            />
          </label>
        )}
        <p id={`${inputId}-help`} className="capture-safety">
          {kind === 'text'
            ? value.trim().length < 20
              ? `At least 20 characters needed (${value.trim().length}/20).`
              : 'Ready to create a review draft.'
            : 'Use a public recipe link. You can edit the imported details before adding the recipe.'}
        </p>
        <p className="capture-safety">
          The button starts paid AI processing. Review the draft before adding it to your library.
        </p>
        <label className="ai-improve-choice">
          <input
            type="checkbox"
            checked={aiImprove}
            onChange={(event) => setAiImprove(event.target.checked)}
          />
          <span>
            <strong>
              <Sparkles size={17} aria-hidden="true" /> Refine instructions and estimates
            </strong>
            <small>
              Optional refinements to steps, timing and servings, keeping the supplied ingredients.
              Review all changes.
            </small>
          </span>
        </label>
        {error && <ToastMessage message={error} tone="error" />}
        <button
          className="primary-button"
          type="submit"
          disabled={pending || value.trim().length < (kind === 'text' ? 20 : 1)}
        >
          {pending ? <LoadingIndicator label="Preparing recipe" /> : <Sparkles size={17} />}
          {pending
            ? kind === 'url'
              ? 'Reading recipe page…'
              : 'Preparing recipe…'
            : kind === 'url'
              ? 'Import recipe with AI'
              : 'Create draft with AI'}
        </button>
      </form>
    </section>
  );
}
