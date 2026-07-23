'use client';

import { Braces, ChevronDown, ChevronLeft, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { InlineSkeleton } from '@/components/skeleton';

import { ImportReviewForm } from '@/components/import-review-form';
import type { RecipePayload } from '@/lib/domain/recipe';
import type { JsonLdCandidate } from '@/lib/services/jsonld-service';

type Draft = {
  candidate: JsonLdCandidate;
  recipe: RecipePayload;
  warnings: string[];
};

export function JsonLdImportWizard({
  collapsedByDefault = false,
}: {
  collapsedByDefault?: boolean;
}) {
  const [source, setSource] = useState('');
  const [candidates, setCandidates] = useState<JsonLdCandidate[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [expanded, setExpanded] = useState(!collapsedByDefault);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestDraft(candidateIndex?: number) {
    setPending(true);
    setError(null);
    const response = await fetch('/api/v1/jsonld-drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, ...(candidateIndex === undefined ? {} : { candidateIndex }) }),
    });
    const body = (await response.json().catch(() => null)) as {
      candidates?: JsonLdCandidate[];
      draft?: Draft;
      error?: { message?: string };
    } | null;
    setPending(false);
    if (!response.ok || !body) {
      setError(body?.error?.message ?? 'We could not read that local JSON-LD.');
      return;
    }
    if (candidateIndex === undefined && body.candidates) {
      setCandidates(body.candidates);
      return;
    }
    if (candidateIndex !== undefined && body.draft) {
      setDraft(body.draft);
      return;
    }
    setError('The local JSON-LD response did not contain a recipe review draft.');
  }

  if (!expanded && !draft) {
    return (
      <section className="jsonld-import-entry" aria-label="Schema.org JSON-LD import">
        <button type="button" onClick={() => setExpanded(true)}>
          <Braces size={24} aria-hidden="true" />
          <span>
            <strong>Paste Schema.org JSON-LD</strong>
            <small>Already have structured recipe data? Paste it here.</small>
          </span>
          <ChevronDown size={21} aria-hidden="true" />
        </button>
      </section>
    );
  }

  if (draft) {
    return (
      <section className="import-review-layout jsonld-review-layout">
        <aside className="import-provenance">
          <Braces size={21} aria-hidden="true" />
          <div>
            <p className="eyebrow">PORTABLE RECIPE REVIEW</p>
            <h1>Check the imported fields.</h1>
            <p>
              This Recipe node was parsed locally from pasted Schema.org JSON-LD. It has not been
              saved yet.
            </p>
            <dl>
              <div>
                <dt>Selected candidate</dt>
                <dd>{draft.candidate.title}</dd>
              </div>
              <div>
                <dt>Intake boundary</dt>
                <dd>Paste-only JSON-LD, no links, files, archives, or provider calls</dd>
              </div>
            </dl>
            <button className="text-button" type="button" onClick={() => setDraft(null)}>
              <ChevronLeft size={16} aria-hidden="true" /> Back to candidates
            </button>
          </div>
        </aside>
        <div>
          {draft.warnings.length > 0 && (
            <aside className="import-warnings" aria-label="JSON-LD import warnings">
              {draft.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </aside>
          )}
          <ImportReviewForm
            confirmationEndpoint="/api/v1/jsonld-drafts/confirm"
            initial={draft.recipe}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="import-card jsonld-import-card" aria-labelledby="jsonld-import-heading">
      <p className="eyebrow">PORTABLE JSON-LD</p>
      <h2 id="jsonld-import-heading">Paste a Schema.org recipe.</h2>
      <p className="jsonld-description">
        We inspect only pasted JSON-LD Recipe nodes on this device. URLs are never fetched and files
        are not accepted here.
      </p>
      {!candidates ? (
        <>
          <label>
            <span>
              <Braces size={18} aria-hidden="true" /> Schema.org JSON-LD
            </span>
            <textarea
              aria-label="Schema.org JSON-LD"
              rows={11}
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder={
                '{\n  "@context": "https://schema.org",\n  "@type": "Recipe",\n  "name": "..."\n}'
              }
            />
            <small>
              Up to 1 MB. This text is parsed for review and is never stored as an import file.
            </small>
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="secondary-button"
            type="button"
            onClick={() => void requestDraft()}
            disabled={!source.trim() || pending}
          >
            {pending ? (
              <InlineSkeleton label="Finding recipe candidates" width="1.1rem" />
            ) : (
              <ShieldCheck size={17} />
            )}
            Find Recipe candidates
          </button>
          {collapsedByDefault && !source && (
            <button className="text-button" type="button" onClick={() => setExpanded(false)}>
              <ChevronLeft size={16} aria-hidden="true" /> Hide JSON-LD import
            </button>
          )}
        </>
      ) : (
        <div className="jsonld-candidates" aria-live="polite">
          <p className="jsonld-candidate-count">
            Choose the Recipe node to review. Nothing is added until you confirm it.
          </p>
          {candidates.map((candidate) => (
            <article key={candidate.index}>
              <h3>{candidate.title}</h3>
              {candidate.summary && <p>{candidate.summary}</p>}
              {candidate.warnings.length > 0 && (
                <p className="jsonld-candidate-warning">{candidate.warnings[0]}</p>
              )}
              <button
                className="secondary-button"
                type="button"
                onClick={() => void requestDraft(candidate.index)}
                disabled={pending}
              >
                {pending ? (
                  <InlineSkeleton label="Preparing recipe review" width="1.1rem" />
                ) : (
                  <ShieldCheck size={17} />
                )}
                Review this Recipe
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
            <ChevronLeft size={16} aria-hidden="true" /> Edit pasted JSON-LD
          </button>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
