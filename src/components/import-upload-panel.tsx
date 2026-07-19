'use client';

import {
  AlertCircle,
  Check,
  Circle,
  FileCheck2,
  FileImage,
  FileText,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ScanText,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent, type FormEvent, type RefObject } from 'react';

export type ImportPreparationPhase = 'idle' | 'preparing' | 'ready' | 'error' | 'submitting';

export type ImportSelectionItem = {
  key: string;
  sourceName: string;
  preparedName: string;
  sourceSize: number;
  preparedSize: number;
  converted: boolean;
  isImage: boolean;
  isPdf: boolean;
  previewFile: File | null;
  previewKey: string;
  previewReady: boolean;
};

type ImportUploadPanelProps = {
  phase: ImportPreparationPhase;
  items: ImportSelectionItem[];
  inputRef: RefObject<HTMLInputElement | null>;
  error: string | null;
  transcription: string;
  autoOpenAiVision: boolean;
  aiImprove: boolean;
  canUseVision: boolean;
  willUseVision: boolean;
  canRetryPreparation: boolean;
  previewsReady: boolean;
  onInputClick: () => void;
  onFileInput: (event: FormEvent<HTMLInputElement>) => void;
  onChooseFiles: () => void;
  onDropFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  onPreviewReady: (previewKey: string) => void;
  onPreviewError: (message: string) => void;
  onRetry: () => void;
  onPrimaryAction: () => void;
  onTranscriptionChange: (value: string) => void;
  onVisionChange: (enabled: boolean) => void;
  onImproveChange: (enabled: boolean) => void;
};

const MAX_IMPORT_BYTES = 15 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function ImportProgress({
  phase,
  hasSelection,
}: {
  phase: ImportPreparationPhase;
  hasSelection: boolean;
}) {
  const preparing = phase === 'preparing';
  const prepared = phase === 'ready' || phase === 'submitting';
  const reviewing = phase === 'submitting';
  const steps = [
    { label: 'Choose', complete: hasSelection, active: !hasSelection },
    { label: 'Prepare', complete: prepared, active: preparing || phase === 'error' },
    { label: 'Review', complete: false, active: reviewing },
  ];

  return (
    <ol className="import-progress" aria-label="Import progress">
      {steps.map((step, index) => (
        <li
          key={step.label}
          className={`${step.complete ? 'complete' : ''} ${step.active ? 'active' : ''}`.trim()}
          aria-current={step.active ? 'step' : undefined}
        >
          <span className="import-progress-marker" aria-hidden="true">
            {step.complete ? <Check size={16} /> : index + 1}
          </span>
          <span>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

function SelectedImagePreview({
  item,
  phase,
  error,
  onPreviewReady,
  onPreviewError,
}: {
  item: ImportSelectionItem;
  phase: ImportPreparationPhase;
  error: string | null;
  onPreviewReady: (previewKey: string) => void;
  onPreviewError: (message: string) => void;
}) {
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const imageRef = useRef<HTMLImageElement>(null);
  const notifiedFileRef = useRef<File | null>(null);

  useEffect(() => {
    const image = imageRef.current;
    const file = item.previewFile;
    if (!image || !file) return;
    const objectUrl = URL.createObjectURL(file);
    image.src = objectUrl;
    return () => {
      image.removeAttribute('src');
      URL.revokeObjectURL(objectUrl);
    };
  }, [item.previewFile]);

  const preparationFailed = phase === 'error';
  const previewFailed = loadState === 'error' && item.previewReady;
  const showError = preparationFailed || previewFailed;
  const showLoading =
    !showError && (phase === 'preparing' || phase === 'submitting' || loadState === 'loading');
  const loadingMessage =
    phase === 'submitting'
      ? 'Uploading safely and creating your review…'
      : item.previewReady
        ? 'Loading your photo…'
        : 'Preparing this iPhone photo…';

  return (
    <div className={`import-selected-preview ${showError ? 'has-error' : ''}`}>
      {item.previewFile ? (
        // A local object URL keeps the selected photo on-device until the user starts review.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imageRef}
          alt={`Preview of ${item.sourceName}`}
          onLoad={() => {
            setLoadState('ready');
            onPreviewReady(item.previewKey);
          }}
          onError={() => {
            if (!item.previewReady) return;
            setLoadState('error');
            if (notifiedFileRef.current === item.previewFile) return;
            notifiedFileRef.current = item.previewFile;
            onPreviewError(
              `We could not display a preview of ${item.sourceName}. The file is still selected and will be checked again before review.`,
            );
          }}
        />
      ) : null}
      {showLoading ? (
        <span className="import-preview-overlay" role="status">
          <LoaderCircle className="spin" size={23} aria-hidden="true" />
          {loadingMessage}
        </span>
      ) : showError ? (
        <span className="import-preview-overlay error" role="alert">
          <AlertCircle size={23} aria-hidden="true" />
          {error ?? 'This preview needs attention before review.'}
        </span>
      ) : (
        <span className="import-preview-ready">
          <Check size={15} aria-hidden="true" /> Ready
        </span>
      )}
    </div>
  );
}

function SelectedFiles({
  items,
  phase,
  error,
  onRemoveFile,
  onPreviewReady,
  onPreviewError,
}: {
  items: ImportSelectionItem[];
  phase: ImportPreparationPhase;
  error: string | null;
  onRemoveFile: (index: number) => void;
  onPreviewReady: (previewKey: string) => void;
  onPreviewError: (message: string) => void;
}) {
  if (!items.length) return null;

  return (
    <section
      className="import-selection"
      aria-labelledby="import-selection-heading"
      aria-live="polite"
    >
      <div className="import-selection-heading">
        <h2 id="import-selection-heading">Selected {items.length === 1 ? 'file' : 'files'}</h2>
        <span>{items.length}/4</span>
      </div>
      <ul>
        {items.map((item, index) => (
          <li key={item.key} className={item.isImage ? 'has-image-preview' : undefined}>
            {item.isImage && item.previewFile ? (
              <SelectedImagePreview
                key={item.previewKey}
                item={item}
                phase={phase}
                error={error}
                onPreviewReady={onPreviewReady}
                onPreviewError={onPreviewError}
              />
            ) : (
              <span className="import-file-icon" aria-hidden="true">
                {item.isImage ? <FileImage size={21} /> : <FileText size={21} />}
              </span>
            )}
            <span className="import-file-copy">
              <strong>{item.sourceName}</strong>
              <small>
                {item.converted ? `Prepared as ${item.preparedName}` : item.preparedName}
                {' · '}
                {formatBytes(item.preparedSize || item.sourceSize)}
              </small>
            </span>
            <span className={`import-file-state ${phase}`}>
              {phase === 'preparing' ? (
                <LoaderCircle className="spin" size={16} aria-hidden="true" />
              ) : phase === 'error' ? (
                <Circle size={16} aria-hidden="true" />
              ) : (
                <Check size={16} aria-hidden="true" />
              )}
              {phase === 'preparing' ? 'Preparing' : phase === 'error' ? 'Needs retry' : 'Ready'}
            </span>
            <button
              className="icon-button import-remove-file"
              type="button"
              onClick={() => onRemoveFile(index)}
              disabled={phase === 'submitting'}
              aria-label={`Remove ${item.sourceName}`}
            >
              <Trash2 size={18} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ImportUploadPanel({
  phase,
  items,
  inputRef,
  error,
  transcription,
  autoOpenAiVision,
  aiImprove,
  canUseVision,
  willUseVision,
  canRetryPreparation,
  previewsReady,
  onInputClick,
  onFileInput,
  onChooseFiles,
  onDropFiles,
  onRemoveFile,
  onPreviewReady,
  onPreviewError,
  onRetry,
  onPrimaryAction,
  onTranscriptionChange,
  onVisionChange,
  onImproveChange,
}: ImportUploadPanelProps) {
  const hasSelection = items.length > 0;
  const waitingForPreviews = phase === 'ready' && !previewsReady;
  const busy = phase === 'preparing' || phase === 'submitting' || waitingForPreviews;
  const ready = phase === 'ready' && previewsReady;
  const actionLabel =
    phase === 'preparing'
      ? 'Preparing your selection…'
      : phase === 'submitting'
        ? 'Creating review draft…'
        : waitingForPreviews
          ? 'Finishing image preview…'
          : phase === 'error'
            ? canRetryPreparation
              ? 'Try preparation again'
              : 'Choose another file'
            : ready
              ? willUseVision
                ? 'Send to OpenAI and create draft'
                : 'Create review draft'
              : 'Choose photos or PDF';

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const dropped = Array.from(event.dataTransfer.files ?? []);
    if (dropped.length) onDropFiles(dropped);
  }

  return (
    <div className="import-workspace-card" aria-busy={busy}>
      <ImportProgress
        phase={waitingForPreviews ? 'preparing' : phase}
        hasSelection={hasSelection}
      />

      <div
        className={`import-upload-dropzone ${hasSelection ? 'has-selection' : ''}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <span className="import-upload-icon" aria-hidden="true">
          <Upload size={25} />
        </span>
        <div>
          <h2>{hasSelection ? 'Add or replace files' : 'Choose photos or PDF'}</h2>
          <p>JPEG, PNG, WebP, HEIC, HEIF, or PDF · 15 MB total</p>
        </div>
        <label className="import-upload-trigger" htmlFor="recipe-import-files">
          <Upload size={18} aria-hidden="true" />
          {hasSelection ? 'Choose again' : 'Choose photos or PDF'}
        </label>
        <input
          ref={inputRef}
          className="sr-only"
          id="recipe-import-files"
          type="file"
          multiple
          aria-label="Recipe document or scan"
          accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif"
          onClick={onInputClick}
          onInput={onFileInput}
          onChange={onFileInput}
        />
      </div>

      <SelectedFiles
        items={items}
        phase={phase}
        error={error}
        onRemoveFile={onRemoveFile}
        onPreviewReady={onPreviewReady}
        onPreviewError={onPreviewError}
      />

      {phase === 'preparing' || waitingForPreviews ? (
        <div className="import-readiness preparing" role="status">
          <LoaderCircle className="spin" size={22} aria-hidden="true" />
          <div>
            <strong>
              {waitingForPreviews ? 'Finishing image preview' : 'Preparing on this device'}
            </strong>
            <span>
              {waitingForPreviews
                ? 'The review action will unlock after every selected image is ready.'
                : 'Checking files and converting iPhone photos when needed.'}
            </span>
          </div>
        </div>
      ) : ready ? (
        <div className="import-readiness ready" role="status">
          <FileCheck2 size={23} aria-hidden="true" />
          <div>
            <strong>
              {willUseVision ? 'Ready for OpenAI review' : 'Ready to create a review'}
            </strong>
            <span>
              {items.some((item) => item.converted)
                ? 'iPhone photos were prepared as JPEG on this device.'
                : 'Files are prepared and have not been saved as a recipe.'}
            </span>
          </div>
        </div>
      ) : phase === 'error' ? (
        <div className="import-readiness error" role="status">
          <RefreshCw size={22} aria-hidden="true" />
          <div>
            <strong>Preparation needs another try</strong>
            <span>Your original selection was not uploaded.</span>
          </div>
        </div>
      ) : null}

      {canUseVision ? (
        <label className="import-vision-choice">
          <input
            type="checkbox"
            checked={autoOpenAiVision}
            onChange={(event) => onVisionChange(event.target.checked)}
          />
          <span className="import-vision-check" aria-hidden="true">
            <Check size={19} />
          </span>
          <span>
            <strong>
              <Sparkles size={18} aria-hidden="true" /> Use OpenAI to read this recipe
            </strong>
            <small>
              Best for handwriting. This starts one paid request only after you press the review
              button; the result remains editable.
            </small>
          </span>
        </label>
      ) : hasSelection && items.every((item) => item.isPdf) ? (
        <p className="import-pdf-note">
          <FileText size={18} aria-hidden="true" /> PDFs use local text extraction first. A scanned
          PDF without selectable text needs your transcription.
        </p>
      ) : null}

      {hasSelection ? (
        <label className="ai-improve-choice import-ai-improve-choice">
          <input
            type="checkbox"
            checked={aiImprove}
            onChange={(event) => onImproveChange(event.target.checked)}
          />
          <span>
            <strong>
              <Sparkles size={18} aria-hidden="true" /> AI Improve
            </strong>
            <small>
              When OpenAI reviews this recipe, keep its ingredients while improving spelling,
              missing steps, timings, servings, and useful tags.
            </small>
          </span>
        </label>
      ) : null}

      {error ? (
        <p className="form-error import-form-error" role="alert">
          {error}
        </p>
      ) : null}

      {phase !== 'idle' ? (
        <button
          className="primary-button import-primary-action"
          type="button"
          onClick={
            phase === 'error' ? (canRetryPreparation ? onRetry : onChooseFiles) : onPrimaryAction
          }
          disabled={busy}
        >
          {busy ? (
            <LoaderCircle className="spin" size={19} aria-hidden="true" />
          ) : phase === 'error' && canRetryPreparation ? (
            <RefreshCw size={19} aria-hidden="true" />
          ) : phase === 'error' ? (
            <Upload size={19} aria-hidden="true" />
          ) : willUseVision ? (
            <Sparkles size={19} aria-hidden="true" />
          ) : (
            <ShieldCheck size={19} aria-hidden="true" />
          )}
          {actionLabel}
        </button>
      ) : null}

      <details className="import-transcription" open={Boolean(transcription)}>
        <summary>
          <ScanText size={20} aria-hidden="true" />
          <span>
            <strong>Add your own transcription</strong>
            <small>Optional. Paste text you already typed or scanned.</small>
          </span>
        </summary>
        <label>
          <span className="sr-only">Manual transcription (optional)</span>
          <textarea
            aria-label="Manual transcription (optional)"
            rows={7}
            value={transcription}
            onChange={(event) => onTranscriptionChange(event.target.value)}
            placeholder={
              'Tomato soup\nIngredients\n2 tbsp olive oil\n…\nMethod\n1. Simmer until ready.'
            }
          />
          <small>
            Your text takes priority over OCR. Textless PDFs still need a transcription.
          </small>
        </label>
      </details>

      <p className="import-private-note">
        <LockKeyhole size={18} aria-hidden="true" />
        <span>
          Files are prepared locally. OpenAI receives prepared scans only after your explicit
          action, and nothing joins your library until you confirm the review.
        </span>
      </p>

      <span className="sr-only" aria-live="polite">
        {phase === 'idle'
          ? `Choose one PDF or up to four scans, no more than ${formatBytes(MAX_IMPORT_BYTES)} total.`
          : phase === 'ready'
            ? 'Files prepared. The review action is available.'
            : ''}
      </span>
    </div>
  );
}
