'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { personalProfileValues } from '@/lib/domain/setup';
import { ProfileEditor, type Profile } from './profile-settings';
export function PersonalProfileSettings({
  profile,
  revision,
}: {
  profile: Profile;
  revision: string;
}) {
  const currentRevision = useRef(revision);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div aria-busy={busy}>
      <fieldset disabled={busy} className="personal-profile-fields">
        <ProfileEditor
          key={profile.id}
          profile={profile}
          active
          personal
          onArchive={async () => {}}
          onRoleChange={async () => false}
          onLoadCurrent={async () => {
            const response = await fetch('/api/v1/account/profile', { cache: 'no-store' });
            const body = await response.json();
            if (!response.ok)
              throw new Error(body.error?.message ?? 'Could not load your current profile.');
            if (body.profile.id !== profile.id)
              throw new Error('Your account changed. Open My profile again to edit that account.');
            currentRevision.current = body.revision;
            return { ...profile, ...body.profile };
          }}
          onSave={async (_, values) => {
            setBusy(true);
            try {
              const response = await fetch('/api/v1/account/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  expectedRevision: currentRevision.current,
                  settings: personalProfileValues(values),
                }),
              });
              const result = await response.json();
              if (!response.ok) {
                const error = new Error(result.error?.message ?? 'Unable to save your profile.');
                if (response.status === 409) error.name = 'SettingsVersionConflict';
                throw error;
              }
              currentRevision.current = result.revision;
              router.refresh();
              return result.profile;
            } catch (error) {
              throw error;
            } finally {
              setBusy(false);
            }
          }}
        />
      </fieldset>
    </div>
  );
}
