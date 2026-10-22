'use client';
import {
  MEASUREMENT_UNIT_LABELS,
  MEASUREMENT_BASIS_LABELS,
} from '../../shared/kitchen-measurements';
import { useState } from 'react';
import Link from 'next/link';
import type { KitchenState, Equipment } from '@/lib/domain/kitchen';
import { equipmentTemplate } from '@/lib/domain/kitchen-catalog';
import { CookingPreferencesForm } from './cooking-preferences-form';
import type { CookingPreferences } from '@/lib/domain/cooking-preferences';
import type { AiDataPolicy } from '@/lib/domain/ai-assistant';
import styles from './my-kitchen.module.css';
const common = [
  'oven',
  'gas-hob',
  'induction-hob',
  'saucepan',
  'frying-pan',
  'air-fryer',
  'electric-pressure-cooker',
  'rice-cooker',
  'kettle',
];
export function KitchenSetupGuide({
  step,
  kitchen,
  draftOpen,
  busy,
  preferences,
  onStep,
  onChoose,
  onFinish,
}: {
  step: number;
  kitchen: KitchenState;
  draftOpen: boolean;
  busy: boolean;
  preferences?: { preferences: CookingPreferences; revision: string };
  onStep: (step: number) => void;
  onChoose: (type: string, existing?: Equipment) => void;
  onFinish: (confirm: boolean) => Promise<void>;
}) {
  const [preferencesDirty, setPreferencesDirty] = useState(false);
  const [shortcut, setShortcut] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [policy, setPolicy] = useState<AiDataPolicy | null>(null);
  const [share, setShare] = useState(false);
  const [sharingBusy, setSharingBusy] = useState(false);
  const [message, setMessage] = useState('');
  const owned = kitchen.items.filter((item) => item.availability !== 'archived');
  const possible = shortcut
    ? owned.filter(
        (item) =>
          item.typeKey === shortcut ||
          (['Cooking facilities', 'Countertop cooking'].includes(
            equipmentTemplate(shortcut)?.category ?? '',
          ) &&
            ['Cooking facilities', 'Countertop cooking'].includes(
              equipmentTemplate(item.typeKey)?.category ?? '',
            ) &&
            !item.parentId),
      )
    : [];
  async function loadPolicy() {
    setSharingBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/v1/ai/settings', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Could not read sharing controls.');
      setPolicy(body.dataPolicy);
      setShare(body.dataPolicy.shareKitchenEquipment);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not read sharing controls.');
    } finally {
      setSharingBusy(false);
    }
  }
  async function saveSharing() {
    if (!policy) return;
    setSharingBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/v1/ai/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataPolicy: { ...policy, shareKitchenEquipment: share } }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.message ??
            'Sharing changed elsewhere. Keep your choice and refresh its review.',
        );
      setPolicy(body.dataPolicy);
      setShare(body.dataPolicy.shareKitchenEquipment);
      setMessage(
        'Equipment sharing choice saved for your signed-in account. Other categories are unchanged.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save sharing.');
    } finally {
      setSharingBusy(false);
    }
  }
  return (
    <section className="settings-card" aria-label="Optional kitchen setup">
      <h2>
        Optional My Kitchen setup ·{' '}
        {['Shared kitchen', 'Equipment', 'Personal preferences', 'Review and sharing'][step]}
      </h2>
      <p>
        Step {step + 1} of 4. Saved items belong to this household kitchen and are reused by every
        member. Unsaved drafts are separate.
      </p>
      {step === 0 && (
        <>
          <p>
            {owned.length
              ? `Your household already has ${owned.length} recorded physical items. Review them; there is no need to add them again for your profile.`
              : 'Start with a few things you use often. Counts and variants matter; exact models and sizes can stay unknown.'}
          </p>
          <p>
            You can skip, return to an earlier step, or resume later. Skipping keeps acknowledged
            records and existing preferences.
          </p>
          <button className="primary-button" onClick={() => onStep(1)}>
            Start or resume equipment setup
          </button>
        </>
      )}
      {step === 1 && (
        <>
          <p>
            Add separate physical items, or review another function of an existing appliance.
            Shelves, spare inner pots and extra modes do not create another base.
          </p>
          {kitchen.canManage ? (
            <div className={styles.actions}>
              {common.map((key) => (
                <button
                  className="secondary-button"
                  key={key}
                  disabled={busy}
                  onClick={() => {
                    setShortcut(key);
                    if (!owned.length) {
                      onChoose(key);
                      setShortcut(null);
                    }
                  }}
                >
                  {equipmentTemplate(key)?.name}
                </button>
              ))}
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  setShortcut(null);
                  onChoose('custom');
                }}
              >
                Something else / Custom equipment
              </button>
            </div>
          ) : (
            <p>
              You can review the existing kitchen. A parent or administrator can save shared
              inventory changes.
            </p>
          )}
          {shortcut && (
            <section aria-label="Separate device or another function">
              <h3>{equipmentTemplate(shortcut)?.name}: where does this belong?</h3>
              <p>
                Review whether this is a separate item or another function of equipment already
                recorded.
              </p>
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => {
                  onChoose(shortcut);
                  setShortcut(null);
                }}
              >
                Add a separate physical item
              </button>
              {possible.map((item, index) => (
                <button
                  className="secondary-button"
                  key={item.id}
                  disabled={busy}
                  onClick={() => {
                    onChoose(shortcut, item);
                    setShortcut(null);
                  }}
                >
                  Review existing {item.name} · item {index + 1}
                </button>
              ))}
              <button className="secondary-button" onClick={() => setShortcut(null)}>
                Cancel choice
              </button>
            </section>
          )}
          <p>
            Save or discard an equipment draft before continuing. Optional shared preparation-space
            settings are below the inventory.
          </p>
        </>
      )}
      <div hidden={step !== 2}>
        {preferences ? (
          <CookingPreferencesForm initial={preferences} onDirtyChange={setPreferencesDirty} />
        ) : (
          <Link href="/account">Review your account’s cooking preferences</Link>
        )}
        <p>
          Allergies, dietary settings, Nutrition consent, portions and units keep their canonical
          owners. <Link href="/account">Open your profile settings</Link>.
        </p>
        {preferencesDirty && (
          <p>Personal preferences have unsaved edits. Save or discard them before continuing.</p>
        )}
      </div>
      {step === 3 && (
        <>
          <h3>Saved household facts</h3>
          <ul>
            {owned.map((item, index) => (
              <li key={item.id}>
                {item.name} · item {index + 1} ·{' '}
                {item.availability === 'unavailable' ? 'Unavailable until restored' : 'Available'} ·{' '}
                {item.measurements.length
                  ? item.measurements
                      .map(
                        (m) =>
                          `${m.value} ${MEASUREMENT_UNIT_LABELS[m.unit]} ${MEASUREMENT_BASIS_LABELS[m.basis]}${m.resourceIndex ? ` compartment ${m.resourceIndex}` : ''}`,
                      )
                      .join('; ')
                  : 'Size not recorded'}{' '}
                ·{' '}
                {item.capabilities
                  .map((capability) => capability.replaceAll('-', ' '))
                  .join(', ') || 'Capabilities not recorded'}
              </li>
            ))}
          </ul>
          <p>
            {owned.length} saved physical items;{' '}
            {owned.filter((item) => !item.measurements.length).length} with sizes not recorded.
            Modes stay attached to their physical base. Incomplete measurements remain unknown.
          </p>
          <h3>Assistant access · Your signed-in account</h3>
          <p>
            Equipment sharing is optional and independent of dietary, Pantry, shopping and diary
            sharing. When enabled it includes physical items, confirmed capabilities, sizes,
            availability and shared facilities. Account and household restrictions still cap AI
            access. This does not send interview answers or enable another sharing category.
          </p>
          {!policy ? (
            <button
              className="secondary-button"
              disabled={sharingBusy}
              onClick={() => void loadPolicy()}
            >
              Review my equipment sharing choice
            </button>
          ) : (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={share}
                  disabled={sharingBusy}
                  onChange={(event) => setShare(event.target.checked)}
                />{' '}
                Allow permitted household equipment facts to be used by AI for my account
              </label>
              <div className={styles.actions}>
                <button
                  className="primary-button"
                  disabled={sharingBusy}
                  onClick={() => void saveSharing()}
                >
                  Save equipment sharing choice
                </button>
                <button
                  className="secondary-button"
                  disabled={sharingBusy}
                  onClick={() => void loadPolicy()}
                >
                  Discard sharing edits and load current choice
                </button>
              </div>
              <p>Saved equipment sharing: {policy.shareKitchenEquipment ? 'On' : 'Off'}.</p>
            </>
          )}
          {policy && share !== policy.shareKitchenEquipment && (
            <p>
              Equipment sharing has unsaved edits. Save or discard this choice before finishing.
            </p>
          )}
          <p role="status">{message}</p>
          <Link href="/account/ai">All authorized AI sharing controls</Link>
          {kitchen.canManage && (
            <label>
              <input
                type="checkbox"
                checked={confirm}
                onChange={(event) => setConfirm(event.target.checked)}
              />{' '}
              I have recorded the household equipment I want to include. Confirm this inventory;
              sizes and compatibility may still be unknown.
            </label>
          )}
          <button
            className="primary-button"
            disabled={
              busy || sharingBusy || (policy !== null && share !== policy.shareKitchenEquipment)
            }
            onClick={() => void onFinish(confirm)}
          >
            Finish kitchen setup
          </button>
        </>
      )}
      <div className={styles.actions}>
        {step > 0 && (
          <button
            className="secondary-button"
            disabled={busy || sharingBusy}
            onClick={() => onStep(step - 1)}
          >
            Back
          </button>
        )}
        {step > 0 && step < 3 && (
          <button
            className="primary-button"
            disabled={
              busy || sharingBusy || (step === 1 && draftOpen) || (step === 2 && preferencesDirty)
            }
            onClick={() => onStep(step + 1)}
          >
            Continue setup
          </button>
        )}
        <Link href="/my-kitchen">Skip for now · keep saved records</Link>
      </div>
    </section>
  );
}
