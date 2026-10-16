'use client';
import { SuggestionCard } from '@/components/decision-assistance';
import { AiAppActionCard } from '@/components/ai-app-action-card';
import type { DecisionCard } from '@/lib/domain/decision-assistance';
import type { AppActionReview } from '@/lib/services/ai-app-action-service';

import { Plus, ArrowUp, Sparkles, SquarePen, X } from 'lucide-react';
import { Fragment, useEffect, useRef, useState, type RefObject } from 'react';

import { AsyncSkeleton, InlineSkeleton } from '@/components/skeleton';
import { createClientUuid } from '@/lib/client/client-uuid';
import { useModalSurface } from '@/components/use-modal-surface';

import { AiActionCard, type AiDrawerAction } from './ai-action-card';
import styles from './ai-assistant-drawer.module.css';

type Attachment = { kind: 'image'; name: string; mimeType: string; dataBase64: string };

type Message = {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  actionId?: string | null;
  attachments?: Attachment[];
};

type AiJob = {
  id: string;
  kind: 'recipe_images' | 'recipe_batch_generation';
  title: string;
  status: 'queued' | 'running' | 'submitted' | 'completed' | 'failed' | 'cancelled';
  executionMode: 'direct' | 'batch';
  actionId: string | null;
  totalItems: number;
  completedItems: number;
  failedItems: number;
};

function isActiveJob(job: AiJob) {
  return job.status === 'queued' || job.status === 'running' || job.status === 'submitted';
}

function AiJobCard({
  job,
  busy,
  onCommand,
}: {
  job: AiJob;
  busy: boolean;
  onCommand: (jobId: string, command: 'cancel' | 'retry') => void;
}) {
  const complete = job.status === 'completed';
  const failed = job.status === 'failed' || job.status === 'cancelled';
  const progress = `${job.completedItems} of ${job.totalItems}`;
  return (
    <section className={styles.job} aria-label={`${job.title} background task`}>
      <div>
        <strong>{job.title}</strong>
        <p>
          {complete
            ? job.failedItems
              ? `${progress} completed; ${job.failedItems} could not be completed.`
              : `${progress} completed.`
            : failed
              ? `Could not complete ${job.title.toLocaleLowerCase()}.`
              : `${job.status === 'submitted' ? 'OpenAI Batch is processing' : 'Working on'} ${progress}.`}
        </p>
        {job.executionMode === 'batch' && isActiveJob(job) ? (
          <small>Batch work may take up to 24 hours. You can safely close this drawer.</small>
        ) : null}
      </div>
      <div className={styles.jobActions}>
        {isActiveJob(job) ? (
          <button type="button" disabled={busy} onClick={() => onCommand(job.id, 'cancel')}>
            Cancel
          </button>
        ) : failed ? (
          <button type="button" disabled={busy} onClick={() => onCommand(job.id, 'retry')}>
            Retry
          </button>
        ) : null}
      </div>
    </section>
  );
}

function compactProposalMessage(message: Message, action?: AiDrawerAction): string {
  if (!message.actionId || !action) return message.content;
  const looksLikeCardContent =
    message.content.length > 220 ||
    message.content.includes('\n') ||
    message.content.includes('**') ||
    /\b(servings?|minutes?|ingredients?|calories?|nutrition|estimated)\b/iu.test(message.content);
  if (!looksLikeCardContent) return message.content;
  if (action.kind === 'recipe_create') {
    return 'I created a recipe preview and kept your preferences in mind. Review it below when you’re ready.';
  }
  if (action.kind === 'recipe_update') {
    return 'I prepared the recipe changes you asked for. Review them below when you’re ready.';
  }
  if (action.kind === 'recipe_batch_create') {
    return 'I created the recipe set you requested. Review the batch below when you’re ready.';
  }
  if (action.kind === 'meal_plan_generate') {
    return 'I created a meal plan around your request. Review it below when you’re ready.';
  }
  return 'I prepared that change for you. Review it below when you’re ready.';
}

function inlineText(value: string) {
  return value
    .split(/(\*\*[^*]+\*\*)/gu)
    .map((part, index) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>
      ) : (
        part
      ),
    );
}

function AssistantMessage({ content }: { content: string }) {
  const blocks = content.split(/\n\s*\n/gu).filter(Boolean);
  return (
    <div className={styles.messageBody}>
      {blocks.map((block, blockIndex) => {
        const lines = block.split('\n').filter(Boolean);
        if (lines.every((line) => line.trimStart().startsWith('- '))) {
          return (
            <ul key={`${block}-${blockIndex}`}>
              {lines.map((line, lineIndex) => (
                <li key={`${line}-${lineIndex}`}>{inlineText(line.replace(/^\s*-\s*/u, ''))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={`${block}-${blockIndex}`}>
            {lines.map((line, lineIndex) => (
              <span key={`${line}-${lineIndex}`}>
                {inlineText(line)}
                {lineIndex < lines.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

async function errorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? 'The assistant request could not be completed.';
}

export function AiAssistantDrawer({
  open,
  onClose,
  returnFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [actions, setActions] = useState<AiDrawerAction[]>([]);
  const [jobs, setJobs] = useState<AiJob[]>([]);
  const [suggestions, setSuggestions] = useState<DecisionCard[]>([]);
  const [appActions, setAppActions] = useState<AppActionReview[]>([]);
  const [allowPaidTools, setAllowPaidTools] = useState(false);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadingHistory = useRef(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [pendingDecision, setPendingDecision] = useState<{
    actionId: string;
    decision: 'confirm' | 'cancel';
  } | null>(null);
  const [pendingJobCommand, setPendingJobCommand] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    const resize = () => {
      drawerRef.current?.style.setProperty(
        '--assistant-viewport-height',
        `${viewport?.height ?? window.innerHeight}px`,
      );
      drawerRef.current?.style.setProperty(
        '--assistant-viewport-top',
        `${viewport?.offsetTop ?? 0}px`,
      );
    };
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    return () => {
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
    };
  }, [open]);

  async function newThread() {
    setBusy(true);
    setStatus('Starting a new conversation…');
    try {
      const response = await fetch('/api/v1/ai/chat/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const body = (await response.json()) as { thread: { id: string } };
      setThreadId(body.thread.id);
      setMessages([]);
      setDraft('');
      setAttachments([]);
      setActions([]);
      setSuggestions([]);
      setAppActions([]);
      setAllowPaidTools(false);
      setJobs([]);
      setStatus('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not start a conversation.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!open || !threadId) return;
    let active = true;
    void fetch(`/api/v1/ai/app-actions?threadId=${encodeURIComponent(threadId)}`, {
      cache: 'no-store',
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (active && body) setAppActions(body.proposals);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [open, threadId]);

  useEffect(() => {
    if (!open || threadId || loadingHistory.current) return;
    loadingHistory.current = true;
    void (async () => {
      setBusy(true);
      setStatus('Loading your conversation…');
      try {
        const response = await fetch('/api/v1/ai/chat/threads', { cache: 'no-store' });
        if (!response.ok) throw new Error(await errorMessage(response));
        const body = (await response.json()) as { threads: Array<{ id: string }> };
        if (!body.threads[0]) {
          await newThread();
          return;
        }
        const history = await fetch(`/api/v1/ai/chat/threads/${body.threads[0].id}`, {
          cache: 'no-store',
        });
        if (!history.ok) throw new Error(await errorMessage(history));
        const historyBody = (await history.json()) as {
          messages: Message[];
          actions?: AiDrawerAction[];
          jobs?: AiJob[];
        };
        setMessages(historyBody.messages);
        setThreadId(body.threads[0].id);
        setActions(historyBody.actions ?? []);
        setJobs(historyBody.jobs ?? []);
        setStatus('');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Could not load the assistant.');
      } finally {
        loadingHistory.current = false;
        setBusy(false);
      }
    })();
  }, [open, threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [messages, actions, jobs]);

  const activeJobIds = jobs
    .filter(isActiveJob)
    .map((job) => job.id)
    .sort()
    .join(',');

  useEffect(() => {
    if (!open || !threadId || !activeJobIds) return;
    let disposed = false;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/v1/ai/chat/threads/${threadId}`, { cache: 'no-store' });
        if (!response.ok || disposed) return;
        const body = (await response.json()) as {
          messages: Message[];
          actions: AiDrawerAction[];
          jobs: AiJob[];
        };
        if (disposed) return;
        setMessages(body.messages);
        setActions(body.actions);
        setJobs(body.jobs);
      } catch {
        // A background refresh should not interrupt the active conversation.
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [activeJobIds, open, threadId]);
  const modal = useModalSurface({
    open,
    onClose,
    panelRef: drawerRef,
    initialFocusRef: closeRef,
    returnFocusRef,
  });

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
  }, [draft]);

  useEffect(() => {
    if (
      open &&
      threadId &&
      !busy &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches
    )
      textareaRef.current?.focus();
  }, [busy, open, threadId]);

  async function attachImages(files: FileList | null) {
    if (!files || attaching || busy) return;
    setAttaching(true);
    try {
      if (files.length + attachments.length > 4)
        throw new Error('Attach up to four images per message.');
      const next: Attachment[] = [];
      for (const file of Array.from(files)) {
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type))
          throw new Error('Choose a JPG, PNG, WebP, or GIF image.');
        if (file.size > 5_500_000) throw new Error('Each image must be smaller than 5.5 MB.');
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
          reader.onerror = () => reject(new Error('Could not read that image.'));
          reader.readAsDataURL(file);
        });
        next.push({
          kind: 'image',
          name: file.name.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '_').slice(0, 120) || 'photo',
          mimeType: file.type,
          dataBase64: data,
        });
      }
      if (
        [...attachments, ...next].reduce((sum, file) => sum + file.dataBase64.length, 0) >
        12_000_000
      )
        throw new Error('These images are too large together. Choose fewer or smaller images.');
      setAttachments((current) => [...current, ...next]);
      setStatus('Images attached. They will be sent with your next message.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not attach images.');
    } finally {
      setAttaching(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!threadId || (!message && !attachments.length) || busy || attaching) return;
    const sentAttachments = attachments;
    setAttachments([]);
    setDraft('');
    setMessages((current) => [
      ...current,
      {
        id: createClientUuid(),
        role: 'user',
        attachments: sentAttachments,
        content: `${message || 'Please review the attached images.'}${sentAttachments.length ? `\n\nAttached: ${sentAttachments.map((file) => file.name).join(', ')}` : ''}`,
      },
    ]);
    setBusy(true);
    setStatus('Thinking…');
    try {
      const response = await fetch(`/api/v1/ai/chat/threads/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, allowPaidTools, attachments: sentAttachments }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const reader = response.body?.getReader();
      if (!reader) throw new Error('The assistant returned an empty response.');
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantText = '';
      let lastActionId: string | null = null;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line) as {
            type: string;
            delta?: string;
            message?: string;
            messageId?: string;
            actionId?: string;
            kind?: string;
            preview?: unknown;
            job?: AiJob;
            card?: DecisionCard;
            proposal?: AppActionReview;
          };
          if (event.type === 'suggestion' && event.card)
            setSuggestions((current) => [
              ...current.filter((c) => c.id !== event.card!.id),
              event.card!,
            ]);
          if (event.type === 'app_action' && event.proposal)
            setAppActions((current) => [
              ...current.filter((p) => p.id !== event.proposal!.id),
              event.proposal!,
            ]);
          if (event.type === 'status') setStatus(event.message ?? 'Working…');
          if (event.type === 'text') assistantText += event.delta ?? '';
          if (event.type === 'action' && event.actionId) {
            lastActionId = event.actionId;
            setActions((current) =>
              current.some((action) => action.id === event.actionId)
                ? current
                : [
                    ...current,
                    {
                      id: event.actionId!,
                      kind: event.kind ?? 'change',
                      preview: event.preview,
                      status: 'pending',
                    },
                  ],
            );
          }
          if (event.type === 'job' && event.job) {
            setJobs((current) =>
              current.some((job) => job.id === event.job!.id)
                ? current.map((job) => (job.id === event.job!.id ? event.job! : job))
                : [...current, event.job!],
            );
          }
          if (event.type === 'done')
            setMessages((current) => [
              ...current,
              {
                id: event.messageId ?? createClientUuid(),
                role: 'assistant',
                content: assistantText,
                actionId: event.actionId ?? lastActionId,
              },
            ]);
        }
      }
      setStatus('');
    } catch (error) {
      setDraft(message);
      setAttachments(sentAttachments);
      setStatus(error instanceof Error ? error.message : 'The assistant request failed.');
    } finally {
      setBusy(false);
    }
  }

  async function decide(
    actionId: string,
    decision: 'confirm' | 'cancel',
    conflictResolutions?: Array<{ entryId: string; resolution: 'keep' | 'replace' }>,
  ) {
    setBusy(true);
    setPendingDecision({ actionId, decision });
    setStatus(decision === 'confirm' ? 'Saving your change…' : 'Cancelling this preview…');
    try {
      const response = await fetch(`/api/v1/ai/actions/${actionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, conflictResolutions }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const body = (await response.json()) as {
        action: { status: string; result?: unknown; preview?: unknown };
      };
      setActions((current) =>
        current.map((action) =>
          action.id === actionId
            ? {
                ...action,
                status: body.action.status,
                result: body.action.result,
                preview: body.action.preview ?? action.preview,
              }
            : action,
        ),
      );
      setStatus(
        decision === 'confirm' ? 'Saved successfully.' : 'Preview cancelled. Nothing was saved.',
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not update that proposal.');
    } finally {
      setPendingDecision(null);
      setBusy(false);
    }
  }

  async function commandJob(jobId: string, command: 'cancel' | 'retry') {
    setPendingJobCommand(jobId);
    try {
      const response = await fetch(`/api/v1/ai/jobs/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const body = (await response.json()) as { job: AiJob };
      setJobs((current) => current.map((job) => (job.id === jobId ? body.job : job)));
      setStatus(
        command === 'cancel' ? 'Background task cancelled.' : 'Background task queued again.',
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not update that background task.');
    } finally {
      setPendingJobCommand(null);
    }
  }

  const actionsById = new Map(actions.map((action) => [action.id, action]));
  const linkedActionIds = new Set(
    messages.flatMap((message) => (message.actionId ? [message.actionId] : [])),
  );
  const isThinking = busy && status === 'Thinking…';

  if (!open) return null;
  return (
    <>
      <button
        className={styles.backdrop}
        type="button"
        aria-label="Close AI assistant"
        onClick={onClose}
      />
      <aside
        ref={drawerRef}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-assistant-title"
        aria-busy={busy}
        tabIndex={-1}
        onKeyDown={modal.onKeyDown}
      >
        <header className={styles.header}>
          <span className={styles.assistantMark} aria-hidden="true">
            <Sparkles />
          </span>
          <div className={styles.headerCopy}>
            <h2 id="ai-assistant-title">Kitchen assistant</h2>
          </div>
          <button
            type="button"
            title="New conversation"
            aria-label="New conversation"
            onClick={() => void newThread()}
            disabled={busy}
          >
            {busy && status === 'Starting a new conversation…' ? (
              <InlineSkeleton label="Starting a new conversation" width="1rem" />
            ) : (
              <SquarePen />
            )}
          </button>
          <button
            ref={closeRef}
            type="button"
            title="Close"
            aria-label="Close AI assistant"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </header>
        <div className={styles.messages} aria-live="polite" aria-busy={busy}>
          {busy && !messages.length && !actions.length && !jobs.length ? (
            <AsyncSkeleton
              className={styles.loadingState}
              label={status || 'Opening your assistant'}
              variant="rows"
            />
          ) : null}
          {!messages.length && !actions.length && !jobs.length && !busy ? (
            <div className={styles.empty}>
              <h3>What can I help with?</h3>
              <p>
                Ask about recipes or nutrition, prepare an update, or generate a meal plan. You will
                review every change before it is saved.
              </p>
            </div>
          ) : null}
          {messages.map((message) => {
            const linkedAction = message.actionId ? actionsById.get(message.actionId) : undefined;
            return (
              <Fragment key={message.id}>
                <div
                  className={`${styles.message} ${message.role === 'user' ? styles.user : styles.assistant}`}
                >
                  {message.role === 'assistant' ? (
                    <AssistantMessage content={compactProposalMessage(message, linkedAction)} />
                  ) : (
                    <>
                      {message.content}
                      {message.attachments?.length ? (
                        <div className={styles.sentImages}>
                          {message.attachments.map((image, index) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={index}
                              src={`data:${image.mimeType};base64,${image.dataBase64}`}
                              alt={image.name}
                              loading="lazy"
                            />
                          ))}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
                {linkedAction ? (
                  <AiActionCard
                    action={linkedAction}
                    busy={busy}
                    pendingDecision={
                      pendingDecision?.actionId === linkedAction.id
                        ? pendingDecision.decision
                        : null
                    }
                    onDecide={(actionId, decision, resolutions) =>
                      void decide(actionId, decision, resolutions)
                    }
                  />
                ) : null}
              </Fragment>
            );
          })}
          {actions
            .filter((action) => !linkedActionIds.has(action.id))
            .map((action) => (
              <AiActionCard
                action={action}
                busy={busy}
                key={action.id}
                pendingDecision={
                  pendingDecision?.actionId === action.id ? pendingDecision.decision : null
                }
                onDecide={(actionId, decision, resolutions) =>
                  void decide(actionId, decision, resolutions)
                }
              />
            ))}
          {suggestions.map((card) => (
            <SuggestionCard
              key={`${card.id}:${card.evidenceHash}`}
              card={card}
              onChange={(id, patch) =>
                setSuggestions((current) =>
                  current.map((c) => (c.id === id ? { ...c, ...patch } : c)),
                )
              }
            />
          ))}
          {appActions.map((proposal) => (
            <AiAppActionCard key={proposal.id} proposal={proposal} />
          ))}
          {jobs.map((job) => (
            <AiJobCard
              busy={busy || pendingJobCommand === job.id}
              job={job}
              key={job.id}
              onCommand={(jobId, command) => void commandJob(jobId, command)}
            />
          ))}
          {busy ? (
            <div role="status" aria-live="polite">
              <AsyncSkeleton
                className={`${styles.message} ${styles.assistant} ${styles.typing}`}
                label={status || 'Working on your request'}
                variant="message"
              />
              <p className={styles.workExplanation}>
                <strong>{status || 'Working on your request'}</strong>
                <br />
                {status.includes('conversation')
                  ? 'Your saved messages and plans will appear here.'
                  : pendingDecision
                    ? 'Saving your confirmed changes.'
                    : 'Your request is running. Larger recipe and image requests can take a few minutes.'}
              </p>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
        <div className={styles.composer}>
          {attachments.length ? (
            <ul className={styles.attachments} aria-label="Attached images">
              {attachments.map((file, index) => (
                <li key={`${file.name}-${index}`}>
                  {/* Local previews are bounded data URLs, not remote image requests. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`data:${file.mimeType};base64,${file.dataBase64}`} alt={file.name} />
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() =>
                      setAttachments((current) => current.filter((_, i) => i !== index))
                    }
                  >
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            tabIndex={-1}
            aria-label="Choose chat images"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={(event) => void attachImages(event.target.files)}
          />
          <form onSubmit={sendMessage} aria-label="AI assistant message composer">
            <button
              type="button"
              className={styles.attachButton}
              aria-label="Attach images"
              title="Attach images"
              disabled={busy || attaching || attachments.length >= 4}
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus />
            </button>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  window.matchMedia('(hover: hover) and (pointer: fine)').matches
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Ask about your kitchen…"
              aria-label="Message the AI assistant"
              disabled={busy || !threadId}
            />
            <button
              type="submit"
              aria-label="Send message"
              title="Send message"
              disabled={busy || attaching || !threadId || (!draft.trim() && !attachments.length)}
            >
              {isThinking ? <InlineSkeleton label="Sending message" width="1rem" /> : <ArrowUp />}
            </button>
          </form>
          <label className={styles.paidTools}>
            <input
              type="checkbox"
              checked={allowPaidTools}
              disabled={busy}
              onChange={(event) => setAllowPaidTools(event.target.checked)}
            />
            <span>Allow additional paid suggestions</span>
          </label>
          <div className={styles.composerMeta}>
            <p className={styles.status} role="status">
              {status}
            </p>
            <p className={`${styles.keyboardHint} ${styles.desktopHint}`}>
              Enter to send · Shift + Enter for a new line
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
