import * as React from 'react';
import {
  ActionSheetIOS,
  Alert,
  Keyboard,
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
};

export function AssistantScreen() {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const keyboard = useAnimatedKeyboard();
  const { request, requestEvents } = useAuth();
  const { state } = useBord();
  const [message, setMessage] = React.useState('');
  const [threadId, setThreadId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [actions, setActions] = React.useState<ChatAction[]>([]);
  const [status, setStatus] = React.useState('Loading conversation…');
  const [busy, setBusy] = React.useState(false);
  const [attachments, setAttachments] = React.useState<ChatAttachment[]>([]);
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
    Keyboard.dismiss();
    router.back();
  }, []);

  React.useEffect(() => () => Keyboard.dismiss(), []);

  const loadThread = React.useCallback(
    async (id: string) => {
      const history = await request<{ messages: ChatMessage[]; actions: ChatAction[] }>(
        `/api/v1/ai/chat/threads/${encodeURIComponent(id)}`,
      );
      setMessages(history.messages);
      setActions(history.actions ?? []);
      setStatus('');
    },
    [request],
  );
  const reset = React.useCallback(async () => {
    setBusy(true);
    try {
      const result = await request<{ thread: { id: string } }>('/api/v1/ai/chat/threads', {
        method: 'POST',
        body: '{}',
      });
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
  }, [request]);

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
  React.useEffect(() => {
    let cancelled = false;
    void request<{ threads: { id: string }[] }>('/api/v1/ai/chat/threads')
      .then(async ({ threads }) => {
        if (cancelled) return;
        if (!threads[0]) {
          await reset();
          return;
        }
        setThreadId(threads[0].id);
        await loadThread(threads[0].id);
      })
      .catch((error) =>
        setStatus(error instanceof Error ? error.message : 'Could not load the assistant.'),
      );
    return () => {
      cancelled = true;
    };
  }, [loadThread, request, reset]);
  const performSend = React.useCallback(async () => {
    const nextMessage = message.trim();
    const pendingAttachments = attachments;
    if ((!nextMessage && pendingAttachments.length === 0) || !threadId || busy) return;
    setMessages((current) => [
      ...current,
      {
        id: `local-${Date.now()}`,
        role: 'user',
        content: nextMessage,
        attachments: pendingAttachments.map(({ id, kind, name, size, uri }) => ({
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
    setBusy(true);
    setStatus('Thinking…');
    try {
      const events = await requestEvents<ChatEvent>(
        `/api/v1/ai/chat/threads/${encodeURIComponent(threadId)}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            message: nextMessage,
            attachments: pendingAttachments.map(({ kind, name, mimeType, dataBase64 }) => ({
              kind,
              name,
              mimeType,
              dataBase64,
            })),
          }),
        },
      );
      const responseText = events
        .filter((event) => event.type === 'text')
        .map((event) => event.delta ?? '')
        .join('');
      if (responseText)
        setMessages((current) => [
          ...current,
          { id: `assistant-${Date.now()}`, role: 'assistant', content: responseText },
        ]);
      const proposedActions = events.flatMap((event): ChatAction[] =>
        event.type === 'action' && event.actionId && event.kind
          ? [
              {
                id: event.actionId,
                kind: event.kind,
                preview: event.preview,
                status: 'proposed',
              },
            ]
          : [],
      );
      if (proposedActions.length) {
        setActions((current) => [
          ...current,
          ...proposedActions.filter(
            (candidate) => !current.some((action) => action.id === candidate.id),
          ),
        ]);
      }
      setStatus('');
    } catch (error) {
      setAttachments((current) => (current.length ? current : pendingAttachments));
      setStatus(error instanceof Error ? error.message : 'The assistant could not respond.');
    } finally {
      setBusy(false);
    }
  }, [attachments, busy, message, requestEvents, threadId]);
  const send = React.useCallback(() => {
    if (!assistantEnabled) {
      setStatus('Kitchen Assistant is turned off in Settings.');
      return;
    }
    if (!message.trim() && attachments.length === 0) return;
    void performSend();
  }, [assistantEnabled, attachments.length, message, performSend]);
  const decide = React.useCallback(
    async (actionId: string, decision: 'confirm' | 'cancel') => {
      if (!threadId || busy) return;
      setBusy(true);
      try {
        await request(`/api/v1/ai/actions/${encodeURIComponent(actionId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ decision, conflictResolutions: [] }),
        });
        await loadThread(threadId);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'The proposal could not be updated.');
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
                onPress={() => void reset()}
              />
              <IconButton
                label="Close Kitchen Assistant"
                icon="xmark"
                appearance="plain"
                onPress={closeAssistant}
              />
            </View>
          </View>

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
              onContentSizeChange={() => messagesRef.current?.scrollToEnd({ animated: !compact })}
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
                  {entry.content ? (
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
              {status ? (
                <Text
                  accessibilityRole="alert"
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
