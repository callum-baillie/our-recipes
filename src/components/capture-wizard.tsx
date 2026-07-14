'use client';

import { ChevronLeft, FileText, Link2, LoaderCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { useState } from 'react';

import { RecipeForm } from '@/components/recipe-form';
import type { AiRecipeCandidate } from '@/lib/domain/ai';
import type { CaptureCandidate, CaptureDraft } from '@/lib/domain/capture';

export function CaptureWizard() {
  const [kind, setKind] = useState<'text' | 'url'>('text');
  const [value, setValue] = useState('');
  const [draft, setDraft] = useState<CaptureDraft | null>(null);
  const [candidates, setCandidates] = useState<CaptureCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [aiPending, setAiPending] = useState(false);
  const [aiVersion, setAiVersion] = useState(0);

  async function askOpenAiToReview() {
    if (!draft) return;
    setAiPending(true);
    setError(null);
    const response = await fetch('/api/v1/ai/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        confirm: true,
        kind: 'text-normalization',
        sourceText: draft.originalText.slice(0, 30_000),
        sourceLabel: draft.provenance.sourceName,
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      candidate?: AiRecipeCandidate;
      error?: { message?: string };
    } | null;
    setAiPending(false);
    if (!response.ok || !body?.candidate) {
      setError(body?.error?.message ?? 'OpenAI could not create a review draft.');
      return;
    }
    setDraft((current) =>
      current
        ? {
            ...current,
            recipe: body.candidate!.recipe,
            provenance: {
              ...current.provenance,
              warnings: [
                ...(current.provenance.warnings ?? []),
                'OpenAI suggested this review draft. Check every field before saving.',
              ],
            },
          }
        : current,
    );
    setAiVersion((version) => version + 1);
  }

  async function createDraft(candidateIndex?: number) {
    setPending(true);
    setError(null);
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
    setPending(false);
    if (!response.ok || !body) {
      setError(body?.error?.message ?? 'We could not create a safe review draft.');
      return;
    }
    if (body.candidates) {
      setCandidates(body.candidates);
      return;
    }
    if (body.draft) {
      setDraft(body.draft);
      return;
    }
    setError('The capture response did not contain a recipe review draft.');
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
        <aside className="import-warnings" aria-label="Optional OpenAI review">
          <p>
            Optional: this sends the displayed source text to OpenAI for a structured review
            suggestion. It uses a paid API only after you press the button, and it never saves a
            recipe on its own.
          </p>
          <button
            className="text-button"
            type="button"
            onClick={() => void askOpenAiToReview()}
            disabled={aiPending || draft.originalText.trim().length < 20}
          >
            {aiPending ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
            Use OpenAI for a review suggestion
          </button>
        </aside>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <RecipeForm
          key={`capture-review-${aiVersion}`}
          initial={draft.recipe}
          confirmationLabel="Confirm and add to cookbook"
        />
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
                {pending ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}
                Review this recipe
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
        <p className="eyebrow">REVIEW-FIRST CAPTURE</p>
        <h1>Bring a recipe to the table, carefully.</h1>
        <p>
          Paste recipe text or use a public page. Nothing reaches your shared cookbook until you
          review and confirm the structured draft.
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
            <FileText size={17} /> Paste text
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kind === 'url'}
            onClick={() => setKind('url')}
          >
            <Link2 size={17} /> Public URL
          </button>
        </div>
        {kind === 'text' ? (
          <label>
            <span>Recipe text</span>
            <textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              rows={12}
              placeholder={
                'Tomato soup\n\nIngredients\n2 tbsp olive oil\n...\n\nMethod\n1. Warm the oil.'
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
          <ShieldCheck size={16} /> URLs are fetched server-side with private-network, redirect,
          type, timeout, and size limits. Embedded Recipe metadata is parsed locally; we never
          download page images or run page scripts.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary-button"
          type="button"
          onClick={() => void createDraft()}
          disabled={pending || !value.trim()}
        >
          {pending ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />} Create
          review draft
        </button>
      </div>
    </section>
  );
}
