'use client';
import { useRef, useState } from 'react';
import { SettingsMergeReview, settingsFieldLabel } from './settings-merge-review';
import type { AiRuntimeSettings, AiUserPreferences } from '@/lib/domain/ai-runtime-settings';
import { SettingsPane, SettingsField, SettingsActionBar } from './settings-primitives';
import {
  AI_MODEL_CATALOG,
  type AiWorkload,
  type AiReasoningEffort,
} from '@/lib/domain/ai-assistant';
type Workload = {
  workload: AiWorkload;
  model: string;
  reasoningEffort: AiReasoningEffort | null;
  enabled: boolean;
  version: number;
};
type Account = { id: string; name: string; role: string; enabled: boolean; version: number };
type Props = {
  global: AiRuntimeSettings;
  workloads: Workload[];
  version: number;
  accounts?: Account[];
  personal?: AiUserPreferences;
  enabled?: boolean;
};
type CurrentRuntime = {
  settings?: AiRuntimeSettings;
  global?: AiRuntimeSettings;
  workloads: Workload[];
  users?: Account[];
  version?: number;
  account?: { preferences: AiUserPreferences; version: number; enabled?: boolean };
};
function draftValues(
  settings: AiRuntimeSettings,
  workloads: Workload[],
  personal: AiUserPreferences | undefined,
  accounts: Account[],
) {
  return personal
    ? {
        personal: {
          ...personal,
          workloads: Object.fromEntries(
            personal.workloads.map(({ workload, model, reasoningEffort, enabled }) => [
              workload,
              { model, reasoningEffort, enabled },
            ]),
          ),
        },
        settings: undefined,
        workloads: undefined,
        accounts: undefined,
      }
    : {
        personal: undefined,
        settings,
        workloads: Object.fromEntries(
          workloads.map(({ workload, model, reasoningEffort, enabled }) => [
            workload,
            { model, reasoningEffort, enabled },
          ]),
        ),
        accounts: Object.fromEntries(accounts.map(({ id, enabled }) => [id, { enabled }])),
      };
}
type RuntimeDraft = ReturnType<typeof draftValues>;
export function AiRuntimeSettingsForm(props: Props) {
  const shared = !props.personal;
  const [settings, setSettings] = useState(props.global);
  const [workloads, setWorkloads] = useState(props.workloads);
  const [personal, setPersonal] = useState(props.personal);
  const [accounts, setAccounts] = useState(props.accounts ?? []);
  const [accountEnabled, setAccountEnabled] = useState(props.enabled);
  const [global, setGlobal] = useState(props.global);
  const [conflict, setConflict] = useState(false);
  const [current, setCurrent] = useState<CurrentRuntime | null>(null);
  const lock = useRef(false);
  const [version, setVersion] = useState(props.version);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const [saved, setSaved] = useState(
    JSON.stringify([props.global, props.workloads, props.personal, props.accounts ?? []]),
  );
  const [baseline, setBaseline] = useState(() =>
    draftValues(props.global, props.workloads, props.personal, props.accounts ?? []),
  );
  const dirty = JSON.stringify([settings, workloads, personal, accounts]) !== saved;
  const processing = shared ? settings : (personal?.processing ?? global);
  function changeProcessing(changes: Partial<AiRuntimeSettings>) {
    if (shared) setSettings((current) => ({ ...current, ...changes }));
    else
      setPersonal((current) => ({
        ...current!,
        processing: {
          executionMode: processing.executionMode,
          batchMinItems: processing.batchMinItems,
          ...changes,
        },
      }));
  }
  async function save() {
    if (lock.current || conflict) return;
    lock.current = true;
    setPending(true);
    setStatus('Saving…');
    try {
      const response = await fetch(`/api/v1/ai/settings${shared ? '?scope=global' : ''}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          shared
            ? {
                settings,
                workloads,
                version,
                users: accounts.map(({ id, enabled, version }) => ({ id, enabled, version })),
              }
            : { preferences: personal, version },
        ),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          setConflict(true);
          setCurrent(null);
        }
        throw new Error(body.error?.message ?? 'Could not save AI settings.');
      }
      if (shared) {
        setSettings(body.settings);
        setWorkloads(body.workloads);
        setAccounts(body.users);
        setVersion(body.version);
        setBaseline(draftValues(body.settings, body.workloads, undefined, body.users));
        setSaved(JSON.stringify([body.settings, body.workloads, personal, body.users]));
      } else {
        setPersonal(body.account.preferences);
        setVersion(body.account.version);
        setBaseline(draftValues(settings, workloads, body.account.preferences, accounts));
        setSaved(JSON.stringify([settings, workloads, body.account.preferences, accounts]));
      }
      setStatus('AI settings saved. New requests will use these choices.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save settings.');
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  async function loadCurrent() {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setCurrent(null);
    setStatus('Loading current settings…');
    try {
      const response = await fetch(`/api/v1/ai/settings${shared ? '?scope=global' : ''}`, {
        cache: 'no-store',
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message ?? 'Could not load current AI settings.');
      setCurrent(body);
      setStatus('Current saved settings loaded. Review before keeping or discarding your draft.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not load current settings.');
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  function currentDraft() {
    return current
      ? draftValues(
          current.settings ?? current.global!,
          current.workloads,
          shared ? undefined : current.account!.preferences,
          current.users ?? [],
        )
      : baseline;
  }
  function reconcile(reviewed: RuntimeDraft) {
    if (!current) return;
    const latest = currentDraft();
    setBaseline(latest);
    if (shared) {
      setVersion(current.version!);
      setSaved(
        JSON.stringify([current.settings, current.workloads, personal, current.users ?? []]),
      );
      setSettings(reviewed.settings!);
      setWorkloads(
        current.workloads.map((item) => ({ ...item, ...reviewed.workloads?.[item.workload] })),
      );
      setAccounts(
        (current.users ?? []).map((item) => ({ ...item, ...reviewed.accounts?.[item.id] })),
      );
    } else {
      setVersion(current.account!.version);
      setGlobal(current.global!);
      setAccountEnabled(current.account!.enabled ?? accountEnabled);
      setSettings(current.global!);
      setWorkloads(current.workloads);
      setSaved(
        JSON.stringify([current.global, current.workloads, current.account!.preferences, accounts]),
      );
      setPersonal(
        reviewed.personal
          ? {
              ...reviewed.personal,
              workloads: Object.entries(reviewed.personal.workloads).map(([workload, values]) => ({
                workload: workload as AiWorkload,
                ...values,
                version:
                  current.account!.preferences.workloads.find((item) => item.workload === workload)
                    ?.version ??
                  current.workloads.find((item) => item.workload === workload)?.version ??
                  1,
              })),
            }
          : undefined,
      );
    }
    setConflict(false);
    setCurrent(null);
    setStatus('Reviewed changes are ready. Save explicitly to apply them.');
  }
  return (
    <div
      id="ai-defaults"
      className="settings-stack"
      aria-busy={pending}
      onChange={() => setStatus('')}
    >
      <SettingsPane
        title={shared ? 'Global AI controls' : 'My AI defaults'}
        description={
          shared
            ? 'Shared defaults apply unless an account chooses an override. Disabling AI prevents new requests; already submitted batches can still finish.'
            : `AI access is ${accountEnabled && global.enabled ? 'enabled' : 'disabled by an administrator'}. Your choices apply to your signed-in account.`
        }
      >
        {shared && (
          <>
            <SettingsField
              title="Enable AI"
              description="Administrator control for this installation."
            >
              <input
                type="checkbox"
                role="switch"
                checked={settings.enabled}
                disabled={pending || conflict}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, enabled: event.target.checked }))
                }
              />
            </SettingsField>
            <SettingsField
              title="Allow personal model overrides"
              description="Personal and conversation choices cannot enable a disabled workload or exceed installation limits."
            >
              <input
                type="checkbox"
                role="switch"
                checked={settings.allowPersonalModelOverrides ?? true}
                disabled={pending || conflict}
                onChange={(event) =>
                  setSettings((value) => ({
                    ...value,
                    allowPersonalModelOverrides: event.target.checked,
                  }))
                }
              />
            </SettingsField>
            {(
              [
                ['maxOutputTokens', 'Maximum response tokens', 512, 16384],
                ['requestTimeoutSeconds', 'Request timeout (seconds)', 15, 300],
                ['toolRoundLimit', 'Maximum tool rounds per turn', 1, 12],
              ] as const
            ).map(([key, title, min, max]) => (
              <SettingsField
                key={key}
                title={title}
                description="Applies to new supported AI requests. Server policy remains authoritative."
              >
                <input
                  type="number"
                  min={min}
                  max={max}
                  value={settings[key]}
                  disabled={pending || conflict}
                  onChange={(event) =>
                    setSettings((value) => ({ ...value, [key]: Number(event.target.value) }))
                  }
                />
              </SettingsField>
            ))}
            <SettingsField
              title="Generated image quality"
              description="Applies to new supported image requests. Higher quality can increase generation cost and time."
            >
              <select
                value={settings.imageQuality}
                disabled={pending || conflict}
                onChange={(event) =>
                  setSettings((value) => ({
                    ...value,
                    imageQuality: event.target.value as AiRuntimeSettings['imageQuality'],
                  }))
                }
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </SettingsField>
            <SettingsField
              title="Generated image framing"
              description="The selected image is kept until a replacement succeeds and is accepted."
            >
              <select
                value={settings.imageSize}
                disabled={pending || conflict}
                onChange={(event) =>
                  setSettings((value) => ({
                    ...value,
                    imageSize: event.target.value as AiRuntimeSettings['imageSize'],
                  }))
                }
              >
                <option value="1024x1024">Square · 1024 × 1024</option>
                <option value="1536x1024">Landscape · 1536 × 1024</option>
                <option value="1024x1536">Portrait · 1024 × 1536</option>
              </select>
            </SettingsField>
            <SettingsField
              title="Allow personal image choices"
              description="Permits supported task controls to override image quality and framing. Paid-request consent and workload policy still apply."
            >
              <input
                type="checkbox"
                checked={settings.allowPersonalImageOverrides}
                disabled={pending || conflict}
                onChange={(event) =>
                  setSettings((value) => ({
                    ...value,
                    allowPersonalImageOverrides: event.target.checked,
                  }))
                }
              />
            </SettingsField>
            <SettingsField
              title="Generations per 10 minutes"
              description="Maximum immediate AI actions per account. Bulk imports use the background queue."
            >
              <input
                aria-label="Generations per 10 minutes"
                type="number"
                min={1}
                max={100}
                value={settings.generationsPerTenMinutes}
                disabled={pending || conflict}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    generationsPerTenMinutes: Number(event.target.value),
                  }))
                }
              />
            </SettingsField>
          </>
        )}
        {!shared && (
          <SettingsField title="Use global processing defaults">
            <input
              type="checkbox"
              checked={!personal?.processing}
              disabled={pending || conflict}
              onChange={(event) =>
                setPersonal((current) => ({
                  ...current!,
                  processing: event.target.checked
                    ? null
                    : {
                        executionMode: global.executionMode,
                        batchMinItems: global.batchMinItems,
                      },
                }))
              }
            />
          </SettingsField>
        )}
        <SettingsField
          title="Processing"
          description="Automatic uses Batch at the threshold below. Batch can take up to 24 hours and continues when you close the browser. Chat replies remain immediate."
        >
          <select
            aria-label="Processing"
            value={processing.executionMode}
            disabled={pending || conflict || (!shared && !personal?.processing)}
            onChange={(event) =>
              changeProcessing({
                executionMode: event.target.value as AiRuntimeSettings['executionMode'],
              })
            }
          >
            <option value="auto">Automatic</option>
            <option value="batch">Always Batch for queued recipes and images</option>
            <option value="direct">Direct background processing</option>
          </select>
        </SettingsField>
        <SettingsField
          title="Use Batch from this many items"
          description="Two recipes by default, including bulk imports and chat recipe sets."
        >
          <input
            aria-label="Batch item threshold"
            type="number"
            min={2}
            max={50}
            value={processing.batchMinItems}
            disabled={
              pending ||
              conflict ||
              processing.executionMode !== 'auto' ||
              (!shared && !personal?.processing)
            }
            onChange={(event) => changeProcessing({ batchMinItems: Number(event.target.value) })}
          />
        </SettingsField>
      </SettingsPane>
      {!shared && (
        <SettingsPane
          title="Personal instructions"
          description="Applies to your signed-in account. Style and planning preferences follow administrator policy, explicit constraints and the permissions for each request."
        >
          <SettingsField
            title="Response style and planning preferences"
            description="Optional. Keep sensitive details in their dedicated sharing controls; these instructions cannot grant access or change recorded allergies."
          >
            <textarea
              rows={4}
              maxLength={2000}
              disabled={pending || conflict}
              value={personal?.instructions ?? ''}
              onChange={(event) =>
                setPersonal((value) => ({ ...value!, instructions: event.target.value }))
              }
            />
          </SettingsField>
          <button
            type="button"
            className="text-button"
            disabled={pending || conflict || !personal?.instructions}
            onClick={() => setPersonal((value) => ({ ...value!, instructions: '' }))}
          >
            Reset instructions to default
          </button>
          <details>
            <summary>Preview instruction scope</summary>
            <p>
              {personal?.instructions?.trim() ||
                'No personal instructions. Use the task’s inherited behavior.'}
            </p>
            <p>
              Server authorization, administrator limits, required output formats and recorded
              constraints take precedence. Save my AI defaults to apply this draft.
            </p>
          </details>
        </SettingsPane>
      )}
      {!shared && global.allowPersonalModelOverrides === false && (
        <p role="note">
          Models are controlled by the administrator. Saved personal model choices remain retained
          but inactive.
        </p>
      )}
      <SettingsPane
        title="Models by task"
        description={
          shared
            ? 'Choose a model, effort, and availability for each task.'
            : 'Inherit shared choices or select your own model. A shared disabled task remains unavailable.'
        }
      >
        {workloads.map((base, index) => {
          const override =
            !shared && global.allowPersonalModelOverrides !== false
              ? personal?.workloads.find((item) => item.workload === base.workload)
              : undefined;
          const item = shared ? base : (override ?? base);
          const choices = AI_MODEL_CATALOG.filter((model) =>
            (model.workloads as readonly string[]).includes(item.workload),
          );
          const model = AI_MODEL_CATALOG.find((model) => model.id === item.model);
          function update(changes: Partial<Workload>) {
            if (shared)
              setWorkloads((current) =>
                current.map((row, position) => (position === index ? { ...row, ...changes } : row)),
              );
            else
              setPersonal((current) => ({
                ...current!,
                workloads: [
                  ...current!.workloads.filter((row) => row.workload !== item.workload),
                  { ...item, ...changes },
                ],
              }));
          }
          return (
            <details className="settings-disclosure" key={item.workload}>
              <summary>
                {item.workload.charAt(0).toUpperCase() +
                  item.workload.slice(1).replaceAll('_', ' ')}{' '}
                <small>
                  · {item.model} · {item.reasoningEffort ?? 'Model default'} ·{' '}
                  {shared ? 'Shared' : override ? 'Personal override' : 'Inherited'}
                  {!base.enabled ? ' · Unavailable globally' : ''}
                </small>
              </summary>
              {!shared && (
                <SettingsField title="Use global model">
                  <input
                    type="checkbox"
                    checked={!override}
                    disabled={pending || conflict || global.allowPersonalModelOverrides === false}
                    onChange={(event) =>
                      event.target.checked
                        ? setPersonal((current) => ({
                            ...current!,
                            workloads: current!.workloads.filter(
                              (row) => row.workload !== item.workload,
                            ),
                          }))
                        : update({})
                    }
                  />
                </SettingsField>
              )}
              <SettingsField title="Model">
                <select
                  aria-label={`${item.workload.charAt(0).toUpperCase() + item.workload.slice(1).replaceAll('_', ' ')} model`}
                  value={item.model}
                  disabled={
                    pending ||
                    conflict ||
                    (!shared && (!override || global.allowPersonalModelOverrides === false))
                  }
                  onChange={(event) =>
                    update({
                      model:
                        event.target.value === '__custom' ? 'custom-model' : event.target.value,
                      reasoningEffort: null,
                    })
                  }
                >
                  {!choices.some((model) => model.id === item.model) && (
                    <option value={item.model}>{item.model}</option>
                  )}
                  {choices.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                  <option value="__custom">Custom model ID</option>
                </select>
              </SettingsField>
              {!choices.some((model) => model.id === item.model) && (
                <SettingsField
                  title="Custom model ID"
                  description="Use a compatible model available to your configured OpenAI account."
                >
                  <input
                    value={item.model}
                    disabled={
                      pending ||
                      conflict ||
                      (!shared && (!override || global.allowPersonalModelOverrides === false))
                    }
                    onChange={(event) => update({ model: event.target.value })}
                  />
                </SettingsField>
              )}
              <SettingsField title="Reasoning effort">
                <select
                  value={item.reasoningEffort ?? ''}
                  disabled={
                    pending ||
                    conflict ||
                    (!shared && (!override || global.allowPersonalModelOverrides === false))
                  }
                  onChange={(event) =>
                    update({
                      reasoningEffort: (event.target.value || null) as AiReasoningEffort | null,
                    })
                  }
                >
                  <option value="">Model default</option>
                  {(model?.reasoning ?? ['low', 'medium', 'high']).map((effort) => (
                    <option key={effort} value={effort}>
                      {effort}
                    </option>
                  ))}
                </select>
              </SettingsField>
              <SettingsField title="Enable task">
                <input
                  type="checkbox"
                  role="switch"
                  checked={item.enabled}
                  disabled={
                    pending ||
                    conflict ||
                    (!shared && (!override || global.allowPersonalModelOverrides === false))
                  }
                  onChange={(event) => update({ enabled: event.target.checked })}
                />
              </SettingsField>
            </details>
          );
        })}
      </SettingsPane>
      {shared && (
        <SettingsPane
          title="Account access"
          description="These permissions belong to signed-in accounts. Household profile switching cannot grant AI access. Existing role permissions still control saving and changing household records."
        >
          {accounts.map((account) => (
            <SettingsField key={account.id} title={account.name} description={account.role}>
              <input
                aria-label={`AI access for ${account.name}`}
                type="checkbox"
                role="switch"
                checked={account.enabled}
                disabled={pending || conflict}
                onChange={(event) =>
                  setAccounts((current) =>
                    current.map((row) =>
                      row.id === account.id ? { ...row, enabled: event.target.checked } : row,
                    ),
                  )
                }
              />
            </SettingsField>
          ))}
        </SettingsPane>
      )}
      {conflict && (
        <section aria-label="Review changed settings">
          <p role="status">These settings changed elsewhere. Your edits are retained.</p>
          <button
            type="button"
            className="secondary-button"
            disabled={pending}
            onClick={() => void loadCurrent()}
          >
            {pending ? 'Loading current settings…' : 'Load current settings'}
          </button>
          {current && (
            <SettingsMergeReview
              key={JSON.stringify(current)}
              baseline={baseline}
              draft={draftValues(settings, workloads, personal, accounts)}
              current={currentDraft()}
              pending={pending}
              onResolve={reconcile}
              onDiscard={() => reconcile(currentDraft())}
              label={(path) =>
                path
                  .filter(
                    (part) => !['personal', 'settings', 'workloads', 'accounts'].includes(part),
                  )
                  .map(
                    (part) =>
                      [...(current.users ?? []), ...accounts].find((item) => item.id === part)
                        ?.name ??
                      (
                        {
                          instructions: 'Response style and planning preferences',
                          processing: 'Background processing',
                        } as Record<string, string>
                      )[part] ??
                      settingsFieldLabel([part]),
                  )
                  .join(' · ')
              }
            />
          )}
        </section>
      )}
      <SettingsActionBar
        status={status || (dirty ? 'Unsaved AI defaults' : 'No unsaved AI defaults')}
      >
        <button
          type="button"
          className="primary-button"
          disabled={pending || !dirty || conflict}
          onClick={() => void save()}
        >
          {pending && !conflict
            ? 'Saving…'
            : shared
              ? 'Save global AI settings'
              : 'Save my AI defaults'}
        </button>
      </SettingsActionBar>
    </div>
  );
}
