import * as React from 'react';
import { View } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { Body, Button, EditorialText, FormField, Surface } from '@/components/ui';
import { ChoiceField } from '@/components/choice-field';
import {
  readKitchenSetupStep,
  writeKitchenSetupStep,
  type KitchenDraftScope,
} from '@/data/kitchen-recovery';
import type { CookingPreferences } from '../../../src/lib/domain/cooking-preferences';
import type { AiDataPolicy } from '../../../shared/ai-data-policy';
type Preferences = { preferences: CookingPreferences; revision: string };
export function NativeKitchenSetupGuide({
  scope,
  items,
  draftOpen,
  disabled,
}: {
  scope: KitchenDraftScope;
  items: { id: string; name: string; availability: string }[];
  draftOpen: boolean;
  disabled: boolean;
}) {
  const { request } = useAuth();
  const [step, setStep] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [saved, setSaved] = React.useState<Preferences | null>(null);
  const [draft, setDraft] = React.useState<CookingPreferences | null>(null);
  const [policy, setPolicy] = React.useState<AiDataPolicy | null>(null);
  const [share, setShare] = React.useState(false);
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await work();
    } catch (error) {
      if (alive.current)
        setMessage(
          error instanceof Error
            ? error.message
            : 'Could not complete setup. Drafts remain unsaved.',
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function checkActor() {
    const context = await request<{ actor: { userId: string; profileId: string } }>(
      '/api/v1/auth/context',
    );
    if (
      !alive.current ||
      context.actor.userId !== scope.userId ||
      context.actor.profileId !== scope.profileId
    )
      throw new Error(
        'The account or profile changed. Return to the original account to continue setup.',
      );
  }
  async function move(next: number) {
    await writeKitchenSetupStep(scope, next);
    if (alive.current) setStep(next);
  }
  const preferencesDirty = Boolean(
    saved && draft && JSON.stringify(saved.preferences) !== JSON.stringify(draft),
  );
  const sharingDirty = Boolean(policy && policy.shareKitchenEquipment !== share);
  if (!open)
    return (
      <Surface>
        <Button
          label="Optional My Kitchen setup / resume"
          tone="secondary"
          disabled={busy || disabled}
          onPress={() =>
            void run(async () => {
              await checkActor();
              const next = await readKitchenSetupStep(scope);
              if (alive.current) {
                setStep(next);
                setOpen(true);
              }
            })
          }
        />
        {message ? <Body>{message}</Body> : null}
      </Surface>
    );
  return (
    <Surface>
      <EditorialText>Optional My Kitchen setup · Step {step + 1} of 4</EditorialText>
      <Body>
        Shared household equipment is reused by every member. Personal preferences and AI consent
        belong to your signed-in account.
      </Body>
      {step === 0 ? (
        <Body>
          Start with equipment you use often. Multiple identical items remain separate physical
          items. Exact sizes and models can stay unknown. Skip keeps all saved records.
        </Body>
      ) : null}
      {step === 1 ? (
        <Body>
          Use Add equipment below for a separate physical item, or Edit for another function of an
          existing appliance. A spare inner pot or lid belongs to its base. Save or discard the
          equipment draft before continuing.
        </Body>
      ) : null}
      {step === 2 ? (
        <View style={{ gap: 12 }}>
          <Body>
            How I cook · Your signed-in account. These preferences do not change allergies or
            household equipment.
          </Body>
          {!draft ? (
            <Button
              label="Load my cooking preferences"
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  await checkActor();
                  const value = await request<Preferences>('/api/v1/account/cooking-preferences');
                  if (alive.current) {
                    setSaved(value);
                    setDraft(value.preferences);
                  }
                })
              }
            />
          ) : (
            <>
              <FormField
                label="Preferred or avoided methods, with context"
                multiline
                value={draft.methodPreferences}
                onChangeText={(methodPreferences) => setDraft({ ...draft, methodPreferences })}
              />
              <FormField
                label="Comfortable simultaneous hands-on tasks"
                keyboardType="number-pad"
                value={String(draft.maxHandsOn)}
                onChangeText={(value) => setDraft({ ...draft, maxHandsOn: Number(value) })}
              />
              <ChoiceField
                label="Cooking confidence"
                value={draft.confidence}
                choices={['unspecified', 'learning', 'comfortable', 'experienced'].map((value) => ({
                  value,
                  label: value,
                }))}
                onChange={(value) =>
                  setDraft({ ...draft, confidence: value as CookingPreferences['confidence'] })
                }
              />
              <ChoiceField
                label="Instruction detail"
                value={draft.instructionDetail}
                choices={['brief', 'standard', 'detailed'].map((value) => ({
                  value,
                  label: value,
                }))}
                onChange={(value) =>
                  setDraft({
                    ...draft,
                    instructionDetail: value as CookingPreferences['instructionDetail'],
                  })
                }
              />
              <Button
                label="Save my cooking preferences"
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await checkActor();
                    const value = await request<Preferences>(
                      '/api/v1/account/cooking-preferences',
                      {
                        method: 'PATCH',
                        headers: { 'x-bord-expected-profile-id': scope.profileId },
                        body: JSON.stringify({
                          expectedRevision: saved!.revision,
                          preferences: draft,
                        }),
                      },
                    );
                    if (alive.current) {
                      setSaved(value);
                      setDraft(value.preferences);
                      setMessage('Your personal cooking preferences are saved.');
                    }
                  })
                }
              />
              <Button
                label="Discard personal preference edits"
                tone="secondary"
                disabled={busy}
                onPress={() => setDraft(saved!.preferences)}
              />
            </>
          )}
        </View>
      ) : null}
      {step === 3 ? (
        <View style={{ gap: 12 }}>
          <EditorialText>Review saved household facts</EditorialText>
          {items
            .filter((item) => item.availability !== 'archived')
            .map((item, index) => (
              <Body key={item.id}>
                {item.name} · Item {index + 1} · {item.availability}
              </Body>
            ))}
          <Body>
            Sizes and compatibility remain unknown unless explicitly recorded below. Equipment
            sharing is independent of Pantry, dietary and diary sharing. No choice is sent until you
            save it.
          </Body>
          {!policy ? (
            <Button
              label="Review my equipment sharing choice"
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  await checkActor();
                  const value = await request<{ dataPolicy: AiDataPolicy }>('/api/v1/ai/settings');
                  if (alive.current) {
                    setPolicy(value.dataPolicy);
                    setShare(value.dataPolicy.shareKitchenEquipment);
                  }
                })
              }
            />
          ) : (
            <>
              <ChoiceField
                label="Equipment facts may be used by AI for my signed-in account"
                value={share ? 'yes' : 'no'}
                choices={[
                  { value: 'no', label: 'Off' },
                  {
                    value: 'yes',
                    label: 'On: include permitted equipment, sizes, availability and facilities',
                  },
                ]}
                onChange={(value) => setShare(value === 'yes')}
                disabled={busy}
              />
              <Body>Saved equipment sharing: {policy.shareKitchenEquipment ? 'On' : 'Off'}</Body>
              <Button
                label="Save equipment sharing choice"
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await checkActor();
                    const value = await request<{ dataPolicy: AiDataPolicy }>(
                      '/api/v1/ai/settings',
                      {
                        method: 'PATCH',
                        headers: { 'x-bord-expected-profile-id': scope.profileId },
                        body: JSON.stringify({
                          dataPolicy: { ...policy, shareKitchenEquipment: share },
                        }),
                      },
                    );
                    if (alive.current) {
                      setPolicy(value.dataPolicy);
                      setShare(value.dataPolicy.shareKitchenEquipment);
                      setMessage('Equipment sharing choice saved for your account.');
                    }
                  })
                }
              />
              <Button
                label="Discard sharing edits"
                tone="secondary"
                disabled={busy}
                onPress={() => setShare(policy.shareKitchenEquipment)}
              />
            </>
          )}
        </View>
      ) : null}
      {message ? <Body>{message}</Body> : null}
      {preferencesDirty || sharingDirty || (step === 1 && draftOpen) ? (
        <Body>Unsaved changes: save or discard them before continuing.</Body>
      ) : null}
      {step > 0 ? (
        <Button
          label="Back"
          tone="secondary"
          disabled={busy || disabled}
          onPress={() => void run(() => move(step - 1))}
        />
      ) : null}
      {step < 3 ? (
        <Button
          label="Continue setup"
          disabled={
            busy || disabled || preferencesDirty || sharingDirty || (step === 1 && draftOpen)
          }
          onPress={() => void run(() => move(step + 1))}
        />
      ) : (
        <Button
          label="Finish kitchen setup"
          disabled={busy || disabled || preferencesDirty || sharingDirty || draftOpen}
          onPress={() =>
            void run(async () => {
              await move(0);
              if (alive.current) setOpen(false);
            })
          }
        />
      )}
      <Button
        label="Skip for now; keep saved records and resume later"
        tone="secondary"
        disabled={busy}
        onPress={() => setOpen(false)}
      />
    </Surface>
  );
}
