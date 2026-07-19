'use client';

import {
  AlertCircle,
  Cloud,
  FileCheck2,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';

import { ImportReviewForm } from '@/components/import-review-form';
import { JsonLdImportWizard } from '@/components/import-jsonld-wizard';
import { useToast } from '@/components/toast-provider';
import {
  ImportUploadPanel,
  type ImportPreparationPhase,
  type ImportSelectionItem,
} from '@/components/import-upload-panel';
import {
  ClientHeicConversionError,
  convertHeicFilesInBrowser,
  isClientHeicFile,
  type ClientImageConversion,
} from '@/lib/client/heic-conversion';
import type { ImportOperation, ImportReviewDraft } from '@/lib/domain/import';
import type { AiRecipeCandidate } from '@/lib/domain/ai';

type CreatedImport = {
  operation: ImportOperation;
  draft: ImportReviewDraft;
};

type FilePreparation = {
  phase: ImportPreparationPhase;
  sourceFiles: File[];
  preparedFiles: File[];
  conversions: ClientImageConversion[];
  canRetry: boolean;
};

const EMPTY_PREPARATION: FilePreparation = {
  phase: 'idle',
  sourceFiles: [],
  preparedFiles: [],
  conversions: [],
  canRetry: false,
};
const MAX_IMPORT_FILES = 4;
const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

function fileSelectionSignature(files: File[]): string {
  return files
    .map((file) => `${file.name}:${file.size}:${file.lastModified}:${file.type}`)
    .join('|');
}

function isImageFile(file: Pick<File, 'name' | 'type'>): boolean {
  return (
    SUPPORTED_IMAGE_TYPES.has(file.type.toLowerCase()) ||
    /\.(?:jpe?g|png|webp|heic|heif)$/iu.test(file.name)
  );
}

function isPdfFile(file: Pick<File, 'name' | 'type'>): boolean {
  return file.type.toLowerCase() === 'application/pdf' || /\.pdf$/iu.test(file.name);
}

function validateSelection(files: File[]): string | null {
  if (files.length > MAX_IMPORT_FILES) return 'Choose one PDF or up to four recipe scans.';
  if (files.some((file) => !isImageFile(file) && !isPdfFile(file))) {
    return 'Choose JPEG, PNG, WebP, HEIC, HEIF, or PDF files.';
  }
  const pdfCount = files.filter(isPdfFile).length;
  if (pdfCount > 0 && (pdfCount !== 1 || files.length !== 1)) {
    return 'Choose one PDF by itself, or choose up to four image scans.';
  }
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > MAX_IMPORT_BYTES) return 'Your selected files exceed the 15 MB total limit.';
  return null;
}

function selectionItems(preparation: FilePreparation): ImportSelectionItem[] {
  return preparation.sourceFiles.map((sourceFile, index) => {
    const convertedFile = preparation.preparedFiles[index];
    const preparedFile = convertedFile ?? sourceFile;
    return {
      key: `${sourceFile.name}:${sourceFile.size}:${sourceFile.lastModified}:${index}`,
      sourceName: sourceFile.name,
      preparedName: preparedFile.name,
      sourceSize: sourceFile.size,
      preparedSize: preparedFile.size,
      converted: preparedFile.name !== sourceFile.name || preparedFile.type !== sourceFile.type,
      isImage: isImageFile(sourceFile),
      isPdf: isPdfFile(sourceFile),
      previewFile: isImageFile(preparedFile) ? preparedFile : null,
      previewKey: `${preparedFile.name}:${preparedFile.size}:${preparedFile.lastModified}:${preparedFile.type}`,
      previewReady: Boolean(convertedFile) || !isClientHeicFile(sourceFile),
    };
  });
}

function StoredImportPreview({
  operationId,
  artifact,
  state,
  error,
  onError,
}: {
  operationId: string;
  artifact: ImportOperation['artifacts'][number];
  state: 'idle' | 'reading' | 'complete' | 'error';
  error: string | null;
  onError: (message: string) => void;
}) {
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const notifiedRef = useRef(false);
  const showError = state === 'error' || loadState === 'error';
  const showLoading = !showError && (state === 'reading' || loadState === 'loading');
  const errorMessage =
    loadState === 'error'
      ? 'The uploaded image preview could not be loaded. You can retry without losing the import.'
      : (error ?? 'OpenAI could not finish reading this image.');

  return (
    <figure>
      <div className={`import-source-preview-frame ${showError ? 'has-error' : ''}`}>
        {/* The server stores each preview as a normalized, metadata-stripped WebP scan. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="import-source-preview"
          src={`/api/v1/imports/${operationId}/files/${artifact.id}`}
          alt={`Normalized scan imported from ${artifact.sourceName}`}
          onLoad={() => setLoadState('ready')}
          onError={() => {
            setLoadState('error');
            if (notifiedRef.current) return;
            notifiedRef.current = true;
            onError(
              'The uploaded image preview could not be loaded. You can retry without losing the import.',
            );
          }}
        />
        {showLoading ? (
          <span className="import-preview-overlay" role="status">
            <LoaderCircle className="spin" size={24} aria-hidden="true" />
            {state === 'reading' ? 'OpenAI is reading this image…' : 'Loading your image…'}
          </span>
        ) : showError ? (
          <span className="import-preview-overlay error" role="alert">
            <AlertCircle size={24} aria-hidden="true" />
            {errorMessage}
          </span>
        ) : state === 'complete' ? (
          <span className="import-preview-ready">
            <FileCheck2 size={15} aria-hidden="true" /> AI review ready
          </span>
        ) : null}
      </div>
      <figcaption>{artifact.sourceName}</figcaption>
    </figure>
  );
}

export function ImportWizard() {
  const { showToast } = useToast();
  const [preparation, setPreparation] = useState<FilePreparation>(EMPTY_PREPARATION);
  const [transcription, setTranscription] = useState('');
  const [autoOpenAiVision, setAutoOpenAiVision] = useState(true);
  const [aiImprove, setAiImprove] = useState(false);
  const [created, setCreated] = useState<CreatedImport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiPending, setAiPending] = useState(false);
  const [aiVersion, setAiVersion] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const preparationAttemptRef = useRef(0);
  const lastSelectionSignatureRef = useRef('');
  const hasOnlyImageScans =
    preparation.preparedFiles.length > 0 && preparation.preparedFiles.every(isImageFile);
  const shouldAutoOpenAiVision =
    autoOpenAiVision && hasOnlyImageScans && transcription.trim().length === 0;
  const items = selectionItems(preparation);

  async function prepareFiles(selected: File[]) {
    if (!selected.length) {
      setPreparation(EMPTY_PREPARATION);
      return;
    }

    const selectionError = validateSelection(selected);
    if (selectionError) {
      preparationAttemptRef.current += 1;
      setPreparation({
        phase: 'error',
        sourceFiles: selected,
        preparedFiles: [],
        conversions: [],
        canRetry: false,
      });
      setError(selectionError);
      showToast(selectionError, 'error');
      return;
    }

    const attempt = preparationAttemptRef.current + 1;
    preparationAttemptRef.current = attempt;
    setPreparation({
      phase: 'preparing',
      sourceFiles: selected,
      preparedFiles: [],
      conversions: [],
      canRetry: true,
    });
    setError(null);
    const imageCount = selected.filter(isImageFile).length;
    showToast(
      imageCount > 0
        ? `${imageCount} ${imageCount === 1 ? 'photo received' : 'photos received'}. Preparing ${imageCount === 1 ? 'it' : 'them'} on this device…`
        : 'PDF received. Checking it on this device…',
      'info',
    );
    try {
      const converted = await convertHeicFilesInBrowser(selected, MAX_IMPORT_BYTES);
      if (preparationAttemptRef.current !== attempt) return;
      setPreparation({
        phase: 'ready',
        sourceFiles: selected,
        preparedFiles: converted.files,
        conversions: converted.conversions,
        canRetry: false,
      });
      showToast(
        `${selected.length} ${selected.length === 1 ? 'file is' : 'files are'} ready. Choose the review action when you’re ready.`,
        'success',
      );
    } catch (caughtError) {
      if (preparationAttemptRef.current !== attempt) return;
      setPreparation({
        phase: 'error',
        sourceFiles: selected,
        preparedFiles: [],
        conversions: [],
        canRetry: true,
      });
      const message =
        caughtError instanceof ClientHeicConversionError
          ? caughtError.message
          : 'We could not prepare those files safely in this browser. Try again or choose JPEG, PNG, WebP, or PDF.';
      setError(message);
      showToast(message, 'error');
    }
  }

  function handleFileInput(event: FormEvent<HTMLInputElement>) {
    const selected = Array.from(event.currentTarget.files ?? []);
    if (!selected.length) return;
    const signature = fileSelectionSignature(selected);
    if (lastSelectionSignatureRef.current === signature) return;
    lastSelectionSignatureRef.current = signature;
    void prepareFiles(selected);
  }

  function prepareForFilePicker() {
    lastSelectionSignatureRef.current = '';
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function openFilePicker() {
    prepareForFilePicker();
    fileInputRef.current?.click();
  }

  function removeFile(index: number) {
    const remaining = preparation.sourceFiles.filter(
      (_, candidateIndex) => candidateIndex !== index,
    );
    lastSelectionSignatureRef.current = '';
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!remaining.length) {
      preparationAttemptRef.current += 1;
      setPreparation(EMPTY_PREPARATION);
      setError(null);
      return;
    }
    void prepareFiles(remaining);
  }

  async function createDraft() {
    if (preparation.phase !== 'ready' || preparation.preparedFiles.length === 0) {
      openFilePicker();
      return;
    }
    const readyPreparation = preparation;
    setPreparation((current) => ({ ...current, phase: 'submitting' }));
    setError(null);
    setAiVersion(0);
    showToast(
      shouldAutoOpenAiVision
        ? 'Uploading the prepared image to your local app before OpenAI review…'
        : 'Creating a review draft from your prepared file…',
      'info',
    );
    const formData = new FormData();
    readyPreparation.preparedFiles.forEach((file) => formData.append('files', file));
    formData.set('transcription', transcription);
    formData.set('autoOpenAiVision', String(shouldAutoOpenAiVision));
    if (readyPreparation.conversions.length)
      formData.set('clientConversions', JSON.stringify(readyPreparation.conversions));

    try {
      const response = await fetch('/api/v1/imports', { method: 'POST', body: formData });
      const body = (await response.json().catch(() => null)) as
        (CreatedImport & { error?: undefined }) | { error?: { message?: string } } | null;
      if (!response.ok || !body || !('operation' in body) || !('draft' in body)) {
        setPreparation(readyPreparation);
        const message =
          (body && 'error' in body ? body.error?.message : undefined) ??
          'We could not create a safe review draft from this file.';
        setError(message);
        showToast(message, 'error');
        return;
      }
      setCreated(body);
      if (body.operation.extractionMethod === 'openai-vision-pending') {
        await askOpenAiToReview(body);
      } else {
        showToast('Review draft ready. Check every field before saving.', 'success');
      }
    } catch {
      setPreparation(readyPreparation);
      const message =
        'The local app could not start this review. Check the connection and try again; your selected files remain on this device.';
      setError(message);
      showToast(message, 'error');
    }
  }

  async function askOpenAiToReview(imported = created) {
    if (!imported) return;
    const { operation, draft } = imported;
    setAiPending(true);
    setError(null);
    showToast('Upload complete. OpenAI is reading the recipe image…', 'info');
    const payload =
      operation.kind === 'image'
        ? {
            confirm: true as const,
            kind: 'vision-extraction' as const,
            importId: operation.id,
            improve: aiImprove,
          }
        : {
            confirm: true as const,
            kind: 'text-normalization' as const,
            sourceText: draft.originalText.slice(0, 30_000),
            sourceLabel: draft.provenance.sourceName,
            improve: aiImprove,
          };
    try {
      const response = await fetch('/api/v1/ai/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as {
        candidate?: AiRecipeCandidate;
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.candidate) {
        const message = body?.error?.message ?? 'OpenAI could not create a review draft.';
        setError(message);
        showToast(message, 'error');
        return;
      }
      setCreated((current) =>
        current?.operation.id === operation.id
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
      showToast('OpenAI finished reading the recipe. Review the draft before saving.', 'success');
    } catch {
      const message = 'OpenAI could not be reached. Your local import is still available to retry.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setAiPending(false);
    }
  }

  function returnToImport() {
    setCreated(null);
    setAiVersion(0);
    setError(null);
  }

  if (created) {
    const { operation, draft } = created;
    const awaitingAutomaticVision =
      operation.extractionMethod === 'openai-vision-pending' && aiVersion === 0;
    const previewState = aiPending
      ? 'reading'
      : awaitingAutomaticVision && error
        ? 'error'
        : aiVersion > 0
          ? 'complete'
          : 'idle';
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
                      : draft.provenance.extractionMethod === 'openai-vision-pending'
                        ? 'OpenAI vision review'
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
                    <StoredImportPreview
                      key={artifact.id}
                      operationId={operation.id}
                      artifact={artifact}
                      state={previewState}
                      error={error}
                      onError={(message) => showToast(message, 'error')}
                    />
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
          {awaitingAutomaticVision ? (
            <aside className="import-warnings" aria-label="OpenAI vision review">
              {aiPending ? (
                <p role="status">
                  <LoaderCircle className="spin" size={16} aria-hidden="true" /> OpenAI is reading
                  the normalized scan. The recipe will remain a review draft.
                </p>
              ) : (
                <>
                  <p className="form-error" role="alert">
                    {error ?? 'OpenAI could not create a review draft from this scan.'}
                  </p>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => void askOpenAiToReview()}
                  >
                    <Sparkles size={16} /> Try OpenAI again
                  </button>
                  <button className="text-button" type="button" onClick={returnToImport}>
                    Use a manual transcription instead
                  </button>
                </>
              )}
            </aside>
          ) : (
            <>
              <details className="import-original-text">
                <summary>View extracted or transcribed source text</summary>
                <pre>{draft.originalText}</pre>
              </details>
              {operation.extractionMethod === 'openai-vision-pending' ? (
                <aside className="import-warnings" aria-label="OpenAI vision review">
                  <p>
                    OpenAI read the normalized scans at your request. Check every field before
                    saving; this suggestion has not created a recipe.
                  </p>
                </aside>
              ) : (
                <aside className="import-warnings" aria-label="Optional OpenAI review">
                  <p>
                    Optional: this sends{' '}
                    {operation.kind === 'image' ? 'normalized scans' : 'the displayed source text'}{' '}
                    to OpenAI for a structured review suggestion. It uses a paid API only after you
                    press the button, and it never saves a recipe on its own.
                  </p>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => void askOpenAiToReview()}
                    disabled={
                      aiPending ||
                      (operation.kind === 'pdf' && draft.originalText.trim().length < 20)
                    }
                  >
                    {aiPending ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <Sparkles size={16} />
                    )}
                    Use OpenAI for a review suggestion
                  </button>
                </aside>
              )}
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
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="import-layout">
      <aside className="import-intro">
        <h1>Add from an image.</h1>
        <p>
          Upload a recipe photo, a set of scans, or a PDF. We prepare it carefully and show you an
          editable draft before anything is saved.
        </p>
        <div className="import-trust-list">
          <div>
            <LockKeyhole size={22} aria-hidden="true" />
            <span>
              <strong>Prepared locally</strong>
              <small>Files are checked and iPhone photos are converted on this device.</small>
            </span>
          </div>
          <div>
            <Cloud size={22} aria-hidden="true" />
            <span>
              <strong>Request only when you choose</strong>
              <small>OpenAI receives prepared scans only after the review action.</small>
            </span>
          </div>
          <div>
            <FileCheck2 size={22} aria-hidden="true" />
            <span>
              <strong>Nothing saved until you confirm</strong>
              <small>The result stays editable before it joins your library.</small>
            </span>
          </div>
        </div>
      </aside>
      <div className="import-options">
        <ImportUploadPanel
          phase={preparation.phase}
          items={items}
          inputRef={fileInputRef}
          error={error}
          transcription={transcription}
          autoOpenAiVision={autoOpenAiVision}
          aiImprove={aiImprove}
          canUseVision={hasOnlyImageScans}
          willUseVision={shouldAutoOpenAiVision}
          canRetryPreparation={preparation.canRetry}
          onInputClick={prepareForFilePicker}
          onFileInput={handleFileInput}
          onChooseFiles={openFilePicker}
          onDropFiles={(selected) => {
            lastSelectionSignatureRef.current = fileSelectionSignature(selected);
            void prepareFiles(selected);
          }}
          onRemoveFile={removeFile}
          onPreviewError={(message) => showToast(message, 'error')}
          onRetry={() => void prepareFiles(preparation.sourceFiles)}
          onPrimaryAction={() => void createDraft()}
          onTranscriptionChange={setTranscription}
          onVisionChange={setAutoOpenAiVision}
          onImproveChange={setAiImprove}
        />
        <JsonLdImportWizard collapsedByDefault />
      </div>
    </section>
  );
}
