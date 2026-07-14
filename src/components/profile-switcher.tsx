'use client';

import { ChevronDown, LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { ProfileRecord } from '@/lib/services/household-service';

type ProfileSwitcherProps = {
  activeProfileId: string | null;
  profiles: ProfileRecord[];
};

export function ProfileSwitcher({ activeProfileId, profiles }: ProfileSwitcherProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0];

  async function switchProfile(profileId: string) {
    if (profileId === activeProfileId) return;
    setPending(true);
    try {
      const response = await fetch(`/api/v1/profiles/${profileId}/active`, { method: 'PATCH' });
      if (response.ok) router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (!activeProfile) return null;
  return (
    <details className="profile-switcher">
      <summary>
        <span
          className="profile-dot"
          style={{ backgroundColor: activeProfile.color }}
          aria-hidden="true"
        />
        <span>{activeProfile.displayName}</span>
        {pending ? (
          <LoaderCircle className="spin" size={15} aria-label="Switching profile" />
        ) : (
          <ChevronDown size={16} aria-hidden="true" />
        )}
      </summary>
      <div className="profile-menu" role="menu">
        {profiles.map((profile) => (
          <button
            key={profile.id}
            type="button"
            role="menuitem"
            onClick={() => switchProfile(profile.id)}
          >
            <span
              className="profile-dot"
              style={{ backgroundColor: profile.color }}
              aria-hidden="true"
            />
            <span>{profile.displayName}</span>
            {profile.id === activeProfile.id && <span className="active-label">Active</span>}
          </button>
        ))}
      </div>
    </details>
  );
}
