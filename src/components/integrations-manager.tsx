'use client';

import { ToastNotice } from './toast-provider';

import { ToastMessage } from './toast-message';
import {
  SettingsField,
  SettingsPane,
  SettingsRow,
  SettingsSubsection,
  SettingsItem,
  SettingsEmpty,
  SettingsActionBar,
} from './settings-primitives';
import { useEffect, useRef, useState } from 'react';
import { Plus, RefreshCw, Settings2, X, Unplug } from 'lucide-react';
import { syncIntervals, type IntegrationState } from '@/lib/domain/integration-settings';
import { ButtonSpinner } from '@/components/skeleton';
import styles from './integrations-manager.module.css';
type Reading = { userId: string; userLabel?: string; weightKilograms: number; measuredAt: string };
type Account = IntegrationState['accounts'][number];
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZoneName: undefined,
      }).format(new Date(value))
    : 'Not yet';
export function IntegrationsManager({ initial }: { initial: IntegrationState }) {
  const [state, setState] = useState(initial);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [activeAction, setActiveAction] = useState<{ action: string; id: string | null } | null>(
    null,
  );
  const [resultAccount, setResultAccount] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState('');
  const doing = (action: string, id: string | null = editingId) =>
    busy && activeAction?.action === action && activeAction.id === id;
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'connect' | 'settings'>('connect');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('VeSync');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState('US');
  const [interval, setIntervalValue] = useState(0);
  const [device, setDevice] = useState('');
  const [readings, setReadings] = useState<Reading[]>([]);
  const [scaleUser, setScaleUser] = useState('');
  const [profileId, setProfileId] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const editing = state.accounts.find((a) => a.id === editingId);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      void fetch('/api/v1/integrations', { cache: 'no-store', signal: controller.signal })
        .then(async (response) => {
          if (response.ok) {
            const next = (await response.json()) as IntegrationState;
            if (!controller.signal.aborted) {
              setState(next);
              setRefreshError('');
            }
          } else {
            throw new Error(
              'Connection information could not be refreshed. Last known information is shown.',
            );
          }
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setRefreshError(
              'Connection information could not be refreshed. Last known information is shown.',
            );
        });
    }, 60_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  async function request(body: Record<string, unknown>) {
    setActiveAction({
      action: String(body.action),
      id: typeof body.id === 'string' ? body.id : null,
    });
    setResultAccount(typeof body.id === 'string' ? body.id : editingId);
    const response = await fetch('/api/v1/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? 'Unable to update this integration.');
    return data;
  }
  async function reload() {
    try {
      const response = await fetch('/api/v1/integrations', { cache: 'no-store' });
      if (!response.ok) throw new Error('Unable to refresh connections.');
      const result = (await response.json()) as IntegrationState;
      setState(result);
      setRefreshError('');
      return result;
    } catch {
      setRefreshError(
        'Connection information could not be refreshed. The operation result below is unchanged.',
      );
      return state;
    }
  }
  async function run(task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await task();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to update this integration.');
    } finally {
      lock.current = false;
      setBusy(false);
      setActiveAction(null);
    }
  }
  function settings(account: Account) {
    setMode('settings');
    setEditingId(account.id);
    setLabel(account.label);
    setIntervalValue(account.syncIntervalMinutes);
    setDevice(account.devices.length === 1 ? account.devices[0]!.config : '');
    setReadings([]);
    setScaleUser('');
    setProfileId('');
    setConfirmRemove(false);
    setError('');
    setMessage('');
    setModalOpen(true);
    dialog.current?.showModal();
  }
  function connect() {
    setMode('connect');
    setEditingId(null);
    setLabel('VeSync');
    setEmail('');
    setPassword('');
    setCountry('US');
    setError('');
    setMessage('');
    setModalOpen(true);
    dialog.current?.showModal();
  }
  async function sync(account: Account) {
    await run(async () => {
      try {
        const result = await request({ action: 'sync', id: account.id });
        setMessage(
          `${account.label}: ${result.imported} new weigh-in${result.imported === 1 ? '' : 's'} imported.`,
        );
      } finally {
        await reload();
      }
    });
  }
  const occupied = new Set([...state.accounts.flatMap((a) => a.mappings.map((m) => m.profileId))]);
  return (
    <div className="settings-stack">
      {refreshError && (
        <ToastNotice tone="error">
          {refreshError}{' '}
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => void reload()}
          >
            Refresh connections
          </button>
        </ToastNotice>
      )}
      <SettingsPane
        title="Connections"
        description="Manage accounts, profile assignments, and sync schedules."
      >
        <SettingsRow
          title="VeSync"
          description="Connect an Etekcity ESF24 account to import weigh-ins and supported body metrics into Nutrition."
        >
          <button className="secondary-button" type="button" onClick={connect} disabled={busy}>
            <Plus size={17} />
            {state.accounts.length ? 'Add another account' : 'Connect VeSync'}
          </button>
        </SettingsRow>
        <SettingsSubsection
          title="Your connected accounts"
          description="Each account has its own profile assignments and sync schedule."
        >
          {!state.accounts.length ? (
            <SettingsEmpty>
              No connected accounts yet. Connect VeSync above to get started.
            </SettingsEmpty>
          ) : (
            state.accounts.map((account) => (
              <SettingsItem
                key={account.id}
                title={account.label}
                description={`VeSync · ${account.syncIntervalMinutes ? 'Automatic schedule' : 'Manual schedule'}`}
                actions={
                  <>
                    <button
                      className="text-button"
                      type="button"
                      disabled={busy || !account.mappings.length || account.syncing}
                      aria-busy={doing('sync', account.id)}
                      onClick={() => void sync(account)}
                    >
                      {doing('sync', account.id) ? <ButtonSpinner /> : <RefreshCw size={16} />}
                      {doing('sync', account.id) ? 'Syncing…' : 'Sync now'}
                    </button>
                    <button
                      className="text-button"
                      type="button"
                      disabled={busy}
                      onClick={() => settings(account)}
                    >
                      <Settings2 size={16} />
                      Settings
                    </button>
                  </>
                }
              >
                {account.syncing && <p role="status">Syncing measurements…</p>}
                <p>
                  {account.mappings.length
                    ? account.mappings.map((mapping) => mapping.profileName).join(' · ')
                    : 'No profiles assigned yet'}
                </p>
                <p>
                  {syncIntervals.find((interval) => interval.value === account.syncIntervalMinutes)
                    ?.label ?? 'Manual only'}{' '}
                  · Last successful sync: {date(account.lastSuccessAt)}
                </p>
                {account.lastAttemptAt && account.lastAttemptAt !== account.lastSuccessAt && (
                  <p>Last attempt: {date(account.lastAttemptAt)}</p>
                )}
                <details>
                  <summary>Connection timestamps</summary>
                  <p>Last success: {account.lastSuccessAt ?? 'None recorded'}</p>
                  <p>Last attempt: {account.lastAttemptAt ?? 'None recorded'}</p>
                </details>
                {account.nextSyncAt && <p>Next check: {date(account.nextSyncAt)}</p>}
                <small>Times shown in {Intl.DateTimeFormat().resolvedOptions().timeZone}.</small>
                {!modalOpen && resultAccount === account.id && message && (
                  <ToastMessage message={message} tone="info" />
                )}
                {!modalOpen && resultAccount === account.id && error && (
                  <ToastMessage message={error} tone="error" />
                )}
                {account.lastError && (
                  <ToastNotice tone="error">Needs attention: {account.lastError}</ToastNotice>
                )}
              </SettingsItem>
            ))
          )}
        </SettingsSubsection>
        {state.sharedMappings.length > 0 && (
          <SettingsSubsection
            title="Assigned through another account"
            description="These profiles receive measurements from an account managed by another user. Remove an assignment before connecting your own account."
          >
            {state.sharedMappings.map((mapping) => (
              <SettingsItem
                key={mapping.id}
                title={mapping.profileName}
                description="VeSync"
                actions={
                  <button
                    type="button"
                    disabled={busy}
                    className="text-button"
                    aria-busy={doing('unassign', mapping.id)}
                    onClick={() =>
                      void run(async () => {
                        await request({ action: 'unassign', id: mapping.id });
                        await reload();
                        setMessage('Assignment removed. Saved measurements are retained.');
                      })
                    }
                  >
                    {doing('unassign', mapping.id) ? <ButtonSpinner /> : null}
                    {doing('unassign', mapping.id) ? 'Removing…' : 'Remove assignment'}
                  </button>
                }
              />
            ))}
          </SettingsSubsection>
        )}
        <details className="settings-disclosure">
          <summary>How syncing works</summary>
          <p>
            Automatic checks require the Bòrd server to be running. Your scale first uploads through
            VeSync. A check may find no new readings. Reconnecting or removing assignments preserves
            saved measurements.
          </p>
        </details>
      </SettingsPane>
      {message &&
        !modalOpen &&
        (!resultAccount || !state.accounts.some((account) => account.id === resultAccount)) && (
          <ToastMessage message={message} tone="info" />
        )}
      {error &&
        !modalOpen &&
        (!resultAccount || !state.accounts.some((account) => account.id === resultAccount)) && (
          <ToastMessage message={error} tone="error" />
        )}
      <dialog
        ref={dialog}
        className={`settings-dialog ${styles.dialog}`}
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
        onClose={() => {
          setModalOpen(false);
          setPassword('');
          setError('');
        }}
        aria-labelledby="integration-dialog-title"
      >
        <div className={styles.dialogHeading}>
          <div>
            <p className={styles.eyebrow}>VeSync integration</p>
            <h2 id="integration-dialog-title">
              {mode === 'connect'
                ? 'Connect your account'
                : `${editing?.label ?? 'VeSync'} settings`}
            </h2>
          </div>
          <button
            type="button"
            className={styles.close}
            aria-label="Close integration settings"
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            <X size={20} />
          </button>
        </div>
        {mode === 'connect' ? (
          <form
            className="settings-fields"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                let result: { id: string };
                try {
                  result = await request({
                    action: 'connect',
                    label,
                    email,
                    password,
                    country,
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  });
                } finally {
                  setPassword('');
                }
                const next = await reload();
                const account = next.accounts.find((a) => a.id === result.id);
                if (account) settings(account);
                setMessage(
                  'Connected. Choose which VeSync profile belongs to each person, then set your sync schedule.',
                );
              });
            }}
          >
            <p>
              Use the same login as your VeSync app. Your password is used for sign-in and is not
              saved.
            </p>
            <SettingsField
              description="A label that helps you recognize this linked VeSync account."
              title="Connection name"
            >
              <input
                disabled={busy}
                required
                maxLength={80}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="For example, family scale"
              />
            </SettingsField>
            <SettingsField
              description="The email address you use to sign in to VeSync."
              title="VeSync email"
            >
              <input
                disabled={busy}
                required
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </SettingsField>
            <SettingsField
              description="Used to connect to VeSync; your password is not saved."
              title="VeSync password"
            >
              <input
                disabled={busy}
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </SettingsField>
            <SettingsField
              description="Choose the country registered to your VeSync account."
              title="Account country"
            >
              <select disabled={busy} value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="US">United States</option>
                <option value="CA">Canada</option>
                <option value="GB">United Kingdom</option>
                <option value="AU">Australia</option>
                <option value="DE">Germany</option>
                <option value="FR">France</option>
              </select>
            </SettingsField>
            <SettingsActionBar>
              <button className={styles.primary} disabled={busy} aria-busy={doing('connect', null)}>
                {doing('connect', null) ? <ButtonSpinner /> : null}
                {doing('connect') ? 'Connecting…' : 'Sign in to VeSync'}
              </button>
            </SettingsActionBar>
          </form>
        ) : editing ? (
          <div className={styles.stack}>
            <form
              className="settings-fields"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await request({
                    action: 'settings',
                    id: editing.id,
                    label,
                    syncIntervalMinutes: interval,
                  });
                  await reload();
                  setMessage('Integration settings saved.');
                });
              }}
            >
              <SettingsField
                description="A label that helps you recognize this linked VeSync account."
                title="Connection name"
              >
                <input
                  disabled={busy}
                  required
                  maxLength={80}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </SettingsField>
              <SettingsField
                title="How often should Bòrd check for measurements?"
                description={
                  <>
                    <small>
                      Only new weigh-ins are added. Your existing history and calorie targets are
                      preserved.
                    </small>
                  </>
                }
              >
                <select
                  disabled={busy}
                  value={interval}
                  onChange={(e) => setIntervalValue(Number(e.target.value))}
                >
                  {syncIntervals.map((i) => (
                    <option key={i.value} value={i.value}>
                      {i.label}
                    </option>
                  ))}
                </select>
              </SettingsField>
              <SettingsActionBar>
                <button className={styles.primary} disabled={busy} aria-busy={doing('settings')}>
                  {doing('settings') ? <ButtonSpinner /> : null}
                  {doing('settings') ? 'Saving settings…' : 'Save settings'}
                </button>
              </SettingsActionBar>
            </form>
            <SettingsSubsection
              title="Profile assignments"
              description={
                <>
                  {state.canAssignHousehold
                    ? 'Match each VeSync profile to the right person in your household.'
                    : 'Match your VeSync profile to your own Bòrd profile.'}{' '}
                  A person can have one scale connection at a time.
                </>
              }
            >
              {editing.mappings.map((mapping) => (
                <div className={styles.assignment} key={mapping.id}>
                  <div>
                    <strong>{mapping.profileName}</strong>
                    <small>
                      VeSync profile {mapping.scaleUserId === '0' ? 'Primary' : mapping.scaleUserId}
                    </small>
                  </div>
                  <button
                    className={styles.textButton}
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await request({ action: 'unassign', id: mapping.id });
                        await reload();
                        setMessage('Assignment removed. Saved measurements are retained.');
                      })
                    }
                  >
                    Remove assignment
                  </button>
                </div>
              ))}
              <div className="settings-fields">
                <SettingsField
                  description="Select which scale provides measurements for this connection."
                  title="Scale"
                >
                  <select
                    disabled={busy}
                    value={device}
                    onChange={(e) => {
                      setDevice(e.target.value);
                      setReadings([]);
                      setScaleUser('');
                    }}
                  >
                    <option value="">Choose a scale</option>
                    {editing.devices.map((d) => (
                      <option key={d.config} value={d.config}>
                        {d.name} ({d.model})
                      </option>
                    ))}
                  </select>
                </SettingsField>
                <button
                  className={styles.secondary}
                  disabled={busy || !device}
                  aria-busy={doing('preview')}
                  onClick={() =>
                    void run(async () => {
                      const result = await request({
                        action: 'preview',
                        id: editing.id,
                        config: device,
                      });
                      setReadings(result.readings);
                      setScaleUser('');
                      if (!result.readings.length)
                        setMessage(
                          'No measurements found. Sync the scale in VeSync and try again.',
                        );
                    })
                  }
                >
                  {doing('preview') ? <ButtonSpinner /> : null}
                  {doing('preview') ? 'Finding profiles…' : 'Find VeSync profiles'}
                </button>
                {readings.length ? (
                  <>
                    <SettingsField
                      description="Choose the person whose measurements should be imported."
                      title="VeSync profile"
                    >
                      <select
                        disabled={busy}
                        value={scaleUser}
                        onChange={(e) => setScaleUser(e.target.value)}
                      >
                        <option value="">Choose a VeSync profile</option>
                        {readings.map((r) => (
                          <option key={r.userId} value={r.userId}>
                            {r.userLabel ??
                              (r.userId === '0' ? 'Primary profile' : `Profile ${r.userId}`)}{' '}
                            · {(r.weightKilograms * 2.2046226218).toFixed(1)} lb /{' '}
                            {r.weightKilograms} kg · {new Date(r.measuredAt).toLocaleDateString()}
                          </option>
                        ))}
                      </select>
                    </SettingsField>
                    <SettingsField
                      title="Bòrd profile"
                      description={
                        <>
                          <small>
                            Weight tracking must be enabled in Nutrition before measurements can
                            sync.
                          </small>
                        </>
                      }
                    >
                      <select
                        disabled={busy}
                        value={profileId}
                        onChange={(e) => setProfileId(e.target.value)}
                      >
                        <option value="">Choose a person</option>
                        {state.profiles.map((p) => (
                          <option key={p.id} value={p.id} disabled={occupied.has(p.id)}>
                            {p.name}
                            {occupied.has(p.id) ? ' · already assigned' : ''}
                            {!p.weightTrackingEnabled ? ' · weight tracking paused' : ''}
                          </option>
                        ))}
                      </select>
                    </SettingsField>
                    <button
                      className={styles.secondary}
                      disabled={busy || !profileId || !scaleUser}
                      aria-busy={doing('assign')}
                      onClick={() =>
                        void run(async () => {
                          await request({
                            action: 'assign',
                            id: editing.id,
                            config: device,
                            scaleUserId: scaleUser,
                            profileId,
                          });
                          await reload();
                          setProfileId('');
                          setScaleUser('');
                          setMessage('Profile assigned. Use Sync now to import measurements.');
                        })
                      }
                    >
                      {doing('assign') ? <ButtonSpinner /> : null}
                      {doing('assign') ? 'Assigning…' : 'Assign profile'}
                    </button>
                  </>
                ) : null}
              </div>
            </SettingsSubsection>
            <SettingsRow
              title="Sync measurements"
              description="Import the latest weigh-ins for the profiles assigned above."
            >
              <button
                className={styles.secondary}
                disabled={busy || !editing.mappings.length}
                aria-busy={doing('sync')}
                onClick={() => void sync(editing)}
              >
                {doing('sync') ? <ButtonSpinner /> : <RefreshCw size={16} />}
                {doing('sync') ? 'Syncing…' : 'Sync now'}
              </button>
            </SettingsRow>
            <SettingsRow
              title="Remove connection"
              description="Stop automatic sync and remove all assignments for this connection. Saved measurements stay in Nutrition."
            >
              {confirmRemove ? (
                <div className={styles.actions}>
                  <button
                    className={styles.danger}
                    disabled={busy}
                    aria-busy={doing('remove')}
                    onClick={() =>
                      void run(async () => {
                        await request({ action: 'remove', id: editing.id });
                        await reload();
                        dialog.current?.close();
                        setMessage('Connection removed. Saved measurements are retained.');
                      })
                    }
                  >
                    {doing('remove') ? <ButtonSpinner /> : null}
                    {doing('remove') ? 'Removing…' : `Remove ${editing.label}`}
                  </button>
                  <button
                    className={styles.secondary}
                    disabled={busy}
                    onClick={() => setConfirmRemove(false)}
                  >
                    Keep connection
                  </button>
                </div>
              ) : (
                <button
                  className={styles.textButton}
                  disabled={busy}
                  onClick={() => setConfirmRemove(true)}
                >
                  <Unplug size={16} /> Remove connection
                </button>
              )}
            </SettingsRow>
          </div>
        ) : null}
        {message ? <ToastMessage message={message} tone="info" /> : null}
        {error ? <ToastMessage message={error} tone="error" /> : null}
      </dialog>
    </div>
  );
}
