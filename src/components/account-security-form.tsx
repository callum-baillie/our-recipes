'use client';

import { KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { authClient } from '@/lib/auth/client';
import { useToast } from '@/components/toast-provider';

export function AccountSecurityForm() {
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passkeyName, setPasskeyName] = useState('This device');
  const [pending, setPending] = useState<'password' | 'passkey' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('The new passphrases do not match.');
      return;
    }
    setPending('password');
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          revokeOtherSessions: true,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        message?: string;
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(body?.error?.message ?? body?.message ?? 'The passphrase could not be changed.');
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Passphrase changed. Other sessions were signed out.', 'success');
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'The passphrase could not be changed.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setPending(null);
    }
  }

  async function addPasskey() {
    setError(null);
    setPending('passkey');
    const result = await authClient.passkey.addPasskey({ name: passkeyName });
    setPending(null);
    if (result.error) {
      const message = result.error.message ?? 'The passkey could not be added.';
      setError(message);
      showToast(message, 'error');
      return;
    }
    showToast('Passkey added to this account.', 'success');
  }

  return (
    <div className="account-security-grid">
      <form className="settings-card account-password-card" onSubmit={changePassword}>
        <div className="settings-section-heading">
          <span aria-hidden="true"><LockKeyhole size={20} /></span>
          <div>
            <h2>Change passphrase</h2>
            <p>Use at least 15 characters. Other signed-in devices will be signed out.</p>
          </div>
        </div>
        <label>
          <span>Current passphrase</span>
          <input
            required
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>
        <div className="field-grid two-columns">
          <label>
            <span>New passphrase</span>
            <input
              required
              type="password"
              autoComplete="new-password"
              minLength={15}
              maxLength={128}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </label>
          <label>
            <span>Confirm passphrase</span>
            <input
              required
              type="password"
              autoComplete="new-password"
              minLength={15}
              maxLength={128}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary-button" disabled={pending !== null} type="submit">
          <ShieldCheck size={16} aria-hidden="true" />
          {pending === 'password' ? 'Changing…' : 'Change passphrase'}
        </button>
      </form>

      <section className="settings-card" aria-labelledby="account-passkey-heading">
        <div className="settings-section-heading">
          <span aria-hidden="true"><KeyRound size={20} /></span>
          <div>
            <h2 id="account-passkey-heading">Passwordless sign-in</h2>
            <p>Add a passkey to the account currently signed in on this device.</p>
          </div>
        </div>
        <div className="field-grid two-columns">
          <label>
            <span>Passkey name</span>
            <input
              value={passkeyName}
              maxLength={64}
              onChange={(event) => setPasskeyName(event.target.value)}
            />
          </label>
          <button
            className="secondary-button"
            type="button"
            disabled={pending !== null}
            onClick={addPasskey}
          >
            <KeyRound size={16} aria-hidden="true" />
            {pending === 'passkey' ? 'Adding…' : 'Add passkey'}
          </button>
        </div>
      </section>
    </div>
  );
}
