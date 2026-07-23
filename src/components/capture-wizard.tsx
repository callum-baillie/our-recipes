'use client';

import { ChevronLeft, FileText, Link2, ShieldCheck, Sparkles } from 'lucide-react';
import { useState } from 'react';

import { RecipeForm } from '@/components/recipe-form';
import { AsyncSkeleton, InlineSkeleton } from '@/components/skeleton';
import { useToast } from '@/components/toast-provider';
import type { AiRecipeCandidate } from '@/lib/domain/ai';
import type { CaptureCandidate, CaptureDraft } from '@/lib/domain/capture';

export function CaptureWizard({ initialKind = 'text' }: { initialKind?: 'text' | 'url' }) {
  const { showToast } = useToast();
  const [kind, setKind] = useState<'text' | 'url'>(initialKind);
  const [value, setValue] = useState('');
  const [draft, setDraft] = useState<CaptureDraft | null>(null);
  const [candidates, setCandidates] = useState<CaptureCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
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
        const message = body?.error?.message ?? 'OpenAI could not normalize this recipe.';
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
        showToast('Choose the recipe you want to normalize.', 'info');
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
                <Sparkles size={16} aria-hidden="true" /> Try AI normalization again
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
                {pending ? (
                  <InlineSkeleton label="Preparing recipe" width="1.1rem" />
                ) : (
                  <Sparkles size={17} />
                )}
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
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>
    );

  return (
    <section className="capture-layout">
      <div className="capture-intro">
        <p className="eyebrow">{kind === 'text' ? 'PASTE OR DESCRIBE' : 'FROM A PUBLIC URL'}</p>
        <h1>
          {kind === 'text' ? 'Turn your notes into a recipe.' : 'Bring a recipe in from the web.'}
        </h1>
        <p>
          {kind === 'text'
            ? 'Paste a complete recipe or describe what you want. OpenAI will organize it into an editable review draft.'
            : 'We safely read the public page, then OpenAI organizes the recipe you choose into an editable draft.'}
        </p>
      </div>
      <div className="capture-card">
        <div className="capture-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={kind === 'text'}
            onClick={() => setKind('text')}
          >
            <FileText size={17} /> Paste / AI
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kind === 'url'}
            onClick={() => setKind('url')}
          >
            <Link2 size={17} /> From URL
          </button>
        </div>
        {kind === 'text' ? (
          <label>
            <span>Recipe text or request</span>
            <textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              rows={12}
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
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="https://example.com/recipe"
            />
          </label>
        )}
        <p className="capture-safety">
          <ShieldCheck size={16} />
          {kind === 'url'
            ? 'URLs are fetched with private-network, redirect, type, timeout, and size limits. Page scripts never run.'
            : 'One paid OpenAI request starts only when you press the button. Nothing is saved until you confirm the draft.'}
        </p>
        <label className="ai-improve-choice">
          <input
            type="checkbox"
            checked={aiImprove}
            onChange={(event) => setAiImprove(event.target.checked)}
          />
          <span>
            <strong>
              <Sparkles size={17} aria-hidden="true" /> AI Improve
            </strong>
            <small>
              Keep the ingredients, while OpenAI fixes spelling, clarifies and completes the steps,
              and fills responsible timing and serving estimates.
            </small>
          </span>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary-button"
          type="button"
          onClick={() => void createDraft()}
          disabled={pending || value.trim().length < (kind === 'text' ? 20 : 1)}
        >
          {pending ? (
            <InlineSkeleton label="Preparing recipe" width="1.1rem" />
          ) : (
            <Sparkles size={17} />
          )}
          {pending
            ? kind === 'url'
              ? 'Reading recipe page…'
              : 'Preparing recipe…'
            : kind === 'url'
              ? 'Find and normalize with AI'
              : 'Normalize with OpenAI'}
        </button>
      </div>
    </section>
  );
}
