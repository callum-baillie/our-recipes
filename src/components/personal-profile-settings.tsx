'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProfileEditor, type Profile } from './profile-settings';
export function PersonalProfileSettings({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div aria-busy={busy}>
      {message && <p role="status">{message}</p>}
      <fieldset disabled={busy} className="personal-profile-fields">
        <ProfileEditor
          key={JSON.stringify(profile.goalContext)}
          profile={profile}
          active
          personal
          onArchive={async () => {}}
          onRoleChange={async () => false}
          onSave={async (_, values) => {
            setBusy(true);
            setMessage('');
            try {
              const response = await fetch('/api/v1/account/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(values),
              });
              const result = await response.json();
              if (!response.ok)
                throw new Error(result.error?.message ?? 'Unable to save your profile.');
              setMessage('Profile saved.');
              router.refresh();
            } catch (error) {
              setMessage(error instanceof Error ? error.message : 'Unable to save your profile.');
            } finally {
              setBusy(false);
            }
          }}
        />
      </fieldset>
    </div>
  );
}
