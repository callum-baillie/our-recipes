'use client';

import { Plus, Send, Sparkles, X } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';

import { AsyncSkeleton, InlineSkeleton } from '@/components/skeleton';

import { AiActionCard, type AiDrawerAction } from './ai-action-card';
import styles from './ai-assistant-drawer.module.css';

type Message = {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  actionId?: string | null;
};

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

export function AiAssistantDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [actions, setActions] = useState<AiDrawerAction[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [pendingDecision, setPendingDecision] = useState<{
    actionId: string;
    decision: 'confirm' | 'cancel';
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      setActions([]);
      setStatus('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not start a conversation.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!open || threadId) return;
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
        setThreadId(body.threads[0].id);
        const history = await fetch(`/api/v1/ai/chat/threads/${body.threads[0].id}`, {
          cache: 'no-store',
        });
        if (!history.ok) throw new Error(await errorMessage(history));
        const historyBody = (await history.json()) as {
          messages: Message[];
          actions?: AiDrawerAction[];
        };
        setMessages(historyBody.messages);
        setActions(historyBody.actions ?? []);
        setStatus('');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Could not load the assistant.');
      } finally {
        setBusy(false);
      }
    })();
  }, [open, threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [messages, actions]);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', close);
    };
  }, [open, onClose]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
  }, [draft]);

  useEffect(() => {
    if (open && threadId && !busy) textareaRef.current?.focus();
  }, [busy, open, threadId]);

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!threadId || !message || busy) return;
    setDraft('');
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'user', content: message },
    ]);
    setBusy(true);
    setStatus('Thinking…');
    try {
      const response = await fetch(`/api/v1/ai/chat/threads/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
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
          };
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
          if (event.type === 'done')
            setMessages((current) => [
              ...current,
              {
                id: event.messageId ?? crypto.randomUUID(),
                role: 'assistant',
                content: assistantText,
                actionId: event.actionId ?? lastActionId,
              },
            ]);
        }
      }
      setStatus('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The assistant request failed.');
    } finally {
      setBusy(false);
    }
  }

  async function decide(actionId: string, decision: 'confirm' | 'cancel') {
    setBusy(true);
    setPendingDecision({ actionId, decision });
    setStatus(decision === 'confirm' ? 'Saving your change…' : 'Cancelling this preview…');
    try {
      const response = await fetch(`/api/v1/ai/actions/${actionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
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
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-assistant-title"
        aria-busy={busy}
      >
        <header className={styles.header}>
          <span className={styles.assistantMark} aria-hidden="true">
            <Sparkles />
          </span>
          <div className={styles.headerCopy}>
            <h2 id="ai-assistant-title">Kitchen assistant</h2>
            <p>Reads directly; asks before it changes anything.</p>
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
              <Plus />
            )}
          </button>
          <button type="button" title="Close" aria-label="Close AI assistant" onClick={onClose}>
            <X size={19} />
          </button>
        </header>
        <div className={styles.messages} aria-live="polite" aria-busy={busy}>
          {busy && !messages.length && !actions.length ? (
            <AsyncSkeleton
              className={styles.loadingState}
              label={status || 'Opening your assistant'}
              variant="rows"
            />
          ) : null}
          {!messages.length && !actions.length && !busy ? (
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
                    message.content
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
                    onDecide={(actionId, decision) => void decide(actionId, decision)}
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
                onDecide={(actionId, decision) => void decide(actionId, decision)}
              />
            ))}
          {isThinking ? (
            <AsyncSkeleton
              className={`${styles.message} ${styles.assistant} ${styles.typing}`}
              label="Working on your request"
              variant="message"
            />
          ) : null}
          <div ref={bottomRef} />
        </div>
        <div className={styles.composer}>
          <form onSubmit={sendMessage} aria-label="AI assistant message composer">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
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
              title="Send message (Enter)"
              disabled={busy || !threadId || !draft.trim()}
            >
              {isThinking ? <InlineSkeleton label="Sending message" width="1rem" /> : <Send />}
            </button>
          </form>
          <div className={styles.composerMeta}>
            <p className={styles.status} role="status">
              {status}
            </p>
            <p className={styles.keyboardHint}>Enter to send · Shift + Enter for a new line</p>
          </div>
        </div>
      </aside>
    </>
  );
}
