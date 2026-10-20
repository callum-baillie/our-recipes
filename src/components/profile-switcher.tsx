'use client';

import {
  ChevronDown,
  KeyRound,
  LogOut,
  X,
  UserRound,
  UsersRound,
  ShieldCheck,
  CalendarClock,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { LoadingIndicator } from '@/components/skeleton';
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
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const destination = useRef('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0];
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;

  useEffect(() => {
    function navigateDiary(event: Event) {
      const detail = (event as CustomEvent<{ householdProfileId: string; date: string }>).detail;
      if (
        pending ||
        !detail ||
        !profiles.some((profile) => profile.id === detail.householdProfileId) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(detail.date)
      )
        return;
      const href = `/nutrition?view=diary&date=${encodeURIComponent(detail.date)}`;
      if (detail.householdProfileId === activeProfileId) {
        router.push(href);
        return;
      }
      destination.current = href;
      setSelectedProfileId(detail.householdProfileId);
      setPassword('');
      setError(null);
      window.requestAnimationFrame(() => dialogRef.current?.showModal());
    }
    window.addEventListener('bord:open-profile-diary', navigateDiary);
    return () => window.removeEventListener('bord:open-profile-diary', navigateDiary);
  }, [activeProfileId, profiles, pending, router]);

  function requestProfileSwitch(profileId: string) {
    if (profileId === activeProfileId) return;
    destination.current = '';
    setSelectedProfileId(profileId);
    setPassword('');
    setError(null);
    window.requestAnimationFrame(() => dialogRef.current?.showModal());
  }

  function closeDialog() {
    if (pending) return;
    destination.current = '';
    dialogRef.current?.close();
    setSelectedProfileId(null);
    setPassword('');
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
        body: JSON.stringify({ password }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(body?.error?.message ?? 'The profile password could not be verified.');
      }
      showToast(
        `Now cooking as ${selectedProfile?.displayName ?? 'the selected profile'}.`,
        'success',
      );
      const href = destination.current;
      destination.current = '';
      dialogRef.current?.close();
      setSelectedProfileId(null);
      setPassword('');
      if (href) router.push(href);
      router.refresh();
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : 'The active profile could not be changed. Please try again.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setPassword('');
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
              <LoadingIndicator label="Switching profile" />
            ) : (
              <ChevronDown size={16} aria-hidden="true" />
            )}
          </>
        }
      >
        <div className="profile-menu" aria-label="Your account">
          <div className="profile-menu-heading">
            <strong>{activeProfile.displayName}</strong>
            <span>Your household profile</span>
          </div>
          <div className="profile-menu-group" aria-label="Switch household profile">
            <p className="profile-menu-label">Switch profile · account password required</p>
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
          </div>
          <div role="separator" className="profile-menu-separator" />
          <div className="profile-menu-group">
            {canManageProfiles ? (
              <Link className="manage-profiles-link" href="/settings/profiles" data-menu-close>
                <UsersRound size={18} aria-hidden="true" /> Manage profiles
              </Link>
            ) : null}
            <Link className="manage-profiles-link" href="/account" data-menu-close>
              <UserRound size={18} aria-hidden="true" /> My profile
            </Link>
            <Link className="manage-profiles-link" href="/account/automation" data-menu-close>
              <CalendarClock size={18} aria-hidden="true" /> Schedules & tasks
            </Link>
            <Link className="manage-profiles-link" href="/account/security" data-menu-close>
              <ShieldCheck size={18} aria-hidden="true" /> Account security
            </Link>
          </div>
          <div role="separator" className="profile-menu-separator" />
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
        className="profile-password-dialog"
        ref={dialogRef}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        onClose={() => {
          destination.current = '';
          setSelectedProfileId(null);
          setPassword('');
          setError(null);
        }}
        aria-labelledby="profile-password-title"
        aria-describedby="profile-password-description"
      >
        <form onSubmit={switchProfile}>
          <button
            className="profile-password-dialog-close"
            type="button"
            aria-label="Close profile password dialog"
            onClick={closeDialog}
            disabled={pending}
          >
            <X size={18} aria-hidden="true" />
          </button>
          <div className="profile-password-dialog-heading">
            <span aria-hidden="true">
              <KeyRound size={20} />
            </span>
            <div>
              <h2 id="profile-password-title">
                Switch to {selectedProfile?.displayName ?? 'profile'}
              </h2>
              <p id="profile-password-description">
                Enter the account password for this profile to switch on this device.
              </p>
            </div>
          </div>
          <label>
            <span>Password</span>
            <input
              autoFocus
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              disabled={pending}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'profile-password-error' : undefined}
            />
          </label>
          {error ? (
            <p className="form-error" id="profile-password-error" role="alert">
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
            <button className="primary-button" type="submit" disabled={pending || !password.length}>
              {pending ? 'Checking…' : 'Switch profile'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
