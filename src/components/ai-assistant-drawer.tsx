'use client';
import type { AiChatProblem, AiRecoveryCard } from '@/lib/domain/ai-recovery';
import { AiRecoveryRequestCard } from './chat-ui/recovery-card';
import { ChatProblemPanel } from './chat-ui/problem-panel';
import { useToast } from './toast-provider';
import { chatQuestion } from '@/lib/domain/ai-chat-prompts';
import type { ChatToolEvent } from '@/lib/domain/ai-chat-tools';
import { QuestionPrompt } from './agent-questionnaire';
import { ChatToolCalls, type ChatToolCall } from './chat-ui/tool-calls';
import { DraftSkeleton, ThinkingRow } from './chat-ui/chat-states';
import { AssistantMessage } from './assistant-message';
import { SuggestionCard } from '@/components/decision-assistance';
import { AiJobCard, isActiveJob, type AiJob } from './ai-job-card';
import { AiAppActionCard } from '@/components/ai-app-action-card';
import type { DecisionCard } from '@/lib/domain/decision-assistance';
import type { AppActionReview } from '@/lib/services/ai-app-action-service';

import { readNdjson } from '@/lib/client/ndjson-stream';
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  Link2,
  Plus,
  Settings,
  ShoppingBasket,
  Soup,
  Sparkles,
  Square,
  SquarePen,
  X,
} from 'lucide-react';
import { Fragment, useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { AsyncSkeleton, LoadingIndicator } from '@/components/skeleton';
import { createClientUuid } from '@/lib/client/client-uuid';
import { useModalSurface } from '@/components/use-modal-surface';

import { AiActionCard, type AiDrawerAction } from './ai-action-card';
import styles from './ai-assistant-drawer.module.css';

type TurnState = {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'outcome_unknown';
  reviewed?: boolean;
};
const blocksTurn = (turn: TurnState) =>
  turn.status === 'running' || (turn.status === 'outcome_unknown' && !turn.reviewed);

type Attachment = { kind: 'image'; name: string; mimeType: string; dataBase64: string };

type Message = {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  actionId?: string | null;
  attachments?: Attachment[];
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

const AUTO_IMAGES_KEY = 'bord:chat:auto-recipe-images';
function readAutoImages() {
  try {
    return window.localStorage.getItem(AUTO_IMAGES_KEY) !== 'off';
  } catch {
    return true;
  }
}
function writeAutoImages(value: boolean) {
  try {
    window.localStorage.setItem(AUTO_IMAGES_KEY, value ? 'on' : 'off');
  } catch {
    /* The preference simply will not persist. */
  }
}

const STARTERS = [
  { icon: CalendarDays, label: 'Plan this week’s dinners', prompt: 'Plan dinners for this week.' },
  {
    icon: Soup,
    label: 'Cook from my pantry',
    prompt: 'What could I cook with what is in my pantry right now?',
  },
  {
    icon: ShoppingBasket,
    label: 'Use up what I have',
    prompt: 'Make a meal plan that uses as much of my pantry as you can.',
  },
  { icon: Link2, label: 'Add a recipe from a link', prompt: 'I want to add a recipe from a link.' },
] as const;

async function errorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? 'The assistant request could not be completed.';
}

export function AiAssistantDrawer({
  open,
  onClose,
  returnFocusRef,
  initialDraft,
  interviewMode = false,
  startNewThreadOnOpen = false,
  canManageAiSettings = false,
}: {
  open: boolean;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  initialDraft?: string;
  interviewMode?: boolean;
  startNewThreadOnOpen?: boolean;
  canManageAiSettings?: boolean;
}) {
  const turnAbort = useRef<AbortController | null>(null);
  const submittedTurn = useRef<{
    operationId: string;
    threadId: string;
    message: string;
    attachments: Attachment[];
    allowPaidTools: boolean;
    recoveryRequestIds: string[];
  } | null>(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [unreviewedTurns, setUnreviewedTurns] = useState<TurnState[]>([]);
  const [newResponse, setNewResponse] = useState(false);
  const [conversationList, setConversationList] = useState<Array<{ id: string; title: string }>>(
    [],
  );
  const drafts = useRef(
    new Map<string, { text: string; attachments: Attachment[]; scroll: number }>(),
  );
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [actions, setActions] = useState<AiDrawerAction[]>([]);
  const [jobs, setJobs] = useState<AiJob[]>([]);
  const [suggestions, setSuggestions] = useState<DecisionCard[]>([]);
  const [appActions, setAppActions] = useState<AppActionReview[]>([]);
  const [allowPaidTools, setAllowPaidTools] = useState(false);
  // A per-browser convenience, on by default. The server still requires image generation to be
  // enabled and configured, and every photo is an explicit, recorded request.
  const [autoImages, setAutoImages] = useState(readAutoImages);
  // Only drafts created during this visit start a photo on their own; older drafts never spend.
  // Meals marked as kept while reviewing a drafted plan; they survive a swapped meal's new draft.
  const [keptMeals, setKeptMeals] = useState<ReadonlySet<string>>(new Set());
  const [liveActionIds, setLiveActionIds] = useState<ReadonlySet<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const { showToast } = useToast();
  const [problem, setProblem] = useState<AiChatProblem | null>(null);
  const [approvalRequests, setApprovalRequests] = useState<AiRecoveryCard[]>([]);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const approvalLoadId = useRef(0);
  const approvalThread = useRef(threadId);
  useEffect(() => {
    approvalThread.current = threadId;
    approvalLoadId.current += 1;
  }, [threadId]);
  const loadApprovals = useCallback(async () => {
    const loadId = ++approvalLoadId.current;
    const response = await fetch(
      `/api/v1/ai/recovery${threadId ? `?threadId=${encodeURIComponent(threadId)}` : ''}`,
      { cache: 'no-store' },
    );
    if (response.ok) {
      const body = await response.json();
      if (
        loadId === approvalLoadId.current &&
        approvalThread.current === threadId &&
        Array.isArray(body.requests)
      )
        setApprovalRequests(body.requests);
    }
  }, [threadId]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    const load = async () => {
      if (active) await loadApprovals().catch(() => {});
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [open, loadApprovals]);
  async function resolveApproval(
    id: string,
    decision: 'once' | 'permanent' | 'decline' | 'revoke',
  ) {
    setApprovalBusy(true);
    try {
      const response = await fetch(`/api/v1/ai/recovery/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await loadApprovals();
      const inThisThread = approvalRequests.find((r) => r.id === id)?.threadId === threadId;
      showToast(
        !inThisThread && (decision === 'once' || decision === 'permanent')
          ? 'Approval saved. The requester can continue in their conversation.'
          : decision === 'revoke'
            ? 'One-time access revoked. Permanent settings were not changed.'
            : decision === 'decline'
              ? 'Request declined. Your settings were not changed.'
              : decision === 'once'
                ? 'One-time approval ready. Choose Continue request when all approvals are ready.'
                : 'Setting updated. Choose Continue request to resume.',
        'success',
      );
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'The approval could not be completed. Refresh to check its status.',
        'error',
      );
    } finally {
      setApprovalBusy(false);
    }
  }
  async function continueApproved(request: AiRecoveryCard) {
    if (request.threadId !== threadId || busy || generating) return;
    if (approvalRequests.some((r) => r.threadId === threadId && r.status === 'pending')) {
      showToast('Finish the remaining approval requests before continuing.', 'info');
      return;
    }
    const ids = approvalRequests
      .filter((r) => r.threadId === threadId && r.canContinue)
      .map((r) => r.id);
    setRecoveryRequired(false);
    await sendTurn(
      false,
      'Continue with my earlier request using the approved access and limits.',
      ids,
    );
    await loadApprovals();
  }

  const messagesRef = useRef<HTMLDivElement>(null);
  const messageContentRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const readingScroll = useRef<{ lastTop: number } | null>(null);
  const touchY = useRef<number | null>(null);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadingHistory = useRef(false);
  const turnInFlight = useRef(false);
  const [generating, setGenerating] = useState(false);
  const [toolCalls, setToolCalls] = useState<ChatToolCall[]>([]);
  const [hasSubmittedTurn, setHasSubmittedTurn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [pendingDecision, setPendingDecision] = useState<{
    actionId: string;
    decision: 'confirm' | 'cancel';
  } | null>(null);
  const [pendingJobCommand, setPendingJobCommand] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const adjustingViewport = useRef(false);

  const settleConversationScroll = useCallback((list: HTMLDivElement) => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused !== list && list.contains(focused)) {
      // Review controls own the reading position while they have keyboard focus.
      // Resizing/enlarging text must not scroll their action above the viewport.
      focused.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      return;
    }
    if (stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, []);

  function pauseFollowing(list: HTMLDivElement, towardLatest = false) {
    const remaining = list.scrollHeight - list.scrollTop - list.clientHeight;
    if (list.scrollHeight <= list.clientHeight || (towardLatest && remaining <= 1)) return;
    // Record intent before native scrolling, even between viewport-adjustment frames.
    // A queued resize or stream fragment must not move someone back to the latest reply.
    readingScroll.current = { lastTop: list.scrollTop };
    stickToBottom.current = false;
  }

  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    let frame = 0;
    let settledFrame = 0;
    const resize = () => {
      adjustingViewport.current = true;
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(settledFrame);
      frame = window.requestAnimationFrame(() => {
        const drawer = drawerRef.current;
        if (!drawer) return;
        const height = viewport?.height ?? window.innerHeight;
        const top = viewport?.offsetTop ?? 0;
        const layoutHeight = Math.max(document.documentElement.clientHeight, window.innerHeight);
        drawer.style.setProperty('--assistant-viewport-height', `${height}px`);
        drawer.style.setProperty('--assistant-viewport-top', `${top}px`);
        drawer.style.setProperty(
          '--assistant-layout-height',
          `${Math.max(layoutHeight, top + height)}px`,
        );
        // Safari retains the home-indicator inset while the keyboard is visible.
        drawer.dataset.keyboardOpen = String(
          layoutHeight - height > 150 && (viewport?.scale ?? 1) === 1,
        );
        if (messagesRef.current) settleConversationScroll(messagesRef.current);
        settledFrame = window.requestAnimationFrame(() => {
          adjustingViewport.current = false;
        });
      });
    };
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    window.addEventListener('resize', resize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(settledFrame);
      adjustingViewport.current = false;
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
      window.removeEventListener('resize', resize);
    };
  }, [open, settleConversationScroll]);

  const newThread = useCallback(async () => {
    setStatusError(false);
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
      stickToBottom.current = true;
      readingScroll.current = null;
      setThreadId(body.thread.id);
      setRecoveryRequired(false);
      setUnreviewedTurns([]);
      submittedTurn.current = null;
      setHasSubmittedTurn(false);
      setConversationList((current) => [
        { id: body.thread.id, title: 'New conversation' },
        ...current,
      ]);
      setMessages([]);
      setKeptMeals(new Set());
      setToolCalls([]);
      setDraft(initialDraft ?? '');
      setAttachments([]);
      setActions([]);
      setSuggestions([]);
      setAppActions([]);
      setAllowPaidTools(false);
      setJobs([]);
      setStatus('');
    } catch (error) {
      setStatusError(true);
      setStatus(error instanceof Error ? error.message : 'Could not start a conversation.');
    } finally {
      setBusy(false);
    }
  }, [initialDraft]);

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
    if (startNewThreadOnOpen) {
      loadingHistory.current = true;
      const timer = window.setTimeout(() => {
        void newThread().finally(() => {
          loadingHistory.current = false;
        });
      }, 0);
      return () => window.clearTimeout(timer);
    }
    loadingHistory.current = true;
    void (async () => {
      setStatusError(false);
      setBusy(true);
      setStatus('Loading your conversation…');
      try {
        const response = await fetch('/api/v1/ai/chat/threads', { cache: 'no-store' });
        if (!response.ok) throw new Error(await errorMessage(response));
        const body = (await response.json()) as { threads: Array<{ id: string; title: string }> };
        setConversationList(body.threads);
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
          turns?: TurnState[];
        };
        setRecoveryRequired(Boolean(historyBody.turns?.some(blocksTurn)));
        setUnreviewedTurns(
          (historyBody.turns ?? []).filter(
            (turn) => turn.status === 'outcome_unknown' && !turn.reviewed,
          ),
        );
        setMessages(historyBody.messages);
        setDraft(historyBody.messages.length ? '' : (initialDraft ?? ''));
        setThreadId(body.threads[0].id);
        setActions(historyBody.actions ?? []);
        setJobs(historyBody.jobs ?? []);
        setStatus(
          historyBody.turns?.some(blocksTurn)
            ? 'A previous request is running or its outcome is uncertain. Review the conversation before starting separate work.'
            : '',
        );
      } catch (error) {
        setStatusError(true);
        setStatus(error instanceof Error ? error.message : 'Could not load the assistant.');
      } finally {
        loadingHistory.current = false;
        setBusy(false);
      }
    })();
  }, [initialDraft, newThread, open, startNewThreadOnOpen, threadId]);

  useEffect(() => {
    const list = messagesRef.current;
    if (list) settleConversationScroll(list);
  }, [messages, actions, jobs, appActions, busy, open, settleConversationScroll]);

  useEffect(() => {
    const list = messagesRef.current;
    if (!open || !list || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      settleConversationScroll(list);
    });
    observer.observe(list);
    if (messageContentRef.current) observer.observe(messageContentRef.current);
    return () => observer.disconnect();
  }, [open, settleConversationScroll]);

  const activeJobIds = jobs
    .filter(isActiveJob)
    .map((job) => job.id)
    .sort()
    .join(',');

  useEffect(() => {
    if (!open || !threadId) return;
    let disposed = false;
    const refresh = async () => {
      if (turnInFlight.current) return;
      try {
        const response = await fetch(`/api/v1/ai/chat/threads/${threadId}`, { cache: 'no-store' });
        if (!response.ok || disposed) return;
        const body = (await response.json()) as {
          messages: Message[];
          actions: AiDrawerAction[];
          jobs: AiJob[];
          turns?: TurnState[];
        };
        if (disposed || turnInFlight.current) return;
        setMessages(body.messages);
        setActions(body.actions);
        setJobs(body.jobs ?? []);
        if (body.turns?.some(blocksTurn)) {
          setRecoveryRequired(true);
          setUnreviewedTurns(
            body.turns.filter((turn) => turn.status === 'outcome_unknown' && !turn.reviewed),
          );
          setStatus(
            'A previous request needs review. Saved changes and tasks are shown above; an interrupted response does not mean they were undone.',
          );
        }
        const proposals = await fetch(
          `/api/v1/ai/app-actions?threadId=${encodeURIComponent(threadId)}`,
          { cache: 'no-store' },
        );
        if (proposals.ok && !disposed) setAppActions((await proposals.json()).proposals);
      } catch {
        // A background refresh should not interrupt the active conversation.
      }
    };
    const timer = window.setInterval(() => void refresh(), 5_000);
    const changed = () => void refresh();
    window.addEventListener('bord:ai-jobs-changed', changed);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener('bord:ai-jobs-changed', changed);
    };
  }, [activeJobIds, open, threadId]);
  const modal = useModalSurface({
    open,
    onClose,
    panelRef: drawerRef,
    initialFocusRef: closeRef,
    returnFocusRef,
    freezePage: true,
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
      if (files.length + attachments.length > 20)
        throw new Error('Attach up to 20 images per message.');
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
      setStatusError(true);
      setStatus(error instanceof Error ? error.message : 'Could not attach images.');
    } finally {
      setAttaching(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  useEffect(() => {
    if (threadId)
      drafts.current.set(threadId, {
        text: draft,
        attachments,
        scroll: messagesRef.current?.scrollTop ?? 0,
      });
  }, [draft, attachments, threadId]);

  useEffect(() => () => turnAbort.current?.abort(), []);

  async function loadConversation(id: string) {
    if (turnInFlight.current) return;
    setBusy(true);
    setStatusError(false);
    try {
      const response = await fetch(`/api/v1/ai/chat/threads/${id}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(await errorMessage(response));
      const body = (await response.json()) as {
        messages: Message[];
        actions?: AiDrawerAction[];
        jobs?: AiJob[];
        turns?: TurnState[];
      };
      const saved = drafts.current.get(id);
      setThreadId(id);
      setKeptMeals(new Set());
      setToolCalls([]);
      setMessages(body.messages);
      setActions(body.actions ?? []);
      setJobs(body.jobs ?? []);
      setDraft(saved?.text ?? '');
      setAttachments(saved?.attachments ?? []);
      const running = body.turns?.some(blocksTurn) ?? false;
      setUnreviewedTurns(
        (body.turns ?? []).filter((turn) => turn.status === 'outcome_unknown' && !turn.reviewed),
      );
      setRecoveryRequired(running);
      if (!running) {
        submittedTurn.current = null;
        setHasSubmittedTurn(false);
      }
      setStatus(
        running
          ? 'A previous request is still running or its outcome is uncertain. Review the results; use a new conversation only for deliberate separate work.'
          : 'Conversation reloaded. Review saved previews and tasks before deliberately sending a new request.',
      );
      requestAnimationFrame(() => {
        if (messagesRef.current)
          messagesRef.current.scrollTop = saved?.scroll ?? messagesRef.current.scrollHeight;
      });
    } catch (error) {
      setStatusError(true);
      setStatus(error instanceof Error ? error.message : 'Could not reload this conversation.');
    } finally {
      setBusy(false);
    }
  }

  async function acknowledgeRecovery(operationId: string) {
    if (!threadId || busy) return;
    setBusy(true);
    setStatusError(false);
    try {
      const response = await fetch(`/api/v1/ai/chat/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'acknowledge_recovery', operationId }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await loadConversation(threadId);
      setStatus(
        'Review acknowledged. The interrupted request was not rerun or undone. You can now send a separate request.',
      );
    } catch (error) {
      setStatusError(true);
      setStatus(error instanceof Error ? error.message : 'Could not acknowledge this review.');
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (recoveryRequired) return;
    await sendTurn();
  }

  async function sendTurn(retry = false, reply?: string, recoveryRequestIds: string[] = []) {
    const message = (reply ?? draft).trim();
    if (
      turnInFlight.current ||
      busy ||
      attaching ||
      !threadId ||
      (!retry && !message && !attachments.length)
    )
      return;
    const attempt = retry
      ? submittedTurn.current
      : {
          operationId: createClientUuid(),
          threadId,
          message,
          attachments,
          allowPaidTools,
          recoveryRequestIds,
        };
    if (!attempt) return;
    submittedTurn.current = attempt;
    setHasSubmittedTurn(true);
    const abort = new AbortController();
    turnAbort.current = abort;
    const partialId = `response-${attempt.operationId}`;
    if (!retry) {
      setToolCalls([]);
      setAttachments([]);
      setDraft('');
      setMessages((current) => [
        ...current,
        {
          id: `request-${attempt.operationId}`,
          role: 'user',
          attachments: attempt.attachments,
          content: attempt.message || 'Please review the attached images.',
        },
      ]);
    }
    stickToBottom.current = true;
    readingScroll.current = null;
    setStatusError(false);
    setProblem(null);
    turnInFlight.current = true;
    setGenerating(true);
    setBusy(true);
    setRecoveryRequired(false);
    setStatus('Preparing a response…');
    let assistantText = '';
    let completed = false;
    let sequence = 0;
    let failureProblem: AiChatProblem | null = null;
    let lastActionId: string | null = null;
    const showText = () => {
      setMessages((current) => [
        ...current.filter((item) => item.id !== partialId),
        { id: partialId, role: 'assistant', content: assistantText },
      ]);
      if (!stickToBottom.current) setNewResponse(true);
    };
    try {
      const response = await fetch(`/api/v1/ai/chat/threads/${attempt.threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abort.signal,
        body: JSON.stringify({
          operationId: attempt.operationId,
          message: attempt.message,
          allowPaidTools: attempt.allowPaidTools,
          attachments: attempt.attachments,
          recoveryRequestIds: attempt.recoveryRequestIds,
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      if (!response.body) throw new Error('The assistant returned an empty response.');
      for await (const event of readNdjson<{
        type: string;
        sequence?: number;
        delta?: string;
        content?: string;
        message?: string;
        messageId?: string;
        actionId?: string;
        kind?: string;
        preview?: unknown;
        imageDelivery?: AiDrawerAction['imageDelivery'];
        sourceDigest?: string | null;
        job?: AiJob;
        card?: DecisionCard;
        proposal?: AppActionReview;
        problem?: AiChatProblem;
        request?: AiRecoveryCard;
      }>(response.body, abort.signal)) {
        if (event.sequence !== undefined) {
          if (event.sequence <= sequence) continue;
          if (sequence && event.sequence !== sequence + 1)
            throw new Error(
              'Part of the response was lost. Reload the conversation to reconcile it.',
            );
          sequence = event.sequence;
        }
        if (event.type === 'recovery_request' && event.request)
          setApprovalRequests((current) => [
            ...current.filter((r) => r.id !== event.request!.id),
            event.request!,
          ]);
        if (event.type === 'error') {
          failureProblem = event.problem ?? null;
          setProblem(failureProblem);
          if (failureProblem?.recoveryRequests.length)
            setApprovalRequests((current) => [
              ...current.filter(
                (r) => !failureProblem!.recoveryRequests.some((n) => n.id === r.id),
              ),
              ...failureProblem!.recoveryRequests,
            ]);
          throw new Error(event.message ?? 'The response could not finish.');
        }
        if (event.type === 'text_reset') {
          assistantText = '';
          setMessages((current) => current.filter((item) => item.id !== partialId));
        }
        if (event.type === 'status') setStatus(event.message ?? 'Preparing a response…');
        if (event.type === 'tool') {
          const call = event as unknown as ChatToolEvent;
          setToolCalls((current) => {
            const next: ChatToolCall = {
              id: call.id,
              kind: call.kind,
              state: call.state,
              title: call.title,
              summary: call.summary,
              durationMs: call.durationMs,
            };
            return current.some((item) => item.id === call.id)
              ? current.map((item) => (item.id === call.id ? next : item))
              : [...current, next];
          });
        }
        if (event.type === 'text') {
          assistantText += event.delta ?? '';
          showText();
        }
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
        if (event.type === 'action' && event.actionId) {
          lastActionId = event.actionId;
          setLiveActionIds((current) => new Set(current).add(event.actionId!));
          setActions((current) =>
            current.some((action) => action.id === event.actionId)
              ? current
              : [
                  ...current.map((action) =>
                    action.id ===
                    (event.preview as { supersedesActionId?: string })?.supersedesActionId
                      ? { ...action, status: 'cancelled' }
                      : action,
                  ),
                  {
                    id: event.actionId!,
                    kind: event.kind ?? 'change',
                    preview: event.preview,
                    imageDelivery: event.imageDelivery ?? null,
                    sourceDigest: event.sourceDigest ?? null,
                    status: 'pending',
                  },
                ],
          );
        }
        if (event.type === 'job' && event.job)
          setJobs((current) => [...current.filter((job) => job.id !== event.job!.id), event.job!]);
        if (event.type === 'done') {
          completed = true;
          setMessages((current) => [
            ...current.filter((item) => item.id !== partialId && item.id !== event.messageId),
            {
              id: event.messageId ?? partialId,
              role: 'assistant',
              content: event.content ?? assistantText,
              actionId: event.actionId ?? lastActionId,
            },
          ]);
        }
      }
      if (!completed)
        throw new Error(
          'The connection ended before completion. Review the saved conversation before another request.',
        );
      submittedTurn.current = null;
      setHasSubmittedTurn(false);
      setStatus('Response ready.');
    } catch (error) {
      if (!abort.signal.aborted)
        showToast(
          error instanceof Error ? error.message : 'The response could not finish.',
          'error',
          { details: failureProblem?.details },
        );
      void loadApprovals().catch(() => {});
      setRecoveryRequired(true);
      setStatusError(true);
      setStatus(
        abort.signal.aborted
          ? 'Response stopped. Saved previews or background tasks may still exist; reload the conversation to review them.'
          : error instanceof Error
            ? error.message
            : 'The response could not finish.',
      );
    } finally {
      turnInFlight.current = false;
      setGenerating(false);
      turnAbort.current = null;
      setBusy(false);
    }
  }

  async function decide(
    actionId: string,
    decision: 'confirm' | 'cancel',
    conflictResolutions?: Array<{ entryId: string; resolution: 'keep' | 'replace' }>,
    options?: { generateImages?: boolean },
  ) {
    setStatusError(false);
    setBusy(true);
    setPendingDecision({ actionId, decision });
    setStatus(decision === 'confirm' ? 'Saving your change…' : 'Cancelling this preview…');
    try {
      const response = await fetch(`/api/v1/ai/actions/${actionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          conflictResolutions,
          ...(options?.generateImages ? { generateImages: true } : {}),
        }),
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
      // A confirmed draft may have queued a photo job; show it without waiting for the poll.
      if (decision === 'confirm') window.dispatchEvent(new Event('bord:ai-jobs-changed'));
    } catch (error) {
      setStatusError(true);
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
        command === 'cancel'
          ? 'Cancellation requested. Provider work already started may still finish; review the task status.'
          : 'Background task queued again.',
      );
    } catch (error) {
      setStatusError(true);
      setStatus(error instanceof Error ? error.message : 'Could not update that background task.');
    } finally {
      setPendingJobCommand(null);
    }
  }

  const actionsById = new Map(actions.map((action) => [action.id, action]));
  const linkedActionIds = new Set(
    messages.flatMap((message) => (message.actionId ? [message.actionId] : [])),
  );
  const isThinking = busy && generating;
  const openingConversation = busy && !messages.length && !actions.length && !jobs.length;
  const lastMessageId = messages.at(-1)?.id;
  const lastUserIndex = messages.findLastIndex((message) => message.role === 'user');
  const waitingForText = generating && messages.at(-1)?.role === 'user';
  const draftingTool = generating
    ? toolCalls.find((call) => call.kind === 'draft' && call.state === 'running')
    : undefined;
  const pendingDrafts = actions.filter((action) => action.status === 'pending');

  const reviseMeal = (actionId: string, plannedFor: string, meal: string) =>
    void sendTurn(
      false,
      `Replace only the ${meal} on ${plannedFor} in draft ${actionId}. Keep every other meal exactly unchanged. Use revise_meal_plan_draft.`,
    );
  const renderActionCard = (action: AiDrawerAction) => (
    <AiActionCard
      key={action.id}
      action={action}
      onRevise={reviseMeal}
      busy={busy}
      pendingDecision={pendingDecision?.actionId === action.id ? pendingDecision.decision : null}
      autoImage={autoImages && liveActionIds.has(action.id)}
      keptMeals={keptMeals}
      onKeptMealsChange={setKeptMeals}
      onRefine={(actionId) => {
        setDraft(
          (current) => `${current.trim() ? `${current}\n\n` : ''}Change draft ${actionId}: `,
        );
        textareaRef.current?.focus();
      }}
      onDecide={(actionId, decision, resolutions, options) =>
        void decide(actionId, decision, resolutions, options)
      }
    />
  );

  if (!open) return null;
  return (
    <>
      <button
        className={styles.backdrop}
        type="button"
        aria-label="Close AI assistant"
        onClick={onClose}
      />
      <div
        ref={drawerRef}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-assistant-title"
        aria-busy={busy}
        tabIndex={-1}
        onKeyDown={modal.onKeyDown}
      >
        <div className={styles.viewport}>
          <div className={styles.header}>
            <span className={styles.assistantMark} aria-hidden="true">
              <Sparkles />
            </span>
            <div className={styles.headerCopy}>
              <h2 id="ai-assistant-title">Kitchen assistant</h2>
              {generating ? (
                <p className={styles.headerStatus} aria-hidden="true">
                  <i /> Working on your request
                </p>
              ) : null}
            </div>
            <button
              type="button"
              title="New conversation"
              aria-label="New conversation"
              onClick={() => void newThread()}
              disabled={busy}
            >
              {busy && status === 'Starting a new conversation…' ? (
                <LoadingIndicator label="Starting a new conversation" />
              ) : (
                <SquarePen />
              )}
            </button>
            <button
              type="button"
              aria-label="Assistant settings"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen(!settingsOpen)}
            >
              <Settings size={19} />
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
          </div>
          <div className={styles.stage}>
            <div
              ref={messagesRef}
              onWheel={(event) => {
                if (event.deltaY) pauseFollowing(event.currentTarget, event.deltaY > 0);
              }}
              onTouchStart={(event) => {
                touchY.current = event.touches[0]?.clientY ?? null;
              }}
              onTouchMove={(event) => {
                const nextY = event.touches[0]?.clientY;
                if (nextY !== undefined && touchY.current !== null && nextY !== touchY.current)
                  pauseFollowing(event.currentTarget, nextY < touchY.current);
                touchY.current = nextY ?? null;
              }}
              onTouchEnd={() => {
                touchY.current = null;
              }}
              onTouchCancel={() => {
                touchY.current = null;
              }}
              onKeyDown={(event) => {
                // Keys inside message controls still belong to those controls.
                if (event.target !== event.currentTarget) return;
                if (['ArrowUp', 'PageUp', 'Home'].includes(event.key))
                  pauseFollowing(event.currentTarget);
                else if (['ArrowDown', 'PageDown', 'End', ' '].includes(event.key))
                  pauseFollowing(event.currentTarget, !(event.key === ' ' && event.shiftKey));
              }}
              onPointerDown={(event) => {
                const list = event.currentTarget;
                if (event.target !== list || list.offsetWidth <= list.clientWidth) return;
                const left = list.getBoundingClientRect().left + list.clientLeft;
                if (event.clientX < left || event.clientX >= left + list.clientWidth)
                  pauseFollowing(list);
              }}
              onPointerUp={(event) => {
                const list = event.currentTarget;
                if (
                  readingScroll.current &&
                  list.scrollHeight - list.scrollTop - list.clientHeight <= 1
                ) {
                  readingScroll.current = null;
                  stickToBottom.current = true;
                  setNewResponse(false);
                }
              }}
              onFocusCapture={(event) => {
                if (event.target === event.currentTarget) return;
                // Focusing a review/link is reading intent, even before overflow.
                readingScroll.current = { lastTop: event.currentTarget.scrollTop };
                stickToBottom.current = false;
              }}
              onScroll={(event) => {
                const el = event.currentTarget;
                const reading = readingScroll.current;
                if (adjustingViewport.current && !reading) return;
                const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
                if (reading) {
                  // A programmatic event at the old bottom cannot erase fresh reading intent.
                  const returnedToLatest = el.scrollTop > reading.lastTop && remaining <= 1;
                  reading.lastTop = el.scrollTop;
                  stickToBottom.current = returnedToLatest;
                  if (returnedToLatest) {
                    readingScroll.current = null;
                    setNewResponse(false);
                  }
                } else stickToBottom.current = remaining < 72;
              }}
              className={styles.messages}
              data-chat-messages
              role="log"
              aria-label="Conversation"
              tabIndex={0}
              aria-live="off"
              aria-busy={busy}
            >
              <div ref={messageContentRef} className={styles.messageStack}>
                {settingsOpen ? (
                  <section className={styles.settingsPanel} aria-label="Assistant settings">
                    <h3>Assistant settings</h3>
                    <label>
                      Conversation
                      <select
                        value={threadId ?? ''}
                        disabled={busy}
                        onChange={(event) => void loadConversation(event.target.value)}
                      >
                        {conversationList.map((thread) => (
                          <option key={thread.id} value={thread.id}>
                            {thread.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.paidTools}>
                      <input
                        type="checkbox"
                        checked={allowPaidTools}
                        disabled={busy}
                        onChange={(event) => setAllowPaidTools(event.target.checked)}
                      />
                      <span>
                        <strong>Allow additional paid suggestions</strong>
                        <small>
                          Applies to this conversation. Image generation requires its own
                          confirmation.
                        </small>
                      </span>
                    </label>
                    <label className={styles.paidTools}>
                      <input
                        type="checkbox"
                        checked={autoImages}
                        onChange={(event) => {
                          setAutoImages(event.target.checked);
                          writeAutoImages(event.target.checked);
                        }}
                      />
                      <span>
                        <strong>Create a photo for new recipe drafts</strong>
                        <small>
                          On by default. Each photo is a paid image request and only runs when image
                          generation is enabled for your account. Meal plans ask before saving.
                        </small>
                      </span>
                    </label>
                    <p>
                      The assistant may request extra paid suggestions while reviewing your kitchen.
                      Normal chat uses your configured AI provider.
                    </p>
                    <div className={styles.settingsLinks}>
                      <a className="inline-link" href="/account/ai">
                        Personal AI settings
                      </a>
                      {canManageAiSettings ? (
                        <a className="inline-link" href="/settings/ai">
                          Global AI settings
                        </a>
                      ) : null}
                    </div>
                  </section>
                ) : null}
                {openingConversation ? (
                  <AsyncSkeleton
                    className={styles.loadingState}
                    label={status || 'Opening your assistant'}
                    variant="chat"
                  />
                ) : null}
                {!messages.length && !actions.length && !jobs.length && !busy ? (
                  <div className={styles.empty}>
                    <span className={styles.emptyMark} aria-hidden="true">
                      <Sparkles />
                    </span>
                    <h3>What can I help with?</h3>
                    <p>
                      Ask about recipes or nutrition, prepare an update, or generate a meal plan.
                      You will review every change before it is saved.
                    </p>
                    <ul className={styles.starters} aria-label="Suggested requests">
                      {STARTERS.map(({ icon: Icon, label, prompt }) => (
                        <li key={label}>
                          <button
                            type="button"
                            disabled={!threadId || busy}
                            onClick={() => void sendTurn(false, prompt)}
                          >
                            <Icon aria-hidden="true" />
                            <span>{label}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {messages.map((message, messageIndex) => {
                  const linkedAction = message.actionId
                    ? actionsById.get(message.actionId)
                    : undefined;
                  const parsed =
                    message.role === 'assistant' ? chatQuestion(message.content) : null;
                  const question = parsed?.question ?? null;
                  const answerText =
                    messages[messageIndex + 1]?.role === 'user'
                      ? messages[messageIndex + 1].content
                      : '';
                  const streaming =
                    generating && message.id === lastMessageId && message.role === 'assistant';
                  return (
                    <Fragment key={message.id}>
                      {question ? (
                        <div className={`${styles.message} ${styles.assistant}`}>
                          {parsed!.text.trim() &&
                          parsed!.text.trim() !== question.question.trim() ? (
                            <AssistantMessage content={parsed!.text} />
                          ) : null}
                          {message.id === lastMessageId ? (
                            <QuestionPrompt
                              questions={[
                                {
                                  kind: 'single',
                                  title: question.question,
                                  options: question.answers.map((label, index) => ({
                                    id: String(index),
                                    label,
                                  })),
                                  allowCustom: true,
                                  customPlaceholder: 'Or type your own answer',
                                },
                              ]}
                              busy={busy}
                              allowSkip={false}
                              onSubmit={(answer) => {
                                const reply =
                                  answer.text || question.answers[Number(answer.selectedIds?.[0])];
                                if (reply) void sendTurn(false, reply);
                              }}
                            />
                          ) : (
                            <div className={styles.answered}>
                              <p>{question.question}</p>
                              {answerText ? (
                                <span>
                                  <Check aria-hidden="true" /> {answerText}
                                </span>
                              ) : (
                                <span className={styles.skipped}>Not answered</span>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          className={`${styles.message} ${message.role === 'user' ? styles.user : styles.assistant}`}
                          data-streaming={streaming || undefined}
                        >
                          {message.role === 'assistant' ? (
                            <AssistantMessage
                              content={compactProposalMessage(message, linkedAction)}
                            />
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
                      )}
                      {messageIndex === lastUserIndex ? (
                        <>
                          {toolCalls.length ? (
                            <ChatToolCalls calls={toolCalls} active={generating} />
                          ) : null}
                          {draftingTool ? <DraftSkeleton label={`${draftingTool.title}…`} /> : null}
                          {waitingForText && !toolCalls.length ? (
                            <ThinkingRow label={status} />
                          ) : null}
                        </>
                      ) : null}
                      {linkedAction ? renderActionCard(linkedAction) : null}
                    </Fragment>
                  );
                })}
                {actions.filter((action) => !linkedActionIds.has(action.id)).map(renderActionCard)}
                {suggestions.map((card) => (
                  <div className={styles.suggestion} key={`${card.id}:${card.evidenceHash}`}>
                    <SuggestionCard
                      card={card}
                      onChange={(id, patch) =>
                        setSuggestions((current) =>
                          current.map((c) => (c.id === id ? { ...c, ...patch } : c)),
                        )
                      }
                    />
                  </div>
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
                {approvalRequests
                  .filter((r) => r.threadId === threadId || r.canApprove || r.canRevoke)
                  .map((request) => (
                    <AiRecoveryRequestCard
                      key={request.id}
                      request={request}
                      busy={approvalBusy || busy}
                      onResolve={(id, decision) => void resolveApproval(id, decision)}
                      onContinue={(r) => void continueApproved(r)}
                    />
                  ))}
                <div ref={bottomRef} />
              </div>
            </div>
            {newResponse ? (
              <button
                type="button"
                className={styles.jump}
                onClick={() => {
                  stickToBottom.current = true;
                  readingScroll.current = null;
                  setNewResponse(false);
                  messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight });
                }}
              >
                <ArrowDown aria-hidden="true" /> Jump to latest response
              </button>
            ) : null}
          </div>
          <div className={styles.composer}>
            {interviewMode && (
              <details className={styles.draftTray}>
                <summary>Interview controls</summary>
                <p>These add a draft reply. Review or edit it before sending.</p>
                {[
                  ['Skip this topic', 'Skip this topic for now; keep my saved answers.'],
                  [
                    'Previous topic',
                    'Go back to the previous interview topic so I can edit my answer.',
                  ],
                  [
                    'Review my answers',
                    'Show the stated answers and covered topics, and prepare a reviewed update for my own saved kitchen context.',
                  ],
                ].map(([label, reply]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setDraft((current) => `${current.trim() ? `${current}\n\n` : ''}${reply}`);
                      textareaRef.current?.focus();
                    }}
                  >
                    {label}
                  </button>
                ))}
              </details>
            )}
            {pendingDrafts.length ? (
              <details className={styles.draftTray}>
                <summary>
                  <span>
                    Drafts to review <b>{pendingDrafts.length}</b>
                  </span>
                </summary>
                <p>
                  These previews are temporary until you confirm them. Ask for changes before
                  saving.
                </p>
                {pendingDrafts.map((action, index) => (
                  <button
                    type="button"
                    key={action.id}
                    disabled={busy}
                    onClick={() => {
                      setDraft(
                        (current) =>
                          `${current.trim() ? `${current}\n\n` : ''}Revise draft ${index + 1} (${action.id}): `,
                      );
                      textareaRef.current?.focus();
                    }}
                  >
                    Revise {action.kind.replaceAll('_', ' ')} {index + 1}
                  </button>
                ))}
              </details>
            ) : null}
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
                disabled={!threadId}
              />
              <button
                type="button"
                className={`${styles.attachButton} ${styles.iconButton}`}
                aria-label="Attach images"
                title="Attach images"
                disabled={busy || attaching || attachments.length >= 20}
                onClick={() => fileInputRef.current?.click()}
              >
                {attaching ? <LoadingIndicator label="Attaching images" /> : <Plus />}
              </button>
              {generating ? (
                <button
                  type="button"
                  className={styles.stop}
                  onClick={() => turnAbort.current?.abort()}
                >
                  <Square aria-hidden="true" /> Stop generating
                </button>
              ) : null}
              <button
                type="submit"
                className={styles.iconButton}
                aria-label="Send message"
                title="Send message"
                disabled={
                  busy ||
                  recoveryRequired ||
                  attaching ||
                  !threadId ||
                  (!draft.trim() && !attachments.length)
                }
              >
                {isThinking ? <LoadingIndicator label="Sending message" /> : <ArrowUp />}
              </button>
            </form>
            <div className={styles.composerMeta}>
              {recoveryRequired ? (
                <div className={styles.recoveryActions}>
                  {unreviewedTurns.map((turn) => (
                    <div key={turn.id}>
                      <p>
                        The response was interrupted. Review the saved messages, changes and tasks
                        above before continuing. No uncertain operation will be repeated.
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void acknowledgeRecovery(turn.id)}
                      >
                        I reviewed the saved outcomes
                      </button>
                    </div>
                  ))}
                  {hasSubmittedTurn && !unreviewedTurns.length && (
                    <button type="button" disabled={busy} onClick={() => void sendTurn(true)}>
                      Check the same request
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => threadId && void loadConversation(threadId)}
                  >
                    Review current conversation
                  </button>
                </div>
              ) : null}
              {status && !unreviewedTurns.length ? (
                statusError ? (
                  <ChatProblemPanel
                    problem={problem}
                    message={status}
                    canManageSettings={canManageAiSettings}
                  />
                ) : (
                  <p className={styles.turnStatus} role="status">
                    {status}
                  </p>
                )
              ) : null}
              <p className={`${styles.keyboardHint} ${styles.desktopHint}`}>
                Enter to send · Shift + Enter for a new line
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
