'use client';
import { ErrorDetails } from '../error-details';
import {
  AlertCircle,
  BookOpen,
  Check,
  ChevronDown,
  ClipboardList,
  MessageCircleQuestion,
  Search,
  WandSparkles,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { ChatToolKind } from '@/lib/domain/ai-chat-tools';
import styles from './tool-calls.module.css';

/**
 * Tool-call rows for an assistant turn. The anatomy follows GlasscowUI's ToolCall /
 * ToolCallGroup (mark stack + "Used N tools" header, one status row per call, shimmer while
 * running, folds away once every call has finished) and is drawn with this app's tokens.
 * Only plain-language titles are shown: raw arguments and results stay on the server.
 */
export type ChatToolCall = {
  id: string;
  kind: ChatToolKind;
  state: 'running' | 'success' | 'error';
  title: string;
  summary?: string;
  durationMs?: number;
};

const kindIcon = {
  read: BookOpen,
  search: Search,
  draft: WandSparkles,
  prepare: ClipboardList,
  ask: MessageCircleQuestion,
} satisfies Record<ChatToolKind, typeof Search>;

const kindLabel: Record<ChatToolKind, string> = {
  read: 'Reading',
  search: 'Searching',
  draft: 'Drafting',
  prepare: 'Preparing',
  ask: 'Asking',
};

function duration(ms?: number) {
  if (ms === undefined) return '';
  return ms < 950 ? `${Math.max(1, Math.round(ms / 10) * 10)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function StatusIcon({ state }: { state: ChatToolCall['state'] }) {
  if (state === 'running') return <span className={styles.spinner} aria-hidden="true" />;
  if (state === 'error') return <AlertCircle className={styles.errorIcon} aria-hidden="true" />;
  return <Check className={styles.checkIcon} aria-hidden="true" />;
}

export function ChatToolCalls({ calls, active }: { calls: ChatToolCall[]; active: boolean }) {
  const listId = useId();
  const running = calls.some((call) => call.state === 'running');
  const failed = calls.some((call) => call.state === 'error');
  const working = active || running;
  const [override, setOverride] = useState<boolean | null>(null);
  const [folded, setFolded] = useState(false);
  const touched = useRef(false);
  // Open while the agent works or something failed; fold shortly after everything has finished,
  // unless the person has opened or closed the group themselves.
  useEffect(() => {
    if (working || failed || touched.current) {
      const unfold = window.setTimeout(() => setFolded(false), 0);
      return () => window.clearTimeout(unfold);
    }
    const timer = window.setTimeout(() => setFolded(true), 450);
    return () => window.clearTimeout(timer);
  }, [working, failed]);
  if (!calls.length) return null;
  const open = override ?? !folded;
  const total = calls.reduce((sum, call) => sum + (call.durationMs ?? 0), 0);
  const marks = [...new Set(calls.map((call) => call.kind))].slice(0, 4);
  const count = `${calls.length} ${calls.length === 1 ? 'step' : 'steps'}`;
  const label = working ? `Working · ${count}` : `Worked through ${count}`;
  return (
    <section className={styles.group} aria-label="What the assistant did" data-working={working}>
      <button
        type="button"
        className={styles.header}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          touched.current = true;
          setOverride(!open);
        }}
      >
        <span className={styles.marks} aria-hidden="true">
          {marks.map((kind) => {
            const Icon = kindIcon[kind];
            return (
              <span key={kind} className={styles.mark}>
                <Icon />
              </span>
            );
          })}
        </span>
        <span className={styles.label} data-shimmer={working}>
          {label}
        </span>
        {!working && total > 0 ? <span className={styles.meta}>{duration(total)}</span> : null}
        <ChevronDown className={styles.chevron} aria-hidden="true" data-open={open} />
      </button>
      <div className={styles.panel} data-open={open} id={listId}>
        <ol className={styles.list} inert={!open}>
          {calls.map((call) => {
            const Icon = kindIcon[call.kind];
            return (
              <li key={call.id} className={styles.row} data-state={call.state}>
                <span className={styles.rowMark} aria-hidden="true">
                  <Icon />
                </span>
                <span className={styles.rowCopy}>
                  <span className={styles.rowTitle} data-shimmer={call.state === 'running'}>
                    {call.title}
                  </span>
                  <span className={styles.srOnly}>
                    {call.state === 'running'
                      ? ` (${kindLabel[call.kind].toLowerCase()}, in progress)`
                      : call.state === 'error'
                        ? ' (did not finish)'
                        : ' (done)'}
                  </span>
                </span>
                {call.summary ? <span className={styles.meta}>{call.summary}</span> : null}
                {call.state !== 'running' && call.durationMs !== undefined ? (
                  <span className={styles.meta}>{duration(call.durationMs)}</span>
                ) : null}
                <StatusIcon state={call.state} />
                {call.state === 'error' ? (
                  <div className={styles.errorDetails}>
                    <ErrorDetails message={call.title} details={call.summary} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
