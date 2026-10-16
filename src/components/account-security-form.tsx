'use client';

import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { PasskeySettings } from './passkey-settings';
import { SettingsPane, SettingsField, SettingsActionBar } from './settings-primitives';
import { useToast } from '@/components/toast-provider';

export function AccountSecurityForm() {
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState<'password' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
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
        throw new Error(
          body?.error?.message ?? body?.message ?? 'The password could not be changed.',
        );
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Password changed. Other sessions were signed out.', 'success');
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'The password could not be changed.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="settings-stack">
      <form onSubmit={changePassword}>
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
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={pending !== null}
            />
          </SettingsField>
          <SettingsField title="New password" description="Between 8 and 128 characters.">
            <input
              required
              type="password"
              autoComplete="new-password"
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
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={pending !== null}
            />
          </SettingsField>
          {error && (
            <p role="alert" className="form-error settings-inline-status">
              {error}
            </p>
          )}
          <SettingsActionBar>
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
