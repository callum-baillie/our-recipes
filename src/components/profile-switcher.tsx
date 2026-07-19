'use client';

import { ChevronDown, LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { DismissibleDetails } from '@/components/dismissible-details';
import { useToast } from '@/components/toast-provider';
import type { ProfileRecord } from '@/lib/services/household-service';

type ProfileSwitcherProps = {
  activeProfileId: string | null;
  profiles: ProfileRecord[];
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

export function ProfileSwitcher({ activeProfileId, profiles }: ProfileSwitcherProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0];

  async function switchProfile(profileId: string) {
    if (profileId === activeProfileId) return;
    setPending(true);
    try {
      const response = await fetch(`/api/v1/profiles/${profileId}/active`, { method: 'PATCH' });
      if (!response.ok) throw new Error('Profile switch failed');
      const profile = profiles.find((candidate) => candidate.id === profileId);
      showToast(`Now cooking as ${profile?.displayName ?? 'the selected profile'}.`, 'success');
      router.refresh();
    } catch {
      showToast('The active profile could not be changed. Please try again.', 'error');
    } finally {
      setPending(false);
    }
  }

  if (!activeProfile) return null;
  return (
    <DismissibleDetails
      className="profile-switcher"
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
          <span>{activeProfile.displayName}</span>
          {pending ? (
            <LoaderCircle className="spin" size={15} aria-label="Switching profile" />
          ) : (
            <ChevronDown size={16} aria-hidden="true" />
          )}
        </>
      }
    >
      <div className="profile-menu" role="menu">
        {profiles.map((profile) => (
          <button
            key={profile.id}
            type="button"
            role="menuitem"
            data-menu-close
            disabled={pending}
            onClick={() => switchProfile(profile.id)}
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
        <Link
          className="manage-profiles-link"
          href="/settings/profiles"
          role="menuitem"
          data-menu-close
        >
          Manage profiles
        </Link>
      </div>
    </DismissibleDetails>
  );
}
