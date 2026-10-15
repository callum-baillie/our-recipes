'use client';
import { useEffect, useRef, useState } from 'react';
import { Plug, Plus, RefreshCw, Settings2, X, Scale, Unplug } from 'lucide-react';
import { syncIntervals, type IntegrationState } from '@/lib/domain/integration-settings';
import styles from './integrations-manager.module.css';
type Reading = { userId: string; userLabel?: string; weightKilograms: number; measuredAt: string };
type Account = IntegrationState['accounts'][number];
const date = (value: string | null) => (value ? new Date(value).toLocaleString() : 'Not yet');
export function IntegrationsManager({ initial }: { initial: IntegrationState }) {
  const [state, setState] = useState(initial);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
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
            if (!controller.signal.aborted) setState(next);
          }
        })
        .catch(() => undefined);
    }, 60_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  async function request(body: Record<string, unknown>) {
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
    const response = await fetch('/api/v1/integrations', { cache: 'no-store' });
    if (!response.ok) throw new Error('Unable to refresh connections. Reload this page.');
    const result = (await response.json()) as IntegrationState;
    setState(result);
    return result;
  }
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await task();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to update this integration.');
    } finally {
      setBusy(false);
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
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <div>
          <h2>Connected accounts</h2>
          <p>Each account has its own profile assignments and sync schedule.</p>
        </div>
        <button className={styles.primary} onClick={connect} disabled={busy}>
          <Plus size={17} /> Add integration
        </button>
      </div>
      {!state.accounts.length ? (
        <div className={styles.empty}>
          <Plug size={30} />
          <h3>Connect your first app</h3>
          <p>
            Start with VeSync to bring your Etekcity ESF24 weigh-ins and body composition into
            Nutrition.
          </p>
          <button className={styles.primary} onClick={connect}>
            Connect VeSync
          </button>
        </div>
      ) : null}
      <div className={styles.cards}>
        {state.accounts.map((account) => (
          <article key={account.id} className={styles.card}>
            <div className={styles.cardHeading}>
              <span className={styles.icon}>
                <Scale size={24} />
              </span>
              <div>
                <p className={styles.eyebrow}>VeSync · Etekcity ESF24</p>
                <h3>{account.label}</h3>
              </div>
              <span className={styles.badge}>
                {account.lastError
                  ? 'Needs attention'
                  : account.syncing
                    ? 'Syncing'
                    : account.syncIntervalMinutes
                      ? 'Auto sync on'
                      : 'Manual sync'}
              </span>
            </div>
            <p>
              {account.mappings.length
                ? account.mappings.map((m) => m.profileName).join(' · ')
                : 'No profiles assigned yet'}
            </p>
            <dl className={styles.facts}>
              <div>
                <dt>Schedule</dt>
                <dd>
                  {syncIntervals.find((i) => i.value === account.syncIntervalMinutes)?.label ??
                    'Manual only'}
                </dd>
              </div>
              <div>
                <dt>Last successful sync</dt>
                <dd>{date(account.lastSuccessAt)}</dd>
              </div>
              {account.nextSyncAt ? (
                <div>
                  <dt>Next check</dt>
                  <dd>{date(account.nextSyncAt)}</dd>
                </div>
              ) : null}
            </dl>
            {account.lastError ? <p className={styles.error}>{account.lastError}</p> : null}
            <div className={styles.actions}>
              <button
                className={styles.secondary}
                disabled={busy || !account.mappings.length || account.syncing}
                onClick={() => void sync(account)}
              >
                <RefreshCw size={16} /> Sync now
              </button>
              <button
                className={styles.secondary}
                disabled={busy}
                onClick={() => settings(account)}
              >
                <Settings2 size={16} /> Settings
              </button>
            </div>
          </article>
        ))}
      </div>
      {state.sharedMappings.length ? (
        <section className={styles.card}>
          <h3>Assigned through another account</h3>
          <p>
            These profiles receive measurements from an account managed by another user. You can
            remove the assignment before connecting your own account.
          </p>
          {state.sharedMappings.map((mapping) => (
            <div className={styles.assignment} key={mapping.id}>
              <strong>{mapping.profileName} · VeSync</strong>
              <button
                disabled={busy}
                className={styles.textButton}
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
        </section>
      ) : null}
      {message && !modalOpen ? (
        <p role="status" className={styles.notice}>
          {message}
        </p>
      ) : null}
      {error && !modalOpen ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <section className={styles.available}>
        <h2>Available integrations</h2>
        <div>
          <Scale size={24} />
          <div>
            <h3>VeSync</h3>
            <p>Etekcity ESF24 · Weight, imported body fat, and calculated body composition.</p>
          </div>
          <button className={styles.secondary} disabled={busy} onClick={connect}>
            {state.accounts.length ? 'Add another account' : 'Connect'}
          </button>
        </div>
      </section>
      <p className={styles.hint}>
        Automatic sync runs while the Bòrd server is running. Your scale must first upload
        measurements through the VeSync app. Sessions can expire; if that happens, remove and
        reconnect the account. Saved measurements are retained.
      </p>
      <dialog
        ref={dialog}
        className={styles.dialog}
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
            className={styles.stack}
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
            <label className={styles.field}>
              Connection name
              <input
                disabled={busy}
                required
                maxLength={80}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="For example, family scale"
              />
            </label>
            <label className={styles.field}>
              VeSync email
              <input
                disabled={busy}
                required
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              VeSync password
              <input
                disabled={busy}
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              Account country
              <select disabled={busy} value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="US">United States</option>
                <option value="CA">Canada</option>
                <option value="GB">United Kingdom</option>
                <option value="AU">Australia</option>
                <option value="DE">Germany</option>
                <option value="FR">France</option>
              </select>
            </label>
            <button className={styles.primary} disabled={busy}>
              {busy ? 'Connecting…' : 'Sign in to VeSync'}
            </button>
          </form>
        ) : editing ? (
          <div className={styles.stack}>
            <form
              className={styles.stack}
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
              <label className={styles.field}>
                Connection name
                <input
                  disabled={busy}
                  required
                  maxLength={80}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                How often should Bòrd check for measurements?
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
                <small>
                  Only new weigh-ins are added. Your existing history and calorie targets are
                  preserved.
                </small>
              </label>
              <button className={styles.primary} disabled={busy}>
                {busy ? 'Please wait…' : 'Save settings'}
              </button>
            </form>
            <section className={styles.section}>
              <h3>Profile assignments</h3>
              <p>
                {state.canAssignHousehold
                  ? 'Match each VeSync profile to the right person in your household.'
                  : 'Match your VeSync profile to your own Bòrd profile.'}{' '}
                A person can have one scale connection at a time.
              </p>
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
              <div className={styles.stack}>
                <label className={styles.field}>
                  Scale
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
                </label>
                <button
                  className={styles.secondary}
                  disabled={busy || !device}
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
                  {busy ? 'Please wait…' : 'Find VeSync profiles'}
                </button>
                {readings.length ? (
                  <>
                    <label className={styles.field}>
                      VeSync profile
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
                    </label>
                    <label className={styles.field}>
                      Bòrd profile
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
                      <small>
                        Weight tracking must be enabled in Nutrition before measurements can sync.
                      </small>
                    </label>
                    <button
                      className={styles.secondary}
                      disabled={busy || !profileId || !scaleUser}
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
                      Assign profile
                    </button>
                  </>
                ) : null}
              </div>
            </section>
            <div className={styles.actions}>
              <button
                className={styles.secondary}
                disabled={busy || !editing.mappings.length}
                onClick={() => void sync(editing)}
              >
                <RefreshCw size={16} /> Sync now
              </button>
            </div>
            <section className={styles.section}>
              <h3>Remove connection</h3>
              <p>
                This stops automatic sync and removes all assignments for this connection. Saved
                measurements stay in Nutrition.
              </p>
              {confirmRemove ? (
                <div className={styles.actions}>
                  <button
                    className={styles.danger}
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await request({ action: 'remove', id: editing.id });
                        await reload();
                        dialog.current?.close();
                        setMessage('Connection removed. Saved measurements are retained.');
                      })
                    }
                  >
                    Remove {editing.label}
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
            </section>
          </div>
        ) : null}
        {message ? (
          <p role="status" className={styles.notice}>
            {message}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
      </dialog>
    </div>
  );
}
