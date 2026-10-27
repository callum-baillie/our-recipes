'use client';
import { useRouter } from 'next/navigation';
import { KitchenSetupGuide } from './kitchen-setup-guide';
import { KitchenFacilitiesForm } from './kitchen-facilities-form';
import type { CookingPreferences } from '@/lib/domain/cooking-preferences';
import { KitchenMeasurementsEditor } from './kitchen-measurements-editor';
import { KitchenClaimsReview } from './kitchen-claims-review';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  equipmentInputSchema,
  equipmentDraftSchema,
  kitchenCommandSchema,
  type Equipment,
  type EquipmentInput,
  type KitchenCommand,
  type KitchenState,
} from '@/lib/domain/kitchen';
import { KITCHEN_CATALOG, equipmentTemplate } from '@/lib/domain/kitchen-catalog';
import { createClientUuid } from '@/lib/client/client-uuid';
import { SettingsPageHeader } from './settings-page-header';
import styles from './my-kitchen.module.css';

function describe(item: Equipment) {
  return [
    item.measurements.length
      ? item.measurements
          .map(
            (m) =>
              `${m.value} ${m.unit} (${m.basis.replaceAll('-', ' ')})${m.resourceIndex ? ` · compartment ${m.resourceIndex}` : ''}`,
          )
          .join(', ')
      : 'Size not recorded',
    item.induction === 'yes' ? 'Induction compatible' : null,
    item.capabilities.length
      ? item.capabilities.join(', ').replaceAll('-', ' ')
      : 'Capabilities not recorded',
    item.independentZones > 1 ? `${item.independentZones} confirmed independent zones` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
export function MyKitchen({
  initial,
  actorKey,
  sharing,
  guided = false,
  personalPreferences,
}: {
  initial: KitchenState;
  actorKey: string;
  sharing: boolean;
  guided?: boolean;
  personalPreferences?: { preferences: CookingPreferences; revision: string };
}) {
  const router = useRouter();
  const [kitchen, setKitchen] = useState(initial);
  const [setupStep, setSetupStep] = useState(0);
  const guideKey = `bord-kitchen-setup:${actorKey}:${initial.id}`;
  useEffect(() => {
    if (!guided) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const step = Number(localStorage.getItem(guideKey));
        if (Number.isInteger(step) && step >= 0 && step <= 3) setSetupStep(step);
      } catch {}
    });
    return () => {
      active = false;
    };
  }, [guided, guideKey]);
  function chooseStep(step: number) {
    setSetupStep(step);
    try {
      localStorage.setItem(guideKey, String(step));
    } catch {}
  }

  const [search, setSearch] = useState('');
  const [typeSearch, setTypeSearch] = useState('');
  const [draft, setDraft] = useState<EquipmentInput | null>(null);
  const [target, setTarget] = useState<Equipment | null>(null);
  const [count, setCount] = useState(1);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [baseRevision, setBaseRevision] = useState(initial.revision);
  const retry = useRef<{ fingerprint: string; command: KitchenCommand } | null>(null);
  const hydratedDraft = useRef(false);
  const storageKey = `bord-kitchen-draft:${actorKey}:${initial.id}`;
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      hydratedDraft.current = true;
      try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
        if (saved?.draft) {
          setDraft(equipmentDraftSchema.parse(saved.draft));
          if (saved.retry)
            retry.current = {
              fingerprint: String(saved.retry.fingerprint),
              command: kitchenCommandSchema.parse(saved.retry.command),
            };
          setCount(saved.count ?? 1);
          setTarget(saved.target ?? null);
          setBaseRevision(saved.baseRevision);
          setMessage('Unsaved draft restored. Review current equipment before saving.');
        }
      } catch {}
    });
    return () => {
      active = false;
    };
  }, [storageKey]);
  useEffect(() => {
    if (!hydratedDraft.current) return;
    if (draft)
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ draft, count, target, baseRevision, retry: retry.current }),
      );
    else sessionStorage.removeItem(storageKey);
  }, [draft, count, target, baseRevision, storageKey]);
  const change = (patch: Partial<EquipmentInput>) => {
    setErrors({});
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };
  function open(item?: Equipment, duplicate = false) {
    setTarget(duplicate ? null : (item ?? null));
    setBaseRevision(kitchen.revision);
    setDraft(
      item
        ? equipmentInputSchema.parse(itemInput(item))
        : equipmentInputSchema.parse({ typeKey: 'custom', name: 'Custom equipment' }),
    );
    setCount(1);
    setErrors({});
    setMessage('');
  }
  function chooseShortcut(type: string, existing?: Equipment) {
    const template = equipmentTemplate(type)!;
    if (existing) {
      open(existing);
      setDraft({
        ...itemInput(existing),
        capabilities: [...new Set([...existing.capabilities, ...template.capabilities])],
      });
      setMessage(
        `Unsaved proposal: review ${template.name} as a function of ${existing.name}. This keeps the same physical base. Review the confirmed capabilities before saving.`,
      );
    } else {
      open();
      setDraft(equipmentInputSchema.parse({ typeKey: type, name: template.name }));
    }
  }
  async function finishSetup(confirm: boolean) {
    if (confirm && kitchen.canManage) {
      const result = await send({
        kind: 'coverage',
        operationId: createClientUuid(),
        expectedRevision: kitchen.revision,
        coverage: 'confirmed',
      });
      if (!result) return;
    }
    chooseStep(3);
    router.push('/my-kitchen');
  }
  async function send(command: KitchenCommand) {
    setPending(true);
    setMessage('Saving…');
    try {
      const response = await fetch('/api/v1/kitchen', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-bord-expected-profile-id': kitchen.viewerProfileId,
        },
        body: JSON.stringify(command),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.error?.fields)
          setErrors(
            Object.fromEntries(
              Object.entries(result.error.fields).flatMap(([key, value]) => {
                const path = key.replace(/^item\./, '');
                return [
                  [path, String(value)],
                  [path.split('.')[0], String(value)],
                ];
              }),
            ),
          );
        throw new Error(result.error?.message ?? 'Unable to save equipment.');
      }
      setKitchen(result.kitchen);
      if (command.kind === 'add' || command.kind === 'update') {
        setDraft(null);
        setTarget(null);
        retry.current = null;
      }
      setMessage(
        result.replayed
          ? 'Recovered the saved change.'
          : `Saved ${
              result.receipt.itemIds
                .map((id: string) => result.kitchen.items.find((i: Equipment) => i.id === id)?.name)
                .filter(Boolean)
                .join(', ') || 'kitchen setup'
            }.`,
      );
      return result.kitchen as KitchenState;
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Unable to save. Your draft is retained.',
      );
      return null;
    } finally {
      setPending(false);
    }
  }
  function save() {
    const parsed = equipmentInputSchema.safeParse(draft);
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.flatMap((i) => [
            [i.path.join('.'), i.message],
            [i.path[0], i.message],
          ]),
        ),
      );
      setMessage('Check the marked fields.');
      return;
    }
    const details = target
      ? {
          kind: 'update' as const,
          itemId: target.id,
          expectedItemRevision: target.revision,
          item: parsed.data,
          expectedRevision: baseRevision,
        }
      : { kind: 'add' as const, count, item: parsed.data, expectedRevision: baseRevision };
    const fingerprint = JSON.stringify(details);
    const command =
      retry.current?.fingerprint === fingerprint
        ? retry.current.command
        : { ...details, operationId: createClientUuid() };
    retry.current = { fingerprint, command };
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({ draft, count, target, baseRevision, retry: retry.current }),
    );
    void send(command);
  }
  async function reload() {
    const r = await fetch('/api/v1/kitchen', { cache: 'no-store' });
    if (r.ok) {
      setKitchen((await r.json()).kitchen);
      setMessage(
        'Latest inventory loaded. Your draft and its reviewed revision were retained. Reopen the current item to reconcile changes.',
      );
    }
  }
  const visible = kitchen.items.filter(
    (i) =>
      i.availability !== 'archived' &&
      `${i.name} ${i.make} ${i.model} ${equipmentTemplate(i.typeKey)?.category}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <main className={`recipe-page settings-hub ${styles.workspace}`}>
      <SettingsPageHeader
        eyebrow="HOUSEHOLD"
        title="My Kitchen"
        description="Your appliances, cookware and cooking setup."
      />
      <div role="status" aria-live="polite">
        {message}
      </div>
      {guided ? (
        <KitchenSetupGuide
          step={setupStep}
          kitchen={kitchen}
          draftOpen={Boolean(draft)}
          busy={pending}
          preferences={personalPreferences}
          onStep={chooseStep}
          onChoose={chooseShortcut}
          onFinish={finishSetup}
        />
      ) : (
        <nav className={`kitchen-quick-views ${styles.navigation}`} aria-label="My Kitchen tools">
          <Link href="/my-kitchen/setup">Optional guided setup · skip and resume any time</Link>
          <Link href="/my-kitchen/plan">Check a complete meal against My Kitchen</Link>
        </nav>
      )}
      <div hidden={guided && setupStep !== 1}>
        <section className="settings-card">
          <h2>Shared with your household</h2>
          <p>
            {kitchen.coverage === 'not-started'
              ? 'Your kitchen has not been set up. Start with the equipment you use most.'
              : kitchen.coverage === 'partial'
                ? 'Partially recorded. Missing records are unknown; they do not mean you lack equipment.'
                : 'You confirmed this inventory. Sizes and compatibility can still be unknown.'}
          </p>
          <p>
            Each appliance is a physical item. Extra modes, shelves and attachments do not create
            another heating base.
          </p>
          {kitchen.canManage && (
            <div className={styles.actions}>
              <button className="primary-button" onClick={() => open()} disabled={pending}>
                Add equipment
              </button>
              <button
                className="secondary-button"
                disabled={pending}
                onClick={() =>
                  void send({
                    kind: 'coverage',
                    coverage: 'confirmed',
                    expectedRevision: kitchen.revision,
                    operationId: createClientUuid(),
                  })
                }
              >
                Confirm recorded inventory
              </button>
            </div>
          )}
          {!kitchen.canManage && (
            <p>You can view equipment. A parent or administrator can make shared changes.</p>
          )}
        </section>

        {draft && (
          <section className={`settings-card ${styles.editor}`} aria-labelledby="equipment-editor">
            <h2 id="equipment-editor">{target ? 'Edit equipment' : 'Add equipment'}</h2>
            <p>
              Unsaved household equipment draft. Sizes and model details are optional. Changes
              invalidate earlier plan reviews.
            </p>
            <label>
              Search equipment types
              <input
                value={typeSearch}
                onChange={(e) => setTypeSearch(e.target.value)}
                placeholder="Try skillet, hob, Instant Pot…"
              />
            </label>
            <label>
              Equipment type
              <select
                value={draft.typeKey}
                onChange={(e) => {
                  const t = equipmentTemplate(e.target.value)!;
                  change({
                    typeKey: t.key,
                    name: t.name,
                    capabilities: t.capabilities,
                    measurements: [],
                    independentZones: 1,
                    independentZonesConfirmed: false,
                    parentId: null,
                  });
                }}
              >
                {KITCHEN_CATALOG.filter(
                  (t) =>
                    t.key === draft.typeKey ||
                    t.key === 'custom' ||
                    `${t.name} ${t.aliases.join(' ')}`
                      .toLowerCase()
                      .includes(typeSearch.toLowerCase()),
                ).map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.category} · {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nickname
              <input
                value={draft.name}
                maxLength={120}
                onChange={(e) => change({ name: e.target.value })}
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name && <span role="alert">{errors.name}</span>}
            </label>
            {!target && (
              <label>
                Number of separate physical items
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
              </label>
            )}
            <div className={styles.fields}>
              <label>
                Make (optional)
                <input value={draft.make} onChange={(e) => change({ make: e.target.value })} />
              </label>
              <label>
                Model / variant (optional)
                <input value={draft.model} onChange={(e) => change({ model: e.target.value })} />
              </label>
            </div>
            <KitchenMeasurementsEditor
              key={`${target?.id ?? 'new'}:${draft.typeKey}`}
              values={draft.measurements}
              resourceCount={draft.independentZones}
              kind={equipmentTemplate(draft.typeKey)?.measurement ?? null}
              custom={draft.typeKey === 'custom'}
              errors={errors}
              onChange={(measurements) => change({ measurements })}
            />
            <details>
              <summary>Capabilities and cooking setup</summary>
              <fieldset>
                <legend>Confirmed capabilities</legend>
                {Array.from(
                  new Set([
                    ...KITCHEN_CATALOG.flatMap((t) => t.capabilities),
                    ...(draft.capabilities ?? []),
                  ]),
                )
                  .sort()
                  .map((capability) => (
                    <label key={capability}>
                      <input
                        type="checkbox"
                        checked={(
                          draft.capabilities ??
                          equipmentTemplate(draft.typeKey)?.capabilities ??
                          []
                        ).includes(capability)}
                        onChange={(e) =>
                          change({
                            capabilities: e.target.checked
                              ? [
                                  ...(draft.capabilities ??
                                    equipmentTemplate(draft.typeKey)?.capabilities ??
                                    []),
                                  capability,
                                ]
                              : (
                                  draft.capabilities ??
                                  equipmentTemplate(draft.typeKey)?.capabilities ??
                                  []
                                ).filter((c) => c !== capability),
                          })
                        }
                      />
                      {capability.replaceAll('-', ' ')}
                    </label>
                  ))}
              </fieldset>
              <p>
                Use only confirmed modes. A brand name alone does not confirm air frying or milk
                steaming.
              </p>
              {equipmentTemplate(draft.typeKey)?.supportsIndependentResources && (
                <>
                  <label>
                    Independent zones / burners / cavities
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={draft.independentZones}
                      onChange={(e) => change({ independentZones: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.independentZonesConfirmed}
                      onChange={(e) => change({ independentZonesConfirmed: e.target.checked })}
                    />{' '}
                    These zones can cook separately at the same time (shelves and spare pots do not
                    count).
                  </label>
                  {errors.independentZonesConfirmed && (
                    <p role="alert">{errors.independentZonesConfirmed}</p>
                  )}
                </>
              )}
              {equipmentTemplate(draft.typeKey)?.resource === 'accessory' && (
                <label>
                  Compatible parent appliance
                  <select
                    value={draft.parentId ?? ''}
                    onChange={(e) => change({ parentId: e.target.value || null })}
                  >
                    <option value="">Standalone tool</option>
                    {kitchen.items
                      .filter(
                        (i) => !i.parentId && i.availability === 'available' && i.id !== target?.id,
                      )
                      .map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <label>
                Induction compatibility
                <select
                  value={draft.induction}
                  onChange={(e) =>
                    change({ induction: e.target.value as EquipmentInput['induction'] })
                  }
                >
                  <option value="unknown">Not sure</option>
                  <option value="yes">Compatible</option>
                  <option value="no">Incompatible</option>
                </select>
              </label>
              {(['vessel', 'accessory'].includes(
                equipmentTemplate(draft.typeKey)?.resource ?? '',
              ) ||
                draft.typeKey === 'custom') && (
                <>
                  <label>
                    Oven compatibility
                    <select
                      value={draft.ovenSafe}
                      onChange={(event) =>
                        change({ ovenSafe: event.target.value as EquipmentInput['ovenSafe'] })
                      }
                    >
                      <option value="unknown">Not sure</option>
                      <option value="yes">Oven safe, confirmed</option>
                      <option value="no">Not oven safe</option>
                    </select>
                  </label>
                  {draft.ovenSafe === 'yes' && (
                    <label>
                      Confirmed oven temperature limit (°C, optional)
                      <input
                        type="number"
                        min={0}
                        max={600}
                        value={draft.ovenMaxC ?? ''}
                        onChange={(event) =>
                          change({
                            ovenMaxC: event.target.value ? Number(event.target.value) : null,
                          })
                        }
                      />
                    </label>
                  )}
                  <label>
                    Compatible lid available
                    <select
                      value={draft.lid}
                      onChange={(event) =>
                        change({ lid: event.target.value as EquipmentInput['lid'] })
                      }
                    >
                      <option value="unknown">Not sure</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </label>
                </>
              )}
              <label>
                Material (optional)
                <input
                  value={draft.material}
                  onChange={(e) => change({ material: e.target.value })}
                />
              </label>
            </details>
            <label>
              Availability
              <select
                value={draft.availability}
                onChange={(e) =>
                  change({ availability: e.target.value as EquipmentInput['availability'] })
                }
              >
                <option value="available">Available</option>
                <option value="unavailable">Unavailable until restored</option>
                {target && (
                  <option value="archived">Remove this specific item (keep history)</option>
                )}
              </select>
            </label>
            <p>
              Review: {count} {draft.name}
              {draft.parentId ? ' attachment(s); no additional heating base' : ''}.{' '}
              {target
                ? 'This updates one selected item.'
                : 'This adds separate equipment; existing items are retained.'}
            </p>
            <div className={styles.actions}>
              <button className="primary-button" onClick={save} disabled={pending}>
                Review and save {target ? 'change' : 'equipment'}
              </button>
              <button
                className="secondary-button"
                disabled={pending}
                onClick={() => {
                  setDraft(null);
                  setMessage('Draft discarded. Saved inventory unchanged.');
                }}
              >
                Discard draft
              </button>
              <button className="secondary-button" disabled={pending} onClick={() => void reload()}>
                Reload current inventory
              </button>
            </div>
          </section>
        )}
        <section className="settings-card">
          <h2>Appliances, cookware and facilities</h2>
          <label>
            Search your inventory
            <input value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          {!visible.length && (
            <p>
              No matching recorded equipment. You can still cook manually with an incomplete
              inventory.
            </p>
          )}
          {Array.from(
            new Set(visible.map((i) => equipmentTemplate(i.typeKey)?.category ?? 'Other')),
          ).map((category) => (
            <section key={category}>
              <h3>{category}</h3>
              <ul className={styles.list}>
                {visible
                  .filter((i) => (equipmentTemplate(i.typeKey)?.category ?? 'Other') === category)
                  .map((item, index) => (
                    <li key={item.id}>
                      <div>
                        <strong>{item.name}</strong>
                        {visible.filter((i) => i.name === item.name).length > 1 && (
                          <span> · Item {index + 1}</span>
                        )}
                        <p>{describe(item)}</p>
                        <p>
                          {item.availability === 'unavailable'
                            ? 'Unavailable until restored'
                            : 'Available'}
                          {item.parentId
                            ? ' · Attachment to ' +
                              kitchen.items.find((i) => i.id === item.parentId)?.name
                            : ''}
                        </p>
                      </div>
                      {kitchen.canManage && (
                        <div className={styles.actions}>
                          <button
                            className="secondary-button"
                            onClick={() => open(item)}
                            disabled={pending}
                          >
                            Edit {item.name}
                          </button>
                          <button
                            className="secondary-button"
                            onClick={() => open(item, true)}
                            disabled={pending}
                          >
                            Add another like this
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </section>
        <KitchenFacilitiesForm
          kitchen={kitchen}
          disabled={pending || Boolean(draft)}
          onSave={send}
        />
      </div>
      {!guided && (
        <>
          <KitchenClaimsReview
            items={kitchen.items}
            canManage={kitchen.canManage}
            viewerUserId={kitchen.viewerUserId}
            canRecoverAbandoned={kitchen.canRecoverAbandoned ?? false}
          />
          <section className="settings-card">
            <h2>How I cook</h2>
            <p>
              Cooking preferences belong to your signed-in account. Equipment is shared; a
              preference does not remove an appliance.
            </p>
            <Link href="/account">Your cooking preferences</Link>
          </section>
          <section className="settings-card">
            <h2>Assistant access</h2>
            <p>
              {sharing
                ? 'You allow equipment and facilities to be shared with AI.'
                : 'Equipment sharing is off for your account. Manual inventory remains available; the assistant sees it as withheld.'}
            </p>
            <Link href="/account/ai">Manage your AI sharing choices</Link>
          </section>
        </>
      )}
    </main>
  );
}
function itemInput(item: Equipment): EquipmentInput {
  const { id, revision, createdAt, updatedAt, actorProfileId, ...input } = item;
  void id;
  void revision;
  void createdAt;
  void updatedAt;
  void actorProfileId;
  return input;
}
