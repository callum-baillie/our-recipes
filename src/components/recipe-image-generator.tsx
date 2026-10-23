'use client';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  recipeImagePreviewRequestSchema,
  type RecipeImagePreviewRequest,
  type RecipeImageCandidate,
  type RecipeImageQuality,
  type RecipeImageSize,
} from '@/lib/domain/recipe-image-generation';
import styles from './recipe-image-generator.module.css';
function subscribeToSavedRequest(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener('bord:image-review', listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener('bord:image-review', listener);
  };
}
function readSavedRequest(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
export type ImageGenerationPolicy = {
  enabled: boolean;
  model: string;
  quality: RecipeImageQuality;
  size: RecipeImageSize;
  allowOverrides: boolean;
};
export function RecipeImageGenerator({
  recipeId,
  revision,
  profileId,
  accountId = 'current-account',
  policy,
  initialCandidateId,
}: {
  recipeId: string;
  revision: number;
  profileId: string;
  accountId?: string;
  policy: ImageGenerationPolicy;
  initialCandidateId?: string;
}) {
  const router = useRouter();
  const [quality, setQuality] = useState(policy.quality);
  const [size, setSize] = useState(policy.size);
  const [candidate, setCandidate] = useState<RecipeImageCandidate | null>(null);
  const [memoryRequest, setMemoryRequest] = useState<RecipeImagePreviewRequest | null>(
    initialCandidateId
      ? {
          confirm: true,
          preview: true,
          operationId: initialCandidateId,
          expectedRevision: revision,
        }
      : null,
  );
  const [pending, setPending] = useState<
    'generate' | 'retry' | 'check' | 'accept' | 'discard' | null
  >(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const requestRef = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const key = `bord:image-review:${accountId}:${profileId}:${recipeId}`;
  const path = (id: string) => `/api/v1/recipes/${recipeId}/image-candidates/${id}`;
  const stored = useSyncExternalStore(
    subscribeToSavedRequest,
    () => readSavedRequest(key),
    () => null,
  );
  let savedRequest: RecipeImagePreviewRequest | null = null;
  try {
    const parsed = recipeImagePreviewRequestSchema.safeParse(stored ? JSON.parse(stored) : null);
    if (parsed.success) savedRequest = parsed.data;
  } catch {
    /* Ignore incomplete local metadata. */
  }
  const requestDraft = memoryRequest ?? savedRequest;
  const operationId = requestDraft?.operationId ?? null;
  useEffect(
    () => () => {
      requestRef.current?.abort();
    },
    [],
  );
  function remember(request: RecipeImagePreviewRequest | null) {
    setMemoryRequest(request);
    try {
      if (request) sessionStorage.setItem(key, JSON.stringify(request));
      else sessionStorage.removeItem(key);
      window.dispatchEvent(new Event('bord:image-review'));
    } catch {
      setMessage(
        'Keep this screen open to check the request; this browser cannot retain its reference after navigation.',
      );
    }
  }
  async function run(action: 'generate' | 'retry' | 'check' | 'accept' | 'discard') {
    if (lock.current) return;
    const id = action === 'generate' ? crypto.randomUUID() : operationId;
    if (!id) return;
    const generatedRequest: RecipeImagePreviewRequest =
      action === 'generate'
        ? {
            confirm: true,
            preview: true,
            operationId: id,
            expectedRevision: revision,
            ...(policy.allowOverrides ? { quality, size } : {}),
          }
        : requestDraft!;
    const generates = action === 'generate' || action === 'retry';
    if (action === 'retry' && !requestDraft) return;
    lock.current = true;
    setPending(action);
    setError('');
    setMessage('');
    if (action === 'generate') {
      remember(generatedRequest);
      setCandidate(null);
    }
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await fetch(
        generates ? `/api/v1/recipes/${recipeId}/images/generate` : path(id),
        {
          method: action === 'check' ? 'GET' : action === 'discard' ? 'DELETE' : 'POST',
          headers: action === 'check' ? undefined : { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: generates
            ? JSON.stringify(generatedRequest)
            : action === 'accept'
              ? JSON.stringify({ action: 'accept' })
              : undefined,
        },
      );
      const body = (await response.json()) as {
        candidate?: RecipeImageCandidate;
        error?: { message?: string };
      };
      if (!response.ok || !body.candidate) {
        // A definite validation rejection before generation has no request to reconcile.
        if (generates && [400, 403, 404, 409, 422, 429, 503].includes(response.status))
          remember(null);
        throw new Error(
          body.error?.message ??
            'The image request could not be checked. Keep this request and try checking again.',
        );
      }
      setCandidate(body.candidate);
      if (body.candidate.status === 'accepted') {
        remember(null);
        setMessage('Generated photo added. Your other recipe photos are still saved.');
        router.refresh();
      } else if (body.candidate.status === 'discarded') {
        remember(null);
        setMessage('Preview discarded. This does not undo any provider work or charge.');
      } else if (body.candidate.status === 'outcome_unknown')
        setMessage(
          'The provider outcome is unknown. This request will not be generated again automatically. Keep its identity for reconciliation; discarding does not undo provider work or charges.',
        );
      else if (body.candidate.status === 'requested')
        setMessage(
          'The request has not reported a final result. Check it again before starting another generation.',
        );
      else if (body.candidate.status === 'failed')
        setMessage(
          'No image is available from this request. Provider work may have been billed. Starting another preview is a separate paid action.',
        );
      else {
        setMessage('Preview ready. Review the dish before adding this photo.');
        requestAnimationFrame(() => previewRef.current?.focus());
      }
    } catch (caught) {
      setError(
        controller.signal.aborted
          ? 'Stopped waiting. The provider may still finish or charge for this request. Check its outcome before starting another.'
          : caught instanceof Error
            ? caught.message
            : 'The request outcome is unknown. Check this request before starting another.',
      );
    } finally {
      requestRef.current = null;
      lock.current = false;
      setPending(null);
    }
  }
  const unresolved = Boolean(operationId);
  const canStart = policy.enabled && !unresolved && !pending;
  return (
    <section className={styles.generator} aria-labelledby="image-generation-heading">
      <h3 id="image-generation-heading">Generate a serving photo</h3>
      <p>
        OpenAI uses this saved recipe’s ingredients, proportions and cooking method. Generation is a
        paid action. Review the result before adding it; your saved photos stay available.
      </p>
      <p className={styles.context}>
        Recipe version {revision} · {policy.model} ·{' '}
        {policy.allowOverrides
          ? 'Choose quality and framing below.'
          : 'Administrator image defaults apply.'}
      </p>
      <div className={styles.controls}>
        <label>
          Image quality
          <select
            value={quality}
            disabled={!policy.allowOverrides || unresolved || Boolean(pending)}
            onChange={(event) => setQuality(event.target.value as RecipeImageQuality)}
          >
            <option value="low">Low · economical preview</option>
            <option value="medium">Medium</option>
            <option value="high">High · higher cost</option>
          </select>
        </label>
        <label>
          Framing
          <select
            value={size}
            disabled={!policy.allowOverrides || unresolved || Boolean(pending)}
            onChange={(event) => setSize(event.target.value as RecipeImageSize)}
          >
            <option value="1024x1024">Square · 1024 × 1024</option>
            <option value="1536x1024">Landscape · 1536 × 1024</option>
            <option value="1024x1536">Portrait · 1024 × 1536</option>
          </select>
        </label>
      </div>
      {!policy.enabled && (
        <p>
          Image generation is unavailable. Review <a href="/account/ai">your AI settings</a> or ask
          the administrator.
        </p>
      )}
      {candidate?.status === 'ready' && candidate.width && candidate.height && (
        <div ref={previewRef} className={styles.preview} tabIndex={-1}>
          <Image
            unoptimized
            src={`${path(candidate.id)}/file`}
            width={candidate.width}
            height={candidate.height}
            alt={candidate.altText}
          />
          <p>
            AI-generated preview · version {candidate.sourceRevision} · {candidate.model} ·{' '}
            {candidate.quality} · {candidate.size}. This photo has not been added.
          </p>
        </div>
      )}
      <div className={styles.actions}>
        {!unresolved && (
          <button
            type="button"
            className="primary-button"
            disabled={!canStart}
            onClick={() => void run('generate')}
          >
            {candidate ? 'Generate another paid preview' : 'Generate preview with OpenAI'}
          </button>
        )}
        {(pending === 'generate' || pending === 'retry') && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => requestRef.current?.abort()}
          >
            Stop waiting
          </button>
        )}
        {unresolved && (
          <button
            type="button"
            className="secondary-button"
            disabled={Boolean(pending)}
            onClick={() => void run('check')}
          >
            {pending === 'check' ? 'Checking request…' : 'Check this request'}
          </button>
        )}
        {unresolved && !initialCandidateId && !candidate && error && requestDraft && (
          <button
            type="button"
            className="secondary-button"
            disabled={Boolean(pending)}
            onClick={() => void run('retry')}
          >
            Retry the same request
          </button>
        )}
        {candidate?.status === 'ready' && (
          <button
            type="button"
            className="primary-button"
            disabled={Boolean(pending)}
            onClick={() => void run('accept')}
          >
            {pending === 'accept' ? 'Adding photo…' : 'Add reviewed photo'}
          </button>
        )}
        {unresolved && (
          <button
            type="button"
            className="secondary-button"
            disabled={Boolean(pending)}
            onClick={() => void run('discard')}
          >
            {pending === 'discard' ? 'Discarding preview…' : 'Discard this preview'}
          </button>
        )}
      </div>
      <p role="status" aria-live="polite">
        {pending === 'generate' || pending === 'retry'
          ? 'Preparing a preview. The existing photos remain unchanged.'
          : message ||
            (operationId && !candidate
              ? 'An earlier image request is available to check. Checking does not start a new generation.'
              : '')}
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
