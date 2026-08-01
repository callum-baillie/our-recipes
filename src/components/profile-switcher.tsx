'use client';

import { ChevronDown, KeyRound, LogOut, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { InlineSkeleton } from '@/components/skeleton';
import { authClient } from '@/lib/auth/client';

import { DismissibleDetails } from '@/components/dismissible-details';
import { useToast } from '@/components/toast-provider';

export type HeaderProfile = {
  id: string;
  displayName: string;
  color: string;
};

type ProfileSwitcherProps = {
  activeProfileId: string | null;
  profiles: HeaderProfile[];
  canManageProfiles: boolean;
};

function profileInitial(displayName: string): string {
  return Array.from(displayName.trim())[0]?.toLocaleUpperCase() ?? '?';
}

function profileInitialColor(background: string): string {
  const channels = background
    .slice(1)
    .match(/.{2}/gu)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3) return '#fffdf8';
  const luminance = channels
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
  return luminance > 0.42 ? '#273126' : '#fffdf8';
}

export function ProfileSwitcher({
  activeProfileId,
  profiles,
  canManageProfiles,
}: ProfileSwitcherProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0];
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;

  function requestProfileSwitch(profileId: string) {
    if (profileId === activeProfileId) return;
    setSelectedProfileId(profileId);
    setPin('');
    setError(null);
    window.requestAnimationFrame(() => dialogRef.current?.showModal());
  }

  function closeDialog() {
    if (pending) return;
    dialogRef.current?.close();
    setSelectedProfileId(null);
    setPin('');
    setError(null);
  }

  async function switchProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProfileId) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/profiles/${selectedProfileId}/active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(body?.error?.message ?? 'The profile PIN could not be verified.');
      }
      showToast(
        `Now cooking as ${selectedProfile?.displayName ?? 'the selected profile'}.`,
        'success',
      );
      dialogRef.current?.close();
      setSelectedProfileId(null);
      setPin('');
      router.refresh();
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : 'The active profile could not be changed. Please try again.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setPending(false);
    }
  }

  async function signOut() {
    setPending(true);
    const result = await authClient.signOut();
    if (result.error) {
      setPending(false);
      showToast(result.error.message ?? 'Sign-out failed.', 'error');
      return;
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_AUTH_CACHES' });
    }
    if ('caches' in window) {
      const keys = await window.caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('bord-read-') || key.startsWith('our-recipes-read-'))
          .map((key) => window.caches.delete(key)),
      );
    }
    router.push('/sign-in');
    router.refresh();
  }

  if (!activeProfile) return null;
  return (
    <>
      <DismissibleDetails
        className="profile-switcher"
        summaryAriaLabel={`Switch profile. Current profile: ${activeProfile.displayName}`}
        summary={
          <>
            <span
              className="profile-dot"
              style={{
                backgroundColor: activeProfile.color,
                color: profileInitialColor(activeProfile.color),
              }}
              aria-hidden="true"
            >
              {profileInitial(activeProfile.displayName)}
            </span>
            <span className="profile-name">{activeProfile.displayName}</span>
            {pending ? (
              <InlineSkeleton label="Switching profile" width="0.95rem" />
            ) : (
              <ChevronDown size={16} aria-hidden="true" />
            )}
          </>
        }
      >
        <div className="profile-menu">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              data-menu-close
              disabled={pending}
              onClick={() => requestProfileSwitch(profile.id)}
            >
              <span
                className="profile-dot"
                style={{
                  backgroundColor: profile.color,
                  color: profileInitialColor(profile.color),
                }}
                aria-hidden="true"
              >
                {profileInitial(profile.displayName)}
              </span>
              <span>{profile.displayName}</span>
              {profile.id === activeProfile.id && <span className="active-label">Active</span>}
            </button>
          ))}
          {canManageProfiles ? (
            <Link className="manage-profiles-link" href="/settings/profiles" data-menu-close>
              Manage profiles
            </Link>
          ) : null}
          <Link className="manage-profiles-link" href="/account/security" data-menu-close>
            Account security
          </Link>
          <button
            className="profile-sign-out"
            type="button"
            data-menu-close
            disabled={pending}
            onClick={signOut}
          >
            <LogOut size={16} aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      </DismissibleDetails>
      <dialog
        className="profile-pin-dialog"
        ref={dialogRef}
        onClose={() => {
          setSelectedProfileId(null);
          setPin('');
          setError(null);
        }}
        aria-labelledby="profile-pin-title"
        aria-describedby="profile-pin-description"
      >
        <form onSubmit={switchProfile}>
          <button
            className="profile-pin-dialog-close"
            type="button"
            aria-label="Close profile PIN dialog"
            onClick={closeDialog}
            disabled={pending}
          >
            <X size={18} aria-hidden="true" />
          </button>
          <div className="profile-pin-dialog-heading">
            <span aria-hidden="true">
              <KeyRound size={20} />
            </span>
            <div>
              <p className="eyebrow">SWITCH PROFILE</p>
              <h2 id="profile-pin-title">{selectedProfile?.displayName ?? 'Profile'} PIN</h2>
              <p id="profile-pin-description">
                Enter this profile&apos;s six-digit PIN. This prevents accidental switching on a
                signed-in household device.
              </p>
            </div>
          </div>
          <label>
            <span>Six-digit PIN</span>
            <input
              autoFocus
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/gu, '').slice(0, 6))}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'profile-pin-error' : undefined}
            />
          </label>
          {error ? (
            <p className="form-error" id="profile-pin-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="dialog-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={closeDialog}
              disabled={pending}
            >
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={pending || pin.length !== 6}>
              {pending ? 'Checking…' : 'Switch profile'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
