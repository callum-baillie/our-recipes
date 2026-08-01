'use client';

import { ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useToast } from '@/components/toast-provider';

type UpgradeProfile = {
  id: string;
  displayName: string;
  color: string;
};

type CredentialDraft = {
  email: string;
  passphrase: string;
  pin: string;
};

export function SecurityUpgradeForm({ profiles }: { profiles: UpgradeProfile[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, CredentialDraft>>(() =>
    Object.fromEntries(
      profiles.map((profile) => [profile.id, { email: '', passphrase: '', pin: '' }]),
    ),
  );
  const [recoveryCodes, setRecoveryCodes] = useState<Array<{
    profileId: string;
    recoveryCodes: string[];
  }> | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(profileId: string, changes: Partial<CredentialDraft>) {
    setDrafts((current) => ({
      ...current,
      [profileId]: { ...current[profileId]!, ...changes },
    }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/auth/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profiles: profiles.map((profile) => ({
            profileId: profile.id,
            credentials: drafts[profile.id],
          })),
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        enrollments?: Array<{ profileId: string; recoveryCodes: string[] }>;
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(body?.error?.message ?? 'The security upgrade could not be completed.');
      }
      setRecoveryCodes(body?.enrollments ?? []);
      showToast('Household authentication is ready.', 'success');
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'The security upgrade could not be completed.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function copyCodes() {
    if (!recoveryCodes) return;
    const value = recoveryCodes
      .map((entry) => {
        const profile = profiles.find((candidate) => candidate.id === entry.profileId);
        return `${profile?.displayName ?? 'Profile'}\n${entry.recoveryCodes.join('\n')}`;
      })
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(value);
      showToast('Recovery codes copied.', 'success');
    } catch {
      showToast('Copy was unavailable. Save the visible codes manually.', 'error');
    }
  }

  if (recoveryCodes) {
    return (
      <section className="onboarding-shell onboarding-security-complete" aria-live="polite">
        <div className="onboarding-heading">
          <ShieldCheck size={25} aria-hidden="true" />
          <div>
            <p className="eyebrow">UPGRADE COMPLETE</p>
            <h2>Save every profile&apos;s recovery codes.</h2>
            <p>These one-time codes are the local fallback when email recovery is unavailable.</p>
          </div>
        </div>
        <div className="recovery-code-groups">
          {recoveryCodes.map((entry, index) => {
            const profile = profiles.find((candidate) => candidate.id === entry.profileId);
            return (
              <section key={entry.profileId} aria-labelledby={`upgrade-recovery-${index}`}>
                <h3 id={`upgrade-recovery-${index}`}>{profile?.displayName ?? 'Profile'}</h3>
                <ul>
                  {entry.recoveryCodes.map((code) => (
                    <li key={code}>
                      <code>{code}</code>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
        <button className="secondary-button" type="button" onClick={copyCodes}>
          Copy all recovery codes
        </button>
        <label className="recovery-code-confirmation">
          <input
            type="checkbox"
            checked={saved}
            onChange={(event) => setSaved(event.target.checked)}
          />
          <span>I saved these one-time codes somewhere private.</span>
        </label>
        <button
          className="primary-button"
          type="button"
          disabled={!saved}
          onClick={() => {
            router.push('/sign-in?upgrade=1');
            router.refresh();
          }}
        >
          Continue to sign in
        </button>
      </section>
    );
  }

  return (
    <form className="onboarding-shell security-upgrade-form" onSubmit={submit}>
      <div className="onboarding-heading">
        <ShieldCheck size={25} aria-hidden="true" />
        <div>
          <p className="eyebrow">ONE-TIME SECURITY UPGRADE</p>
          <h2>Secure every household profile.</h2>
          <p>
            Existing recipe data stays shared. Each profile receives its own email sign-in and a
            quick-switch PIN.
          </p>
        </div>
      </div>
      {profiles.map((profile, index) => {
        const draft = drafts[profile.id]!;
        return (
          <fieldset className="security-upgrade-profile" key={profile.id}>
            <legend>
              <span className="profile-dot" style={{ backgroundColor: profile.color }} aria-hidden>
                {profile.displayName.slice(0, 1).toLocaleUpperCase()}
              </span>
              {profile.displayName}
              {index === 0 ? <small>Initial admin</small> : null}
            </legend>
            <div className="field-grid">
              <label>
                <span>Email</span>
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={draft.email}
                  onChange={(event) => update(profile.id, { email: event.target.value })}
                />
              </label>
              <label>
                <span>Passphrase</span>
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  minLength={15}
                  maxLength={128}
                  value={draft.passphrase}
                  onChange={(event) => update(profile.id, { passphrase: event.target.value })}
                />
                <small>At least 15 characters.</small>
              </label>
              <label>
                <span>Six-digit PIN</span>
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  minLength={6}
                  maxLength={6}
                  value={draft.pin}
                  onChange={(event) =>
                    update(profile.id, {
                      pin: event.target.value.replace(/\D/gu, '').slice(0, 6),
                    })
                  }
                />
                <small>Used only for quick switching after a full sign-in.</small>
              </label>
            </div>
          </fieldset>
        );
      })}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="primary-button" type="submit" disabled={submitting}>
        {submitting ? 'Securing profiles…' : 'Complete security upgrade'}
      </button>
    </form>
  );
}
