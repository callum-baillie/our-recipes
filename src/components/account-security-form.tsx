'use client';

import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { useRef, useState } from 'react';

import { PasskeySettings } from './passkey-settings';
import { SettingsPane, SettingsField, SettingsActionBar } from './settings-primitives';
import { useToast } from '@/components/toast-provider';

export function AccountSecurityForm() {
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState<'password' | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const lock = useRef(false);
  const [revealed, setRevealed] = useState(false);
  const [success, setSuccess] = useState('');
  const [errorField, setErrorField] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    setError(null);
    setSuccess('');
    setErrorField('');
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      setErrorField('confirm');
      formRef.current?.querySelector<HTMLInputElement>('[name=confirm]')?.focus();
      return;
    }
    lock.current = true;
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
        throw new Error(
          body?.error?.message ?? body?.message ?? 'The password could not be changed.',
        );
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Password changed. Other sessions were signed out.');
      setRevealed(false);
      showToast('Password changed. Other sessions were signed out.', 'success');
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'The password could not be changed.';
      setError(message);
      setErrorField('current');
      formRef.current?.querySelector<HTMLInputElement>('[name=current]')?.focus();
      showToast(message, 'error');
    } finally {
      lock.current = false;
      setPending(null);
    }
  }

  return (
    <div className="settings-stack">
      <form ref={formRef} onSubmit={changePassword}>
        <SettingsPane
          title="Password"
          description="Use at least 8 characters. Changing your password signs out your other devices."
          icon={<LockKeyhole size={20} />}
        >
          <SettingsField
            title="Current password"
            description="Confirm the password for the account you are signed in to."
          >
            <input
              required
              type={revealed ? 'text' : 'password'}
              autoComplete="current-password"
              name="current"
              aria-invalid={errorField === 'current'}
              aria-describedby={errorField === 'current' ? 'password-error' : undefined}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={pending !== null}
            />
          </SettingsField>
          <SettingsField title="New password" description="Between 8 and 128 characters.">
            <input
              required
              type={revealed ? 'text' : 'password'}
              autoComplete="new-password"
              name="new"
              aria-invalid={errorField === 'new'}
              aria-describedby={errorField === 'new' ? 'password-error' : undefined}
              minLength={8}
              maxLength={128}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={pending !== null}
            />
          </SettingsField>
          <SettingsField title="Confirm new password" description="Enter your new password again.">
            <input
              required
              type={revealed ? 'text' : 'password'}
              autoComplete="new-password"
              name="confirm"
              aria-invalid={errorField === 'confirm'}
              aria-describedby={errorField === 'confirm' ? 'password-error' : undefined}
              minLength={8}
              maxLength={128}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={pending !== null}
            />
          </SettingsField>
          <button
            type="button"
            className="text-button"
            disabled={pending !== null}
            aria-pressed={revealed}
            onClick={() => setRevealed((value) => !value)}
          >
            {revealed ? 'Hide passwords' : 'Show passwords'}
          </button>
          {error && (
            <p id="password-error" role="alert" className="form-error settings-inline-status">
              {error}
            </p>
          )}
          <SettingsActionBar status={success}>
            <button className="primary-button" disabled={pending !== null} type="submit">
              <ShieldCheck size={16} />
              {pending === 'password' ? 'Changing…' : 'Change password'}
            </button>
          </SettingsActionBar>
        </SettingsPane>
      </form>
      <PasskeySettings />
    </div>
  );
}
