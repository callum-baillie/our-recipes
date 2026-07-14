'use client';

import { FileText, LoaderCircle, ScanText, ShieldCheck, Sparkles } from 'lucide-react';
import { useState } from 'react';

import { ImportReviewForm } from '@/components/import-review-form';
import { JsonLdImportWizard } from '@/components/import-jsonld-wizard';
import {
  ClientHeicConversionError,
  convertHeicFilesInBrowser,
  type ClientImageConversion,
} from '@/lib/client/heic-conversion';
import type { ImportOperation, ImportReviewDraft } from '@/lib/domain/import';
import type { AiRecipeCandidate } from '@/lib/domain/ai';

type CreatedImport = {
  operation: ImportOperation;
  draft: ImportReviewDraft;
};

export function ImportWizard() {
  const [files, setFiles] = useState<File[]>([]);
  const [clientConversions, setClientConversions] = useState<ClientImageConversion[]>([]);
  const [transcription, setTranscription] = useState('');
  const [created, setCreated] = useState<CreatedImport | null>(null);
  const [pending, setPending] = useState(false);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiPending, setAiPending] = useState(false);
  const [aiVersion, setAiVersion] = useState(0);

  async function chooseFiles(selected: File[]) {
    setConverting(true);
    setError(null);
    try {
      const converted = await convertHeicFilesInBrowser(selected, 15 * 1024 * 1024);
      setFiles(converted.files);
      setClientConversions(converted.conversions);
    } catch (error) {
      setFiles([]);
      setClientConversions([]);
      setError(
        error instanceof ClientHeicConversionError
          ? error.message
          : 'We could not prepare those files safely in this browser.',
      );
    } finally {
      setConverting(false);
    }
  }

  async function createDraft() {
    if (files.length === 0) return;
    setPending(true);
    setError(null);
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    formData.set('transcription', transcription);
    if (clientConversions.length)
      formData.set('clientConversions', JSON.stringify(clientConversions));
    const response = await fetch('/api/v1/imports', { method: 'POST', body: formData });
    const body = (await response.json().catch(() => null)) as
      (CreatedImport & { error?: undefined }) | { error?: { message?: string } } | null;
    setPending(false);
    if (!response.ok || !body || !('operation' in body) || !('draft' in body)) {
      setError(
        (body && 'error' in body ? body.error?.message : undefined) ??
          'We could not create a safe review draft from this file.',
      );
      return;
    }
    setCreated(body);
  }

  async function askOpenAiToReview() {
    if (!created) return;
    const { operation, draft } = created;
    setAiPending(true);
    setError(null);
    const payload =
      operation.kind === 'image'
        ? { confirm: true as const, kind: 'vision-extraction' as const, importId: operation.id }
        : {
            confirm: true as const,
            kind: 'text-normalization' as const,
            sourceText: draft.originalText.slice(0, 30_000),
            sourceLabel: draft.provenance.sourceName,
          };
    const response = await fetch('/api/v1/ai/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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
    setCreated((current) =>
      current
        ? {
            ...current,
            draft: {
              ...current.draft,
              recipe: body.candidate!.recipe,
              provenance: {
                ...current.draft.provenance,
                warnings: [
                  ...current.draft.provenance.warnings,
                  'OpenAI suggested this review draft. Check every field before saving.',
                ],
              },
            },
          }
        : current,
    );
    setAiVersion((version) => version + 1);
  }

  if (created) {
    const { operation, draft } = created;
    return (
      <section className="import-review-layout">
        <aside className="import-provenance">
          <ShieldCheck size={21} aria-hidden="true" />
          <div>
            <p className="eyebrow">REVIEW BEFORE SAVING</p>
            <h1>Make this recipe your own.</h1>
            <p>{draft.provenance.extractionNotice}</p>
            <dl>
              <div>
                <dt>Source</dt>
                <dd>{draft.provenance.sourceName}</dd>
              </div>
              <div>
                <dt>Method</dt>
                <dd>
                  {draft.provenance.extractionMethod === 'pdf-text'
                    ? 'Local PDF text extraction'
                    : draft.provenance.extractionMethod === 'local-ocr'
                      ? 'Local English scan OCR'
                      : 'Manual transcription'}
                </dd>
              </div>
              {draft.provenance.ocrProvenance && (
                <div>
                  <dt>OCR confidence</dt>
                  <dd>
                    {draft.provenance.ocrProvenance.aggregateConfidence ?? 'Unavailable'}
                    {draft.provenance.ocrProvenance.aggregateConfidence === null ? '' : '%'}
                  </dd>
                </div>
              )}
              <div>
                <dt>File fingerprint</dt>
                <dd>
                  <code>{draft.provenance.sourceSha256.slice(0, 16)}…</code>
                </dd>
              </div>
            </dl>
            {operation.artifacts.some((artifact) => artifact.mediaType.startsWith('image/')) && (
              <div className="import-source-previews" aria-label="Normalized imported scans">
                {operation.artifacts
                  .filter((artifact) => artifact.mediaType.startsWith('image/'))
                  .map((artifact) => (
                    <figure key={artifact.id}>
                      {/* The server stores each preview as a normalized, metadata-stripped WebP scan. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="import-source-preview"
                        src={`/api/v1/imports/${operation.id}/files/${artifact.id}`}
                        alt={`Normalized scan imported from ${artifact.sourceName}`}
                      />
                      <figcaption>{artifact.sourceName}</figcaption>
                    </figure>
                  ))}
              </div>
            )}
          </div>
        </aside>
        <div>
          {draft.provenance.warnings.length > 0 && (
            <aside className="import-warnings" aria-label="Import warnings">
              {draft.provenance.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </aside>
          )}
          <details className="import-original-text">
            <summary>View extracted or transcribed source text</summary>
            <pre>{draft.originalText}</pre>
          </details>
          <aside className="import-warnings" aria-label="Optional OpenAI review">
            <p>
              Optional: this sends{' '}
              {operation.kind === 'image' ? 'normalized scans' : 'the displayed source text'} to
              OpenAI for a structured review suggestion. It uses a paid API only after you press the
              button, and it never saves a recipe on its own.
            </p>
            <button
              className="text-button"
              type="button"
              onClick={() => void askOpenAiToReview()}
              disabled={
                aiPending || (operation.kind === 'pdf' && draft.originalText.trim().length < 20)
              }
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
          <ImportReviewForm
            key={`${operation.id}-${aiVersion}`}
            importId={operation.id}
            initial={draft.recipe}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="import-layout">
      <div className="import-intro">
        <p className="eyebrow">LOCAL IMPORT</p>
        <h1>Bring a recipe in, carefully.</h1>
        <p>
          Import a recipe document, scan, or portable Schema.org JSON-LD. Your cookbook stays
          untouched until you review and confirm every field.
        </p>
      </div>
      <div className="import-options">
        <div className="import-card">
          <p className="eyebrow">DOCUMENT OR SCAN</p>
          <label className="import-file-input">
            <span>
              <FileText size={18} aria-hidden="true" /> Recipe document or scan
            </span>
            <input
              type="file"
              multiple
              accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
              onChange={(event) => void chooseFiles(Array.from(event.target.files ?? []))}
            />
            <small>
              {files.length === 1
                ? `${files[0]!.name} · ${(files[0]!.size / 1024 / 1024).toFixed(1)} MB`
                : files.length > 1
                  ? `${files.length} recipe scans · ${(files.reduce((total, file) => total + file.size, 0) / 1024 / 1024).toFixed(1)} MB total`
                  : 'One PDF or up to four JPEG, PNG, WebP, HEIC, or HEIF scans — 15 MB total.'}
            </small>
          </label>
          {clientConversions.length > 0 && (
            <p className="import-safety" role="status">
              HEIC/HEIF was converted to JPEG in this browser. The original file was not uploaded.
            </p>
          )}
          <label>
            <span>
              <ScanText size={18} aria-hidden="true" /> Manual transcription or local OCR
            </span>
            <textarea
              rows={9}
              value={transcription}
              onChange={(event) => setTranscription(event.target.value)}
              placeholder={
                'Optional for a clear English scan; type or paste text when you want to use your own transcription.\n\nTomato soup\nIngredients\n2 tbsp olive oil\n...'
              }
            />
            <small>
              Clear English scans get a local OCR suggestion. If OCR is blank or uncertain, add the
              combined recipe text yourself. Textless PDFs still need a manual transcription; no
              file or text is sent to a network service.
            </small>
          </label>
          <p className="import-safety">
            <ShieldCheck size={16} aria-hidden="true" /> We derive each file type from its bytes,
            cap total bytes plus page and pixel counts, strip scan metadata, and keep local ordered
            provenance.
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
            disabled={files.length === 0 || pending || converting}
          >
            {pending || converting ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <ShieldCheck size={17} aria-hidden="true" />
            )}
            {converting ? 'Preparing local conversion' : 'Create review draft'}
          </button>
        </div>
        <JsonLdImportWizard />
      </div>
    </section>
  );
}
