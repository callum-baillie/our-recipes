import * as React from 'react';
import { Alert, View } from 'react-native';
import { Image } from 'expo-image';
import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';
import { useAuth } from '@/auth/auth-context';
import { Body, Button, EditorialText, Surface } from '@/components/ui';

type Candidate = {
  id: string;
  status: 'requested' | 'ready' | 'accepted' | 'failed' | 'discarded';
  sourceRevision: number;
  altText: string;
  model: string;
  quality: string;
  size: string;
};
function scopedKey(instance: string, userId: string, recipeId: string) {
  let hash = 2166136261;
  for (const character of `${instance}:${userId}:${recipeId}`)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `bord.image-review.${(hash >>> 0).toString(16)}`;
}
/** Keep the exact paid command identity across interruption; checking it is always a read. */
export function RecipeImageReview({
  recipeId,
  revision,
  onAccepted,
}: {
  recipeId: string;
  revision: number;
  onAccepted: () => Promise<void>;
}) {
  const { request, assetSource, instanceUrl, user } = useAuth();
  const key = scopedKey(instanceUrl ?? '', user?.id ?? '', recipeId);
  const [candidate, setCandidate] = React.useState<Candidate | null>(null);
  const [operation, setOperation] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<
    'preparing' | 'checking' | 'accepting' | 'discarding' | null
  >(null);
  const [error, setError] = React.useState('');
  const [loaded, setLoaded] = React.useState(false);
  const lock = React.useRef(false);
  const abort = React.useRef<AbortController | null>(null);
  const path = (id: string) => `/api/v1/recipes/${recipeId}/image-candidates/${id}`;
  React.useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(key)
      .then((id) => {
        if (active) {
          setOperation(id);
          setCandidate(null);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active) setError('The previous image request could not be loaded.');
      });
    return () => {
      active = false;
      abort.current?.abort();
    };
  }, [key]);
  async function run(
    action: 'preparing' | 'checking' | 'accepting' | 'discarding',
    work: () => Promise<void>,
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(action);
    setError('');
    try {
      await work();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The image request could not finish. Check its saved outcome before another request.',
      );
    } finally {
      lock.current = false;
      setBusy(null);
      abort.current = null;
    }
  }
  async function forget() {
    await SecureStore.deleteItemAsync(key);
    setOperation(null);
  }
  function prepare() {
    Alert.alert(
      'Prepare a paid recipe photo?',
      'This sends the saved recipe to OpenAI using the administrator’s model, quality and framing. Review the result before adding it; existing photos stay saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm paid preview',
          onPress: () =>
            void run('preparing', async () => {
              const id = randomUUID();
              await SecureStore.setItemAsync(key, id);
              setOperation(id);
              setCandidate(null);
              const controller = new AbortController();
              abort.current = controller;
              let result: { candidate: Candidate };
              try {
                result = await request<{ candidate: Candidate }>(
                  `/api/v1/recipes/${recipeId}/images/generate`,
                  {
                    method: 'POST',
                    signal: controller.signal,
                    body: JSON.stringify({
                      confirm: true,
                      preview: true,
                      operationId: id,
                      expectedRevision: revision,
                    }),
                  },
                );
              } catch (reason) {
                // These explicit preflight rejections occur before a candidate/provider
                // request is created. Transport/5xx/changed-command failures stay retained.
                const failure = reason as { status?: number; code?: string };
                if (
                  [400, 403, 404, 409, 422, 429].includes(failure.status ?? 0) &&
                  failure.code !== 'image_request_changed'
                )
                  await forget();
                throw reason;
              }
              setCandidate(result.candidate);
            }),
        },
      ],
    );
  }
  const stale = candidate?.sourceRevision !== undefined && candidate.sourceRevision !== revision;
  return (
    <Surface style={{ gap: 12 }}>
      <EditorialText>Generate a recipe photo</EditorialText>
      <Body muted>
        Prepare a private preview using the saved recipe. Adding the reviewed photo is a separate
        action.
      </Body>
      {!loaded && error && (
        <Button
          label="Load saved image request again"
          tone="secondary"
          onPress={() => {
            void SecureStore.getItemAsync(key)
              .then((id) => {
                setOperation(id);
                setLoaded(true);
                setError('');
              })
              .catch(() =>
                setError(
                  'The saved request is still unavailable. Keep this screen open and try again.',
                ),
              );
          }}
        />
      )}
      {!operation && (
        <Button
          label="Prepare photo with OpenAI"
          tone="secondary"
          disabled={!loaded || busy !== null}
          onPress={prepare}
        />
      )}
      {operation && (
        <>
          <Body>
            {busy === 'preparing'
              ? 'Preparing the paid preview…'
              : candidate?.status === 'ready'
                ? `Preview ready · ${candidate.model} · ${candidate.quality} · ${candidate.size}`
                : candidate?.status === 'accepted'
                  ? 'Reviewed photo added.'
                  : candidate?.status === 'discarded'
                    ? 'Preview discarded.'
                    : 'A paid request was started. Check its outcome before starting another.'}
          </Body>
          <Button
            label={busy === 'checking' ? 'Checking request…' : 'Check this request'}
            tone="secondary"
            disabled={busy !== null}
            onPress={() =>
              void run('checking', async () => {
                const result = await request<{ candidate: Candidate }>(path(operation));
                setCandidate(result.candidate);
                if (result.candidate.status === 'accepted') {
                  await onAccepted();
                  await forget();
                }
              })
            }
          />
          {candidate?.status === 'ready' && (
            <>
              <Image
                source={assetSource(`${path(operation)}/file`)}
                accessibilityLabel={candidate.altText || 'Generated recipe photo preview'}
                style={{ width: '100%', aspectRatio: 1, borderRadius: 12 }}
                contentFit="contain"
              />
              {stale && (
                <Body>
                  The recipe changed after this preview. Discard it and prepare a new reviewed
                  request.
                </Body>
              )}
              <Button
                label={busy === 'accepting' ? 'Adding reviewed photo…' : 'Add reviewed photo'}
                disabled={busy !== null || stale}
                onPress={() =>
                  void run('accepting', async () => {
                    const result = await request<{ candidate: Candidate }>(path(operation), {
                      method: 'POST',
                      body: JSON.stringify({ action: 'accept' }),
                    });
                    setCandidate(result.candidate);
                    await onAccepted();
                    await forget();
                  })
                }
              />
            </>
          )}
          <Button
            label={busy === 'discarding' ? 'Discarding preview…' : 'Discard this preview'}
            tone="secondary"
            disabled={busy !== null}
            onPress={() =>
              void run('discarding', async () => {
                const result = await request<{ candidate: Candidate }>(path(operation), {
                  method: 'DELETE',
                });
                setCandidate(result.candidate);
                await forget();
              })
            }
          />
        </>
      )}
      {busy === 'preparing' && (
        <Button
          label="Stop waiting"
          tone="secondary"
          onPress={() => {
            abort.current?.abort();
            setError(
              'Stopped waiting. Provider work or billing may still finish. Check this request to reconcile it.',
            );
          }}
        />
      )}
      {error ? (
        <View accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Body>{error}</Body>
        </View>
      ) : null}
    </Surface>
  );
}
