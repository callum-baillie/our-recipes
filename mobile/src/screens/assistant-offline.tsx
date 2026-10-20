import * as React from 'react';
import { AssistantMessage } from '@/components/assistant-message';
import {
  ActionSheetIOS,
  Alert,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  interpolate,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, EditorialText, Eyebrow, Icon, IconButton, Surface } from '@/components/ui';
import { tokens } from '@/theme/tokens';
import { useBord } from '@/state/bord-store';
import { useSync } from '@/sync/sync-context';
import { useAuth } from '@/auth/auth-context';
import { readAssistantDraft, retainAssistantDraft } from '@/data/assistant-drafts';
import {
  initialChatStream,
  reduceChatStream,
  reviewedTurnOutcome,
} from '../../../shared/mobile-domain/chat-stream';
import { getAssistantSheetHeights } from '@/screens/assistant-sheet-layout';
import { useReducedMotion } from '@/accessibility/use-reduced-motion';
import {
  attachmentMimeType,
  attachmentSizeLabel,
  CHAT_FILE_MIME_TYPES,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_ATTACHMENTS_TOTAL_BYTES,
  safeAttachmentName,
  type ChatAttachment,
} from '@/screens/assistant-attachments';

const isIOS = Platform.OS === 'ios';
type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: Pick<ChatAttachment, 'id' | 'kind' | 'name' | 'size' | 'uri'>[];
};
type ChatAction = { id: string; kind: string; preview: unknown; status: string };
type ChatEvent = {
  type: string;
  delta?: string;
  message?: string;
  actionId?: string;
  kind?: string;
  preview?: unknown;
  sequence?: number;
  content?: string;
  messageId?: string;
  proposal?: AppProposal;
  job?: { id: string; status: string; title?: string };
};

type ChatTurn = {
  operationId: string;
  threadId: string;
  message: string;
  attachments: ChatAttachment[];
};
type RetainedConversation = {
  message: string;
  attachments: ChatAttachment[];
  threadId: string | null;
  turn: ChatTurn | null;
};
type AppProposal = {
  id: string;
  title: string;
  version: number;
  status: string;
  actions: {
    summary: string;
    recordLabel?: string;
    changeLabel?: string;
    body: unknown;
    path?: string;
  }[];
  results?: { summary: string; message: string; ok: boolean; state?: string; href?: string }[];
};

export function AssistantScreen() {
  const { instanceUrl, user } = useAuth();
  return <AssistantConversation key={`${instanceUrl ?? ''}:${user?.id ?? ''}`} />;
}

function AssistantConversation() {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const keyboard = useAnimatedKeyboard();
  const { request, requestEventStream, instanceUrl, user } = useAuth();
  const { refresh } = useSync();
  const scope = `${instanceUrl ?? ''}:${user?.id ?? ''}`;
  const retained = React.useRef(readAssistantDraft<RetainedConversation>(scope));
  const { state } = useBord();
  const [message, setMessage] = React.useState(retained.current?.message ?? '');
  const [threads, setThreads] = React.useState<{ id: string; title?: string }[]>([]);
  const [showHistory, setShowHistory] = React.useState(false);
  const [threadId, setThreadId] = React.useState<string | null>(retained.current?.threadId ?? null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [actions, setActions] = React.useState<ChatAction[]>([]);
  const [status, setStatus] = React.useState('Loading conversation…');
  const [busy, setBusy] = React.useState(false);
  const [attachments, setAttachments] = React.useState<ChatAttachment[]>(
    retained.current?.attachments ?? [],
  );
  const [appProposals, setAppProposals] = React.useState<AppProposal[]>([]);
  const [jobs, setJobs] = React.useState<{ id: string; status: string; title?: string }[]>([]);
  const turnRef = React.useRef<ChatTurn | null>(retained.current?.turn ?? null);
  const abortRef = React.useRef<AbortController | null>(null);
  const sendLock = React.useRef(false);
  const alive = React.useRef(true);
  const [recoveryRequired, setRecoveryRequired] = React.useState(!!turnRef.current);
  const following = React.useRef(true);
  const [newResponse, setNewResponse] = React.useState(false);
  const [actionErrors, setActionErrors] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    retainAssistantDraft(scope, { message, attachments, threadId, turn: turnRef.current });
  }, [scope, message, attachments, threadId, recoveryRequired, busy]);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abortRef.current?.abort();
    };
  }, []);
  const assistantEnabled = state.settings['ai.enabled'] !== false;
  const assistantName =
    typeof state.settings['ai.name'] === 'string' && state.settings['ai.name'].trim()
      ? state.settings['ai.name'].trim()
      : "Chef's Assistant";
  const messagesRef = React.useRef<ScrollView>(null);
  const { compactHeight, expandedHeight } = getAssistantSheetHeights(windowHeight, insets.top);
  const compact = compactHeight < 500;
  const sheetHeight = useSharedValue(compactHeight);
  const dragStartHeight = useSharedValue(compactHeight);

  React.useEffect(() => {
    sheetHeight.value = Math.min(Math.max(sheetHeight.value, compactHeight), expandedHeight);
  }, [compactHeight, expandedHeight, sheetHeight]);

  const snapSheet = React.useCallback(
    (target: 'compact' | 'expanded') => {
      const nextHeight = target === 'expanded' ? expandedHeight : compactHeight;
      sheetHeight.value = reduceMotion
        ? nextHeight
        : withSpring(nextHeight, {
            damping: 24,
            stiffness: 240,
            mass: 0.8,
          });
    },
    [compactHeight, expandedHeight, reduceMotion, sheetHeight],
  );

  const sheetGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-8, 8])
        .onBegin(() => {
          dragStartHeight.value = sheetHeight.value;
        })
        .onUpdate((event) => {
          sheetHeight.value = Math.min(
            expandedHeight,
            Math.max(compactHeight, dragStartHeight.value - event.translationY),
          );
        })
        .onEnd((event) => {
          const midpoint = compactHeight + (expandedHeight - compactHeight) * 0.5;
          const shouldExpand = event.velocityY < -350 || sheetHeight.value >= midpoint;
          const nextHeight = shouldExpand ? expandedHeight : compactHeight;
          sheetHeight.value = reduceMotion
            ? nextHeight
            : withSpring(nextHeight, {
                damping: 24,
                stiffness: 240,
                mass: 0.8,
              });
        }),
    [compactHeight, dragStartHeight, expandedHeight, reduceMotion, sheetHeight],
  );

  const sheetStyle = useAnimatedStyle(() => ({ height: sheetHeight.value }));
  const conversationMotionStyle = useAnimatedStyle(() => {
    if (reduceMotion || expandedHeight === compactHeight) return {};
    const progress = Math.min(
      1,
      Math.max(0, (sheetHeight.value - compactHeight) / (expandedHeight - compactHeight)),
    );

    return {
      opacity: interpolate(progress, [0, 1], [0.96, 1]),
      transform: [{ translateY: interpolate(progress, [0, 1], [4, 0]) }],
    };
  });
  const keyboardSpacerStyle = useAnimatedStyle(() => ({
    height: Math.max(0, keyboard.height.value - insets.bottom + tokens.space.xs),
  }));

  const closeAssistant = React.useCallback(() => {
    retainAssistantDraft(scope, { message, attachments, threadId, turn: turnRef.current });
    abortRef.current?.abort();
    Keyboard.dismiss();
    router.back();
  }, [scope, message, attachments, threadId]);

  React.useEffect(() => () => Keyboard.dismiss(), []);

  const loadThread = React.useCallback(
    async (id: string) => {
      const history = await request<{
        messages: ChatMessage[];
        actions: ChatAction[];
        jobs?: { id: string; status: string; title?: string }[];
        turns?: { id: string; status: string }[];
      }>(`/api/v1/ai/chat/threads/${encodeURIComponent(id)}`);
      const proposals = await request<{ proposals: AppProposal[] }>(
        `/api/v1/ai/app-actions?threadId=${encodeURIComponent(id)}`,
      );
      if (!alive.current) return;
      setMessages(history.messages);
      setActions(history.actions ?? []);
      setJobs(history.jobs ?? []);
      setAppProposals(proposals.proposals);
      const submitted = turnRef.current;
      const outcome = reviewedTurnOutcome(history.turns, submitted?.operationId);
      if (outcome.terminal) {
        turnRef.current = null;
        setRecoveryRequired(outcome.blocked);
        setStatus(
          `Previous request ${outcome.terminal}. Review its saved results${outcome.blocked ? '; another request remains running' : ' before sending another message'}.`,
        );
      } else if (outcome.blocked) {
        setRecoveryRequired(true);
        setStatus(
          'The last request may still be running. Review saved results or retry its original operation; no message is resubmitted automatically.',
        );
      } else {
        setRecoveryRequired(false);
        setStatus('');
      }
    },
    [request],
  );
  const reset = React.useCallback(async () => {
    setBusy(true);
    try {
      const result = await request<{ thread: { id: string; title?: string } }>(
        '/api/v1/ai/chat/threads',
        {
          method: 'POST',
          body: '{}',
        },
      );
      if (threadId)
        retainAssistantDraft(`${scope}:${threadId}`, {
          message,
          attachments,
          threadId,
          turn: turnRef.current,
        });
      turnRef.current = null;
      setRecoveryRequired(false);
      setAppProposals([]);
      setJobs([]);
      setThreads((current) => [result.thread, ...current]);
      setThreadId(result.thread.id);
      setMessages([]);
      setActions([]);
      setMessage('');
      setAttachments([]);
      setStatus('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not start a conversation.');
    } finally {
      setBusy(false);
    }
  }, [request, scope, threadId, message, attachments]);

  const addAttachments = React.useCallback((next: ChatAttachment[]) => {
    setAttachments((current) => {
      const available = MAX_CHAT_ATTACHMENTS - current.length;
      if (available <= 0) {
        Alert.alert(
          'Attachment limit reached',
          `Add up to ${MAX_CHAT_ATTACHMENTS} items per message.`,
        );
        return current;
      }
      const unique = next.filter(
        (candidate) =>
          !current.some(
            (existing) =>
              existing.uri === candidate.uri ||
              (existing.name === candidate.name && existing.size === candidate.size),
          ),
      );
      if (unique.length > available) {
        Alert.alert(
          'Some items were not added',
          `A message can include up to ${MAX_CHAT_ATTACHMENTS} attachments.`,
        );
      }
      const accepted: ChatAttachment[] = [];
      let totalBytes = current.reduce((total, attachment) => total + attachment.size, 0);
      for (const candidate of unique.slice(0, available)) {
        if (totalBytes + candidate.size > MAX_CHAT_ATTACHMENTS_TOTAL_BYTES) continue;
        accepted.push(candidate);
        totalBytes += candidate.size;
      }
      if (accepted.length < Math.min(unique.length, available)) {
        Alert.alert('Attachments too large', 'Keep the combined attachment size below 9 MB.');
      }
      return [...current, ...accepted];
    });
  }, []);

  const pickImages = React.useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_CHAT_ATTACHMENTS,
      quality: 0.72,
      base64: true,
    });
    if (result.canceled) return;
    const next: ChatAttachment[] = [];
    for (const asset of result.assets) {
      const dataBase64 = asset.base64 ?? '';
      const size = asset.fileSize ?? Math.ceil((dataBase64.length * 3) / 4);
      if (!dataBase64 || size > MAX_CHAT_ATTACHMENT_BYTES) {
        Alert.alert(
          'Image not added',
          `${asset.fileName ?? 'That image'} could not be read or is larger than 6 MB.`,
        );
        continue;
      }
      next.push({
        id: randomUUID(),
        kind: 'image',
        name: safeAttachmentName(asset.fileName ?? `kitchen-photo-${Date.now()}.jpg`, 'photo.jpg'),
        mimeType: 'image/jpeg',
        size,
        uri: asset.uri,
        dataBase64,
      });
    }
    addAttachments(next);
  }, [addAttachments]);

  const pickFiles = React.useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [...CHAT_FILE_MIME_TYPES],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const next: ChatAttachment[] = [];
    for (const asset of result.assets) {
      const mimeType = attachmentMimeType(asset.name, asset.mimeType);
      if (!mimeType) {
        Alert.alert('File not supported', `${asset.name} is not a supported document type.`);
        continue;
      }
      const size = asset.size ?? 0;
      if (size > MAX_CHAT_ATTACHMENT_BYTES) {
        Alert.alert('File too large', `${asset.name} is larger than 6 MB.`);
        continue;
      }
      try {
        const dataBase64 = await new File(asset.uri).base64();
        const measuredSize = size || Math.ceil((dataBase64.length * 3) / 4);
        if (measuredSize > MAX_CHAT_ATTACHMENT_BYTES) {
          Alert.alert('File too large', `${asset.name} is larger than 6 MB.`);
          continue;
        }
        next.push({
          id: randomUUID(),
          kind: 'file',
          name: safeAttachmentName(asset.name, 'attachment.txt'),
          mimeType,
          size: measuredSize,
          uri: asset.uri,
          dataBase64,
        });
      } catch {
        Alert.alert('File not added', `${asset.name} could not be read from the device.`);
      }
    }
    addAttachments(next);
  }, [addAttachments]);

  const openAttachmentMenu = React.useCallback(() => {
    if (isIOS) {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Add to your message',
          options: ['Choose photos', 'Choose files', 'Cancel'],
          cancelButtonIndex: 2,
        },
        (index) => {
          if (index === 0) void pickImages();
          if (index === 1) void pickFiles();
        },
      );
      return;
    }
    Alert.alert('Add to your message', undefined, [
      { text: 'Choose photos', onPress: () => void pickImages() },
      { text: 'Choose files', onPress: () => void pickFiles() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [pickFiles, pickImages]);
  const initialLoad = React.useRef({ loadThread, reset });
  React.useEffect(() => {
    let cancelled = false;
    void request<{ threads: { id: string; title?: string }[] }>('/api/v1/ai/chat/threads')
      .then(async ({ threads }) => {
        if (cancelled) return;
        setThreads(threads);
        if (
          retained.current?.threadId &&
          !threads.some((thread) => thread.id === retained.current?.threadId)
        ) {
          setThreadId(null);
          setRecoveryRequired(true);
          setStatus(
            'The retained conversation is no longer available to this account. Your draft is kept here; start a new conversation deliberately to continue.',
          );
          return;
        }
        if (!threads[0]) {
          await initialLoad.current.reset();
          return;
        }
        const id =
          retained.current?.threadId &&
          threads.some((thread) => thread.id === retained.current?.threadId)
            ? retained.current.threadId
            : threads[0].id;
        setThreadId(id);
        await initialLoad.current.loadThread(id);
      })
      .catch((error) =>
        setStatus(error instanceof Error ? error.message : 'Could not load the assistant.'),
      );
    return () => {
      cancelled = true;
    };
  }, [request]);
  const switchThread = async (id: string) => {
    if (busy || id === threadId) return;
    if (threadId)
      retainAssistantDraft(`${scope}:${threadId}`, {
        message,
        attachments,
        threadId,
        turn: turnRef.current,
      });
    const saved = readAssistantDraft<RetainedConversation>(`${scope}:${id}`);
    turnRef.current = saved?.turn ?? null;
    setMessage(saved?.message ?? '');
    setAttachments(saved?.attachments ?? []);
    setRecoveryRequired(!!saved?.turn);
    setThreadId(id);
    setBusy(true);
    setShowHistory(false);
    setMessages([]);
    setActions([]);
    setAppProposals([]);
    setJobs([]);
    try {
      await loadThread(id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not load this conversation.');
    } finally {
      setBusy(false);
    }
  };
  const performSend = React.useCallback(
    async (retry = false) => {
      if (sendLock.current || busy || !threadId || (!retry && recoveryRequired)) return;
      const attempt = retry
        ? turnRef.current
        : { operationId: randomUUID(), threadId, message: message.trim(), attachments };
      if (!attempt || (!attempt.message && !attempt.attachments.length)) return;
      sendLock.current = true;
      turnRef.current = attempt;
      const abort = new AbortController();
      abortRef.current = abort;
      const responseId = `response-${attempt.operationId}`;
      if (!retry) {
        setMessages((current) => [
          ...current,
          {
            id: `request-${attempt.operationId}`,
            role: 'user',
            content: attempt.message,
            attachments: attempt.attachments.map(({ id, kind, name, size, uri }) => ({
              id,
              kind,
              name,
              size,
              uri,
            })),
          },
        ]);
        setMessage('');
        setAttachments([]);
      }
      following.current = true;
      setMessages((current) => current.filter((entry) => entry.id !== responseId));
      setBusy(true);
      setRecoveryRequired(false);
      setStatus('Preparing a response…');
      let stream = { ...initialChatStream };
      try {
        await requestEventStream<ChatEvent>(
          `/api/v1/ai/chat/threads/${encodeURIComponent(attempt.threadId)}/messages`,
          (event) => {
            if (!alive.current || abort.signal.aborted) return;
            const previous = stream;
            stream = reduceChatStream(stream, event);
            if (stream === previous) return;
            if (event.type === 'status') setStatus(stream.status);
            if (['text', 'text_reset', 'done'].includes(event.type)) {
              const id = stream.completed ? (stream.messageId ?? responseId) : responseId;
              setMessages((current) => [
                ...current.filter((entry) => entry.id !== responseId && entry.id !== id),
                ...(stream.text ? [{ id, role: 'assistant' as const, content: stream.text }] : []),
              ]);
              if (!following.current) setNewResponse(true);
            }
            if (event.type === 'action' && event.actionId && event.kind)
              setActions((current) => [
                ...current.filter((action) => action.id !== event.actionId),
                {
                  id: event.actionId!,
                  kind: event.kind!,
                  preview: event.preview,
                  status: 'pending',
                },
              ]);
            if (event.type === 'app_action' && event.proposal)
              setAppProposals((current) => [
                ...current.filter((proposal) => proposal.id !== event.proposal!.id),
                event.proposal!,
              ]);
            if (event.type === 'job' && event.job)
              setJobs((current) => [
                ...current.filter((job) => job.id !== event.job!.id),
                event.job!,
              ]);
          },
          {
            method: 'POST',
            signal: abort.signal,
            body: JSON.stringify({
              operationId: attempt.operationId,
              message: attempt.message,
              attachments: attempt.attachments.map(({ kind, name, mimeType, dataBase64 }) => ({
                kind,
                name,
                mimeType,
                dataBase64,
              })),
            }),
          },
        );
        if (!stream.completed)
          throw new Error('The connection ended before a completed response was acknowledged.');
        turnRef.current = null;
        if (alive.current) {
          setRecoveryRequired(false);
          setStatus('');
        }
      } catch (error) {
        if (alive.current) {
          setRecoveryRequired(true);
          setStatus(
            abort.signal.aborted
              ? 'Response reading stopped. Saved tasks or proposals may remain; reload the conversation to review their outcome.'
              : `${error instanceof Error ? error.message : 'The response could not finish.'} Review saved results before another request.`,
          );
        }
      } finally {
        sendLock.current = false;
        abortRef.current = null;
        if (alive.current) setBusy(false);
      }
    },
    [attachments, busy, message, requestEventStream, threadId, recoveryRequired],
  );
  const send = React.useCallback(() => {
    if (!assistantEnabled) {
      setStatus('Kitchen Assistant is turned off in Settings.');
      return;
    }
    if (recoveryRequired || (!message.trim() && attachments.length === 0)) return;
    void performSend();
  }, [assistantEnabled, attachments.length, message, performSend, recoveryRequired]);
  const decide = React.useCallback(
    async (actionId: string, decision: 'confirm' | 'cancel') => {
      if (!threadId || busy) return;
      setBusy(true);
      setActionErrors((current) => ({ ...current, [actionId]: '' }));
      try {
        await request(`/api/v1/ai/actions/${encodeURIComponent(actionId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ decision, conflictResolutions: [] }),
        });
        await loadThread(threadId);
      } catch (error) {
        setActionErrors((current) => ({
          ...current,
          [actionId]: error instanceof Error ? error.message : 'The proposal could not be updated.',
        }));
      } finally {
        setBusy(false);
      }
    },
    [busy, loadThread, request, threadId],
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close Kitchen Assistant"
          onPress={closeAssistant}
          style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(20, 22, 17, 0.34)' }}
        />

        <Animated.View
          style={[
            {
              overflow: 'hidden',
              backgroundColor: tokens.color.paper,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              borderCurve: 'continuous',
            },
            sheetStyle,
          ]}
        >
          <GestureDetector gesture={sheetGesture}>
            <View
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel="Assistant drawer height"
              accessibilityHint="Swipe up to expand or down to collapse"
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(event) =>
                snapSheet(event.nativeEvent.actionName === 'increment' ? 'expanded' : 'compact')
              }
              style={{ minHeight: 28, alignItems: 'center', justifyContent: 'center' }}
            >
              <View
                style={{
                  width: 38,
                  height: 5,
                  borderRadius: tokens.radius.capsule,
                  backgroundColor: tokens.color.inkTertiary,
                  opacity: 0.55,
                }}
              />
            </View>
          </GestureDetector>

          <View
            style={{
              paddingHorizontal: tokens.layout.page,
              paddingBottom: tokens.space.sm,
              gap: tokens.space.sm,
              flexShrink: 0,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm }}>
              <EditorialText variant="section" style={{ flex: 1 }}>
                {assistantName}
              </EditorialText>
              <IconButton
                label="Start a new conversation"
                icon="plus"
                appearance="plain"
                disabled={busy || !assistantEnabled}
                onPress={() => {
                  if (message.trim() || attachments.length || turnRef.current)
                    Alert.alert(
                      'Start a new conversation?',
                      'The current draft stays on this device. A previous server request may still finish in its original conversation.',
                      [
                        { text: 'Keep conversation', style: 'cancel' },
                        { text: 'New conversation', onPress: () => void reset() },
                      ],
                    );
                  else void reset();
                }}
              />
              <IconButton
                label="Close Kitchen Assistant"
                icon="xmark"
                appearance="plain"
                onPress={closeAssistant}
              />
            </View>
          </View>

          <Button
            label={showHistory ? 'Hide conversations' : 'Conversations'}
            tone="quiet"
            disabled={busy}
            onPress={() => setShowHistory(!showHistory)}
          />
          {showHistory ? (
            <ScrollView
              style={{ maxHeight: 180 }}
              contentContainerStyle={{ paddingHorizontal: tokens.layout.page }}
            >
              {threads.map((thread) => (
                <Button
                  key={thread.id}
                  label={`${thread.id === threadId ? 'Current · ' : ''}${thread.title || 'Conversation'}`}
                  tone="quiet"
                  disabled={busy || thread.id === threadId}
                  onPress={() => void switchThread(thread.id)}
                />
              ))}
            </ScrollView>
          ) : null}
          <Animated.View style={[{ flex: 1 }, conversationMotionStyle]}>
            <ScrollView
              ref={messagesRef}
              contentInsetAdjustmentBehavior="never"
              keyboardDismissMode={isIOS ? 'interactive' : 'on-drag'}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                flexGrow: 1,
                justifyContent: 'flex-end',
                gap: tokens.space.sm,
                paddingHorizontal: tokens.layout.page,
                paddingTop: compact ? tokens.space.xs : tokens.space.md,
                paddingBottom: tokens.space.sm,
              }}
              style={{ flex: 1 }}
              onContentSizeChange={() => {
                if (following.current) messagesRef.current?.scrollToEnd({ animated: !compact });
              }}
              scrollEventThrottle={100}
              onScroll={(event) => {
                const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
                following.current =
                  contentSize.height - contentOffset.y - layoutMeasurement.height < 80;
                if (following.current) setNewResponse(false);
              }}
            >
              {!assistantEnabled ? (
                <Surface style={{ backgroundColor: tokens.color.sage }}>
                  <Body>
                    Kitchen Assistant is off. Enable it in Settings → AI settings when you want to
                    use it.
                  </Body>
                  <Button
                    label="Open AI settings"
                    tone="secondary"
                    onPress={() => router.push('/settings/ai')}
                  />
                </Surface>
              ) : null}

              {messages.length === 0 && assistantEnabled ? (
                <Animated.View
                  entering={reduceMotion ? undefined : FadeIn.duration(180)}
                  exiting={reduceMotion ? undefined : FadeOut.duration(140)}
                  layout={reduceMotion ? undefined : LinearTransition.duration(180)}
                >
                  <AssistantWelcome assistantName={assistantName} compact={compact} />
                </Animated.View>
              ) : null}

              {messages.map((entry) => (
                <View
                  key={entry.id}
                  accessibilityLabel={`${entry.role === 'user' ? 'You' : 'Assistant'}: ${entry.content}`}
                  style={{
                    maxWidth: entry.role === 'user' ? '88%' : '94%',
                    alignSelf: entry.role === 'user' ? 'flex-end' : 'flex-start',
                    paddingHorizontal: tokens.space.md,
                    paddingVertical: tokens.space.sm,
                    borderRadius: tokens.radius.card,
                    borderBottomRightRadius: entry.role === 'user' ? 6 : tokens.radius.card,
                    borderBottomLeftRadius: entry.role === 'assistant' ? 6 : tokens.radius.card,
                    borderCurve: 'continuous',
                    backgroundColor:
                      entry.role === 'user' ? tokens.color.olive : tokens.color.paperRaised,
                    gap: tokens.space.xs,
                  }}
                >
                  {entry.attachments?.map((attachment) => (
                    <MessageAttachmentPreview key={attachment.id} attachment={attachment} />
                  ))}
                  {entry.content && entry.role === 'assistant' ? (
                    <AssistantMessage content={entry.content} />
                  ) : entry.content ? (
                    <Text
                      selectable
                      style={[
                        tokens.type.callout,
                        {
                          color: entry.role === 'user' ? tokens.color.inverse : tokens.color.ink,
                          fontWeight: entry.role === 'user' ? '600' : '400',
                        },
                      ]}
                    >
                      {entry.content}
                    </Text>
                  ) : null}
                </View>
              ))}
              {actions
                .filter((action) => action.status === 'proposed' || action.status === 'pending')
                .map((action) => (
                  <Surface
                    key={action.id}
                    elevated
                    style={{
                      maxWidth: '94%',
                      alignSelf: 'flex-start',
                      backgroundColor: tokens.color.sage,
                    }}
                  >
                    <Eyebrow>REVIEW PROPOSAL</Eyebrow>
                    <EditorialText variant="section">{proposalTitle(action)}</EditorialText>
                    <Body muted>{proposalDetail(action)}</Body>
                    {actionErrors[action.id] ? (
                      <Text accessibilityRole="alert">{actionErrors[action.id]}</Text>
                    ) : null}
                    <View style={{ flexDirection: 'row', gap: tokens.space.xs }}>
                      <View style={{ flex: 1 }}>
                        <Button
                          label="Discard"
                          tone="secondary"
                          disabled={busy}
                          onPress={() => void decide(action.id, 'cancel')}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button
                          label="Confirm change"
                          disabled={busy}
                          onPress={() =>
                            Alert.alert(
                              'Confirm assistant change?',
                              'Bòrd will apply this reviewed proposal to the household server.',
                              [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'Confirm',
                                  onPress: () => void decide(action.id, 'confirm'),
                                },
                              ],
                            )
                          }
                        />
                      </View>
                    </View>
                  </Surface>
                ))}
              {appProposals.map((proposal) => (
                <NativeAppProposal
                  key={proposal.id}
                  proposal={proposal}
                  disabled={busy}
                  onSaved={async () => {
                    if (threadId) await loadThread(threadId);
                    await refresh();
                  }}
                />
              ))}
              {jobs.map((job) => (
                <Surface key={job.id}>
                  <Body>
                    {job.title ?? 'Background task'} · {job.status.replaceAll('_', ' ')}
                  </Body>
                  <Body muted>Review the task for its saved results and application state.</Body>
                  <Button
                    label="Review tasks in web app"
                    tone="secondary"
                    onPress={() => {
                      if (instanceUrl) void Linking.openURL(`${instanceUrl}/account/automation`);
                    }}
                  />
                </Surface>
              ))}
              {recoveryRequired && !busy && (
                <Surface>
                  <Body>
                    The previous request has no current acknowledged outcome. Your next-message
                    draft is separate.
                  </Body>
                  <Button
                    label="Reload saved conversation"
                    tone="secondary"
                    onPress={() => {
                      if (threadId)
                        void loadThread(threadId).catch((error) => setStatus(error.message));
                    }}
                  />
                  <Button
                    label="Retry original request safely"
                    disabled={!turnRef.current}
                    onPress={() => void performSend(true)}
                  />
                </Surface>
              )}
              {status ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[
                    tokens.type.caption,
                    { color: tokens.color.inkSecondary, textAlign: 'center' },
                  ]}
                >
                  {status}
                </Text>
              ) : null}
            </ScrollView>
          </Animated.View>

          {newResponse && (
            <Button
              label="New response · jump to latest"
              tone="quiet"
              onPress={() => {
                following.current = true;
                setNewResponse(false);
                messagesRef.current?.scrollToEnd({ animated: true });
              }}
            />
          )}
          {busy && turnRef.current && (
            <Button
              label="Stop generating"
              tone="secondary"
              onPress={() => abortRef.current?.abort()}
            />
          )}
          <View style={{ flexShrink: 0, backgroundColor: tokens.color.paper }}>
            <View
              style={{
                paddingHorizontal: tokens.layout.page,
                paddingTop: tokens.space.xs,
                paddingBottom: Math.max(insets.bottom, tokens.space.sm),
                borderTopWidth: 1,
                borderTopColor: tokens.color.separator,
                backgroundColor: tokens.color.paper,
              }}
            >
              <View
                style={{
                  minHeight: tokens.layout.touch + 12,
                  padding: tokens.space.xxs,
                  borderRadius: tokens.radius.glass,
                  borderCurve: 'continuous',
                  borderWidth: 1,
                  borderColor: tokens.color.separator,
                  backgroundColor: tokens.color.surface,
                  gap: tokens.space.xxs,
                }}
              >
                {attachments.length ? (
                  <ScrollView
                    horizontal
                    keyboardShouldPersistTaps="handled"
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: tokens.space.xs, padding: tokens.space.xxs }}
                    style={{ flexGrow: 0 }}
                  >
                    {attachments.map((attachment) => (
                      <ComposerAttachment
                        key={attachment.id}
                        attachment={attachment}
                        onRemove={() =>
                          setAttachments((current) =>
                            current.filter((candidate) => candidate.id !== attachment.id),
                          )
                        }
                      />
                    ))}
                  </ScrollView>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
                  <IconButton
                    label="Add photos or files"
                    icon="plus"
                    appearance="plain"
                    disabled={!assistantEnabled || busy}
                    onPress={openAttachmentMenu}
                  />
                  <TextInput
                    accessibilityLabel="Message Chef's Assistant"
                    value={message}
                    onChangeText={setMessage}
                    placeholder="Message Chef's Assistant"
                    placeholderTextColor={tokens.color.inkTertiary}
                    editable={assistantEnabled}
                    multiline
                    maxLength={8000}
                    textAlignVertical="center"
                    blurOnSubmit={false}
                    onFocus={() => {
                      snapSheet('expanded');
                      // Keep the latest messages visible as the composer rises above the keyboard.
                      if (following.current)
                        requestAnimationFrame(() =>
                          messagesRef.current?.scrollToEnd({ animated: true }),
                        );
                    }}
                    style={[
                      tokens.type.callout,
                      {
                        flex: 1,
                        minHeight: tokens.layout.touch,
                        maxHeight: 120,
                        paddingHorizontal: tokens.space.xs,
                        paddingVertical: 10,
                        backgroundColor: tokens.color.surface,
                        color: tokens.color.ink,
                      },
                    ]}
                  />
                  <IconButton
                    label="Send message"
                    icon="arrow.up"
                    tone={message.trim() || attachments.length ? 'accent' : 'neutral'}
                    appearance={message.trim() || attachments.length ? 'filled' : 'plain'}
                    disabled={
                      !assistantEnabled ||
                      (!message.trim() && attachments.length === 0) ||
                      busy ||
                      recoveryRequired ||
                      !threadId
                    }
                    onPress={send}
                  />
                </View>
              </View>
            </View>
            <Animated.View pointerEvents="none" style={keyboardSpacerStyle} />
          </View>
        </Animated.View>
      </View>
    </GestureHandlerRootView>
  );
}

function proposalTitle(action: ChatAction) {
  const preview =
    action.preview && typeof action.preview === 'object'
      ? (action.preview as Record<string, unknown>)
      : {};
  const recipe =
    preview.recipe && typeof preview.recipe === 'object'
      ? (preview.recipe as Record<string, unknown>)
      : null;
  if (recipe && typeof recipe.title === 'string') return recipe.title;
  if (action.kind === 'meal_plan_generate') return 'Generated meal plan';
  if (action.kind === 'recipe_update') return 'Recipe changes';
  if (action.kind === 'recipe_batch_create') return 'Recipe collection';
  return 'Kitchen change';
}

function proposalDetail(action: ChatAction) {
  const labels: Record<string, string> = {
    recipe_create: 'Review the recipe fields before adding it to your cookbook.',
    recipe_update: 'Review the proposed edits before replacing the current recipe revision.',
    recipe_batch_create: 'Review the generated recipes before adding the batch.',
    meal_plan_generate:
      'Review dates, servings, and protected manual entries before applying the plan.',
  };
  return labels[action.kind] ?? 'The assistant prepared this change but has not applied it.';
}

function ComposerAttachment({
  attachment,
  onRemove,
}: {
  attachment: ChatAttachment;
  onRemove: () => void;
}) {
  return (
    <View
      style={{
        width: 174,
        minHeight: 58,
        padding: tokens.space.xxs,
        borderRadius: tokens.radius.control,
        borderCurve: 'continuous',
        backgroundColor: tokens.color.secondarySurface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.space.xs,
      }}
    >
      {attachment.kind === 'image' ? (
        <Image
          source={{ uri: attachment.uri }}
          contentFit="cover"
          style={{ width: 48, height: 48, borderRadius: tokens.radius.small }}
        />
      ) : (
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: tokens.radius.small,
            backgroundColor: tokens.color.sage,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="doc.text" color={tokens.color.olive} size={20} />
        </View>
      )}
      <View style={{ flex: 1, gap: 1 }}>
        <Text
          numberOfLines={1}
          style={[tokens.type.caption, { color: tokens.color.ink, fontWeight: '700' }]}
        >
          {attachment.name}
        </Text>
        <Text style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
          {attachmentSizeLabel(attachment.size)}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${attachment.name}`}
        hitSlop={8}
        onPress={onRemove}
        style={({ pressed }) => ({
          width: 32,
          minHeight: tokens.layout.touch,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.55 : 1,
        })}
      >
        <Icon name="xmark.circle" color={tokens.color.inkSecondary} size={18} />
      </Pressable>
    </View>
  );
}

function MessageAttachmentPreview({
  attachment,
}: {
  attachment: NonNullable<ChatMessage['attachments']>[number];
}) {
  if (attachment.kind === 'image') {
    return (
      <Image
        accessibilityLabel={`Attached image ${attachment.name}`}
        source={{ uri: attachment.uri }}
        contentFit="cover"
        style={{ width: 180, height: 112, borderRadius: tokens.radius.control }}
      />
    );
  }
  return (
    <View
      style={{
        minHeight: 44,
        paddingHorizontal: tokens.space.sm,
        borderRadius: tokens.radius.control,
        borderCurve: 'continuous',
        backgroundColor: tokens.color.surface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.space.xs,
      }}
    >
      <Icon name="doc.text" color={tokens.color.olive} size={18} />
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={[tokens.type.caption, { color: tokens.color.ink, fontWeight: '700' }]}
        >
          {attachment.name}
        </Text>
        <Text style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
          {attachmentSizeLabel(attachment.size)}
        </Text>
      </View>
    </View>
  );
}

function NativeAppProposal({
  proposal,
  disabled,
  onSaved,
}: {
  proposal: AppProposal;
  disabled: boolean;
  onSaved: () => Promise<void>;
}) {
  const { request, instanceUrl } = useAuth();
  const [current, setCurrent] = React.useState(proposal);
  const [pending, setPending] = React.useState<'apply' | 'dismiss' | null>(null);
  const [error, setError] = React.useState('');
  const [detail, setDetail] = React.useState(false);
  const [paidConsent, setPaidConsent] = React.useState(false);
  const images =
    current.actions.length > 0 &&
    current.actions.every((action) => action.path?.endsWith('/images/generate'));
  React.useEffect(() => setPaidConsent(false), [proposal.id, proposal.version]);
  const lock = React.useRef(false);
  React.useEffect(() => setCurrent(proposal), [proposal]);
  const decide = async (decision: 'apply' | 'dismiss') => {
    if (lock.current || disabled || (decision === 'apply' && images && !paidConsent)) return;
    lock.current = true;
    setPending(decision);
    setError('');
    try {
      const result = await request<AppProposal>('/api/v1/ai/app-actions', {
        method: 'POST',
        body: JSON.stringify({ id: current.id, version: current.version, decision }),
      });
      setCurrent((previous) => ({ ...previous, ...result }));
      try {
        await onSaved();
      } catch {
        setError('The result is saved. Refresh the conversation to reload current records.');
      }
    } catch (failure) {
      setError(
        `${failure instanceof Error ? failure.message : 'The action could not be acknowledged.'} Reload saved results before changing the proposal; an exact retry keeps this reviewed version.`,
      );
    } finally {
      lock.current = false;
      setPending(null);
    }
  };
  const reviewable = ['proposed', 'pending', 'ready'].includes(current.status);
  return (
    <Surface style={{ backgroundColor: tokens.color.sage }}>
      <Eyebrow>{current.status.replaceAll('_', ' ')}</Eyebrow>
      <EditorialText variant="section">{current.title}</EditorialText>
      {current.actions.map((action, index) => (
        <View key={index} style={{ gap: tokens.space.xs }}>
          <Body>{action.summary}</Body>
          {action.recordLabel ? <Body muted>{action.recordLabel}</Body> : null}
          {action.changeLabel ? <Body muted>{action.changeLabel}</Body> : null}
          {detail ? (
            <Text selectable style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
              {JSON.stringify(action.body, null, 2)}
            </Text>
          ) : null}
        </View>
      ))}
      <Button
        label={detail ? 'Hide request details' : 'Review request details'}
        tone="quiet"
        onPress={() => setDetail(!detail)}
      />
      {current.results?.map((result, index) => (
        <View key={index}>
          <Body>
            {result.summary}: {result.state ?? (result.ok ? 'completed' : 'failed')}
          </Body>
          <Body muted>{result.message}</Body>
          {result.href?.startsWith('/') && !result.href.startsWith('//') && instanceUrl ? (
            <Button
              label="Open changed record in web app"
              tone="quiet"
              onPress={() => {
                void Linking.openURL(`${instanceUrl}${result.href}`).catch(() =>
                  setError('Could not open the web app.'),
                );
              }}
            />
          ) : null}
        </View>
      ))}
      {error ? (
        <Text accessibilityRole="alert" style={{ color: tokens.color.ink }}>
          {error}
        </Text>
      ) : null}
      {reviewable && images ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: paidConsent, disabled: !!pending }}
          disabled={!!pending}
          onPress={() => setPaidConsent(!paidConsent)}
          style={{ minHeight: 48, justifyContent: 'center' }}
        >
          <Body>
            {paidConsent ? '✓ ' : '○ '}I authorize paid image generation for these recipes. Recipe
            context is sent to the configured provider; candidates need review before selection.
          </Body>
        </Pressable>
      ) : null}
      {reviewable ? (
        <View style={{ gap: tokens.space.xs }}>
          <Button
            label={
              pending === 'apply'
                ? 'Submitting reviewed changes…'
                : images
                  ? 'Start paid image generation'
                  : 'Apply reviewed changes'
            }
            disabled={disabled || !!pending || (images && !paidConsent)}
            onPress={() => {
              Alert.alert(
                images ? 'Start paid image generation?' : 'Apply these reviewed changes?',
                `${current.actions.length} action${current.actions.length === 1 ? '' : 's'} will use the displayed records and quantities.`,
                [
                  { text: 'Keep reviewing', style: 'cancel' },
                  {
                    text: images ? 'Start paid generation' : 'Apply changes',
                    onPress: () => void decide('apply'),
                  },
                ],
              );
            }}
          />
          <Button
            label={pending === 'dismiss' ? 'Dismissing…' : 'Dismiss proposal'}
            tone="secondary"
            disabled={disabled || !!pending}
            onPress={() => void decide('dismiss')}
          />
        </View>
      ) : null}
    </Surface>
  );
}

function AssistantWelcome({ assistantName, compact }: { assistantName: string; compact: boolean }) {
  return (
    <View
      style={{
        padding: compact ? tokens.space.sm : tokens.space.lg,
        borderRadius: tokens.radius.card,
        borderCurve: 'continuous',
        backgroundColor: tokens.color.sage,
        gap: compact ? tokens.space.xs : tokens.space.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm }}>
        <View
          style={{
            width: compact ? 36 : 42,
            height: compact ? 36 : 42,
            borderRadius: 14,
            borderCurve: 'continuous',
            backgroundColor: tokens.color.paperRaised,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Icon name="sparkles" color={tokens.color.olive} size={21} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Eyebrow>READY WHEN YOU ARE</Eyebrow>
          <EditorialText
            variant="section"
            style={compact ? { fontSize: 19, lineHeight: 22 } : undefined}
          >
            A second set of hands in the kitchen.
          </EditorialText>
        </View>
      </View>

      <Body muted style={compact ? { fontSize: 14, lineHeight: 18 } : undefined}>
        {assistantName} can work with your synced recipes, pantry, nutrition goals, and meal plan.
        Ask naturally—you’ll review any proposed changes before they’re saved.
      </Body>

      <View style={{ gap: tokens.space.xs }}>
        <AssistantExample
          compact={compact}
          icon="leaf"
          text="What can I make with ingredients that need using?"
        />
        <AssistantExample
          compact={compact}
          icon="calendar"
          text="Plan three balanced dinners for this week."
        />
        <AssistantExample
          compact={compact}
          icon="fork.knife"
          text="Adapt tonight’s recipe for our preferences."
        />
      </View>
    </View>
  );
}

function AssistantExample({
  compact,
  icon,
  text,
}: {
  compact: boolean;
  icon: string;
  text: string;
}) {
  return (
    <View
      accessibilityLabel={`Example request: ${text}`}
      style={{
        minHeight: compact ? 36 : 42,
        paddingHorizontal: tokens.space.sm,
        paddingVertical: compact ? tokens.space.xxs : tokens.space.xs,
        borderRadius: tokens.radius.small,
        borderCurve: 'continuous',
        backgroundColor: tokens.color.paperRaised,
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.space.sm,
      }}
    >
      <Icon name={icon} color={tokens.color.olive} size={17} />
      <Text selectable style={[tokens.type.caption, { flex: 1, color: tokens.color.ink }]}>
        “{text}”
      </Text>
    </View>
  );
}
export function OfflineScreen() {
  const { state } = useBord();
  const { error, refresh, refreshing } = useSync();
  React.useEffect(() => {
    if (!state.offline) router.back();
  }, [state.offline]);
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        backgroundColor: tokens.color.sage,
        padding: tokens.space.xl,
      }}
    >
      <Surface
        elevated
        style={{ alignItems: 'center', padding: tokens.space.xl, gap: tokens.space.md }}
      >
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            backgroundColor: tokens.color.olive,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="wifi.slash" fallback="⌁" color={tokens.color.inverse} size={26} />
        </View>
        <Eyebrow>OFFLINE READING</Eyebrow>
        <EditorialText variant="title" style={{ textAlign: 'center' }}>
          The kitchen is out of reach for a moment.
        </EditorialText>
        <Body muted style={{ textAlign: 'center' }}>
          Your saved recipes, Pantry, plan, and active lists remain available to read. Editing is
          paused so the server stays the source of truth.
        </Body>
        <View
          style={{
            width: '100%',
            minHeight: 42,
            borderRadius: tokens.radius.small,
            backgroundColor: tokens.color.sage,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Icon name="arrow.down.circle" fallback="↓" color={tokens.color.olive} />
          <Text style={[tokens.type.caption, { color: tokens.color.olive, fontWeight: '800' }]}>
            {state.recipes.length} recipe{state.recipes.length === 1 ? '' : 's'} available offline
          </Text>
        </View>
        <Button
          label={refreshing ? 'Connecting…' : 'Try again'}
          disabled={refreshing}
          onPress={() => void refresh()}
        />
        <Text
          style={[tokens.type.caption, { color: tokens.color.inkSecondary, textAlign: 'center' }]}
        >
          {error ?? 'No edits are waiting or silently queued.'}
        </Text>
      </Surface>
    </View>
  );
}
