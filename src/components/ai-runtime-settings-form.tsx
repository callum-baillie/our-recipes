'use client';
import { useState } from 'react';
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
export function AiRuntimeSettingsForm(props: Props) {
  const shared = !props.personal;
  const [settings, setSettings] = useState(props.global);
  const [workloads, setWorkloads] = useState(props.workloads);
  const [personal, setPersonal] = useState(props.personal);
  const [accounts, setAccounts] = useState(props.accounts ?? []);
  const [version, setVersion] = useState(props.version);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const [saved, setSaved] = useState(
    JSON.stringify([props.global, props.workloads, props.personal, props.accounts ?? []]),
  );
  const dirty = JSON.stringify([settings, workloads, personal, accounts]) !== saved;
  const processing = shared ? settings : (personal?.processing ?? props.global);
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
      if (!response.ok) throw new Error(body.error?.message ?? 'Could not save AI settings.');
      if (shared) {
        setSettings(body.settings);
        setWorkloads(body.workloads);
        setAccounts(body.users);
        setVersion(body.version);
        setSaved(JSON.stringify([body.settings, body.workloads, personal, body.users]));
      } else {
        setPersonal(body.account.preferences);
        setVersion(body.account.version);
        setSaved(JSON.stringify([settings, workloads, body.account.preferences, accounts]));
      }
      setStatus('AI settings saved. New requests will use these choices.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save settings.');
    } finally {
      setPending(false);
    }
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
            : `AI access is ${props.enabled && props.global.enabled ? 'enabled' : 'disabled by an administrator'}. Your choices apply to your signed-in account.`
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
                disabled={pending}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, enabled: event.target.checked }))
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
                disabled={pending}
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
              disabled={pending}
              onChange={(event) =>
                setPersonal((current) => ({
                  ...current!,
                  processing: event.target.checked
                    ? null
                    : {
                        executionMode: props.global.executionMode,
                        batchMinItems: props.global.batchMinItems,
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
            disabled={pending || (!shared && !personal?.processing)}
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
              pending || processing.executionMode !== 'auto' || (!shared && !personal?.processing)
            }
            onChange={(event) => changeProcessing({ batchMinItems: Number(event.target.value) })}
          />
        </SettingsField>
      </SettingsPane>
      <SettingsPane
        title="Models by task"
        description={
          shared
            ? 'Choose a model, effort, and availability for each task.'
            : 'Inherit shared choices or select your own model. A shared disabled task remains unavailable.'
        }
      >
        {workloads.map((base, index) => {
          const override = personal?.workloads.find((item) => item.workload === base.workload);
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
                    disabled={pending}
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
                  disabled={pending || (!shared && !override)}
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
                    disabled={pending || (!shared && !override)}
                    onChange={(event) => update({ model: event.target.value })}
                  />
                </SettingsField>
              )}
              <SettingsField title="Reasoning effort">
                <select
                  value={item.reasoningEffort ?? ''}
                  disabled={pending || (!shared && !override)}
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
                  disabled={pending || (!shared && !override)}
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
                disabled={pending}
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
      <SettingsActionBar
        status={status || (dirty ? 'Unsaved AI defaults' : 'No unsaved AI defaults')}
      >
        <button
          type="button"
          className="primary-button"
          disabled={pending || !dirty}
          onClick={() => void save()}
        >
          {pending ? 'Saving…' : shared ? 'Save global AI settings' : 'Save my AI defaults'}
        </button>
      </SettingsActionBar>
    </div>
  );
}
