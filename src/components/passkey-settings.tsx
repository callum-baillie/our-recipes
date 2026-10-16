'use client';
import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { authClient } from '@/lib/auth/client';
import {
  SettingsPane,
  SettingsRow,
  SettingsField,
  SettingsSubsection,
  SettingsItem,
  SettingsEmpty,
} from './settings-primitives';
type Passkey = { id: string; name?: string | null; createdAt?: string | null };
export function PasskeySettings() {
  const [keys, setKeys] = useState<Passkey[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/passkey/list-user-passkeys', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || !Array.isArray(body))
        throw new Error(body?.message ?? 'Passkeys could not be loaded.');
      setKeys(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Check your connection and retry.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function add() {
    setPending('add');
    setError('');
    setMessage('');
    try {
      const result = await authClient.passkey.addPasskey({ name: name.trim() || 'Passkey' });
      if (result.error) throw new Error(result.error.message ?? 'Passkey could not be added.');
      setName('');
      await load();
      setMessage('Passkey added.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Passkey could not be added.');
    } finally {
      setPending(null);
    }
  }
  async function remove(id: string) {
    setPending(id);
    setError('');
    setMessage('');
    try {
      const result = await authClient.passkey.deletePasskey({ id });
      if (result.error) throw new Error(result.error.message ?? 'Passkey could not be removed.');
      setKeys((current) => current.filter((key) => key.id !== id));
      setRemoveId(null);
      setMessage('Passkey removed.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Passkey could not be removed.');
    } finally {
      setPending(null);
    }
  }
  return (
    <SettingsPane
      title="Passkeys"
      description="Use a device or password manager to sign in to your account without entering your password."
      icon={<KeyRound size={20} />}
    >
      <SettingsField
        title="Passkey name"
        description="Choose a name that helps you recognize this device or password manager."
      >
        <input
          value={name}
          maxLength={64}
          placeholder="For example, my laptop"
          disabled={loading || pending !== null}
          onChange={(event) => setName(event.target.value)}
        />
      </SettingsField>
      <SettingsRow
        title="Add a passkey"
        description="Your browser will guide you through the device’s sign-in confirmation."
      >
        <button
          className="secondary-button"
          type="button"
          disabled={loading || pending !== null}
          onClick={() => void add()}
        >
          <Plus size={17} />
          {pending === 'add' ? 'Adding…' : 'Add passkey'}
        </button>
      </SettingsRow>
      <SettingsSubsection
        title="Saved passkeys"
        description="These sign-in methods belong to the account you are signed in to."
        actions={
          <button
            className="text-button"
            type="button"
            disabled={loading || pending !== null}
            onClick={() => void load()}
          >
            Refresh
          </button>
        }
      >
        {loading ? (
          <p role="status" className="settings-empty">
            Loading passkeys…
          </p>
        ) : !keys.length && !error ? (
          <SettingsEmpty>
            No passkeys yet. Add one above to enable passwordless sign-in.
          </SettingsEmpty>
        ) : (
          keys.map((key) => (
            <SettingsItem
              key={key.id}
              title={key.name || 'Passkey'}
              description={
                key.createdAt && Number.isFinite(Date.parse(key.createdAt))
                  ? `Added ${new Date(key.createdAt).toLocaleDateString()}`
                  : undefined
              }
              actions={
                removeId === key.id ? (
                  <>
                    <button
                      className="text-button"
                      type="button"
                      disabled={pending !== null}
                      onClick={() => setRemoveId(null)}
                    >
                      Keep passkey
                    </button>
                    <button
                      className="danger-button"
                      type="button"
                      disabled={pending !== null}
                      onClick={() => void remove(key.id)}
                    >
                      {pending === key.id ? 'Removing…' : 'Confirm removal'}
                    </button>
                  </>
                ) : (
                  <button
                    className="text-button"
                    type="button"
                    disabled={pending !== null}
                    onClick={() => setRemoveId(key.id)}
                    aria-label={`Remove ${key.name || 'passkey'}`}
                  >
                    <Trash2 size={16} />
                    Remove
                  </button>
                )
              }
            >
              {removeId === key.id && (
                <p>
                  This passkey will no longer sign you in. Make sure you have another way to access
                  your account before removing it.
                </p>
              )}
            </SettingsItem>
          ))
        )}
      </SettingsSubsection>
      {error && (
        <p role="alert" className="form-error settings-inline-status">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="settings-inline-status">
          {message}
        </p>
      )}
    </SettingsPane>
  );
}
