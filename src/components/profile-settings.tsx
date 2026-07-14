'use client';

import { Archive, Plus, RotateCcw, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Profile = {
  id: string;
  displayName: string;
  color: string;
  avatarUrl: string | null;
  units: 'metric' | 'imperial';
  temperatureUnit: 'C' | 'F';
  locale: string;
  timezone: string;
  archivedAt: Date | string | null;
};

type ProfileValues = {
  displayName: string;
  color: string;
  avatarUrl: string;
  units: Profile['units'];
  temperatureUnit: Profile['temperatureUnit'];
  locale: string;
  timezone: string;
};

const blankProfile: ProfileValues = {
  displayName: '',
  color: '#5B713E',
  avatarUrl: '',
  units: 'metric' as const,
  temperatureUnit: 'C' as const,
  locale: 'en-US',
  timezone: 'America/Los_Angeles',
};

export function ProfileSettings({
  initialProfiles,
  activeProfileId,
}: {
  initialProfiles: Profile[];
  activeProfileId: string | null;
}) {
  const router = useRouter();
  const [profiles, setProfiles] = useState(initialProfiles);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveProfile(profile: Profile, data: ProfileValues) {
    setError(null);
    const response = await fetch(`/api/v1/profiles/${profile.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = (await response.json().catch(() => null)) as {
      profile?: Profile;
      error?: { message?: string };
    } | null;
    if (!response.ok || !body?.profile) {
      setError(body?.error?.message ?? 'We could not update this profile.');
      return;
    }
    setProfiles((current) =>
      current.map((item) => (item.id === profile.id ? body.profile! : item)),
    );
    router.refresh();
  }

  async function addProfile(data: ProfileValues) {
    setError(null);
    const response = await fetch('/api/v1/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = (await response.json().catch(() => null)) as
      | (Profile & {
          error?: { message?: string };
        })
      | null;
    if (!response.ok || !body?.id) {
      setError(body?.error?.message ?? 'We could not add this profile.');
      return;
    }
    setProfiles((current) => [...current, body]);
    setAdding(false);
    router.refresh();
  }

  async function archive(profile: Profile, archived: boolean) {
    setError(null);
    const response = await fetch(`/api/v1/profiles/${profile.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    });
    const body = (await response.json().catch(() => null)) as {
      profile?: Profile;
      error?: { message?: string };
    } | null;
    if (!response.ok || !body?.profile) {
      setError(body?.error?.message ?? 'We could not change this profile.');
      return;
    }
    setProfiles((current) =>
      current.map((item) => (item.id === profile.id ? body.profile! : item)),
    );
    router.refresh();
  }

  return (
    <main className="settings-page">
      <section className="settings-intro">
        <p className="eyebrow">HOUSEHOLD SETTINGS</p>
        <h1>The people around the table.</h1>
        <p>
          Profiles control personal units, temperature, and attribution. They are not passwords or
          access control.
        </p>
      </section>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <section className="profile-settings-list">
        {profiles.map((profile) => (
          <ProfileEditor
            key={profile.id}
            profile={profile}
            active={profile.id === activeProfileId}
            onSave={saveProfile}
            onArchive={archive}
          />
        ))}
      </section>
      {adding ? (
        <ProfileEditor
          profile={{ ...blankProfile, id: 'new', archivedAt: null }}
          active={false}
          isNew
          onSave={(_profile, data) => addProfile(data)}
          onArchive={async () => {}}
        />
      ) : (
        <button className="text-button" type="button" onClick={() => setAdding(true)}>
          <Plus size={16} /> Add another profile
        </button>
      )}
    </main>
  );
}

function ProfileEditor({
  profile,
  active,
  isNew = false,
  onSave,
  onArchive,
}: {
  profile: Profile;
  active: boolean;
  isNew?: boolean;
  onSave: (profile: Profile, values: ProfileValues) => Promise<void>;
  onArchive: (profile: Profile, archived: boolean) => Promise<void>;
}) {
  const [values, setValues] = useState({
    displayName: profile.displayName,
    color: profile.color,
    avatarUrl: profile.avatarUrl ?? '',
    units: profile.units,
    temperatureUnit: profile.temperatureUnit,
    locale: profile.locale,
    timezone: profile.timezone,
  });
  const archived = Boolean(profile.archivedAt);
  return (
    <section className="settings-card profile-editor">
      <div className="profile-editor-heading">
        <div>
          <span
            className="profile-dot"
            style={{ backgroundColor: values.color }}
            aria-hidden="true"
          />
          <h2>{isNew ? 'New profile' : profile.displayName}</h2>
          {active && <small>Active profile</small>}
          {archived && <small>Archived</small>}
        </div>
        {!isNew && (
          <button
            className="text-button"
            type="button"
            onClick={() => onArchive(profile, !archived)}
          >
            {archived ? (
              <>
                <RotateCcw size={15} /> Restore
              </>
            ) : (
              <>
                <Archive size={15} /> Archive
              </>
            )}
          </button>
        )}
      </div>
      <div className="field-grid two-columns">
        <label>
          <span>Display name</span>
          <input
            value={values.displayName}
            onChange={(event) => setValues({ ...values, displayName: event.target.value })}
          />
        </label>
        <label>
          <span>
            Avatar URL <em>(optional)</em>
          </span>
          <input
            value={values.avatarUrl}
            onChange={(event) => setValues({ ...values, avatarUrl: event.target.value })}
          />
        </label>
        <label>
          <span>Color</span>
          <input
            type="color"
            value={values.color}
            onChange={(event) => setValues({ ...values, color: event.target.value })}
          />
        </label>
        <label>
          <span>Units</span>
          <select
            value={values.units}
            onChange={(event) =>
              setValues({ ...values, units: event.target.value as Profile['units'] })
            }
          >
            <option value="metric">Metric</option>
            <option value="imperial">US customary</option>
          </select>
        </label>
        <label>
          <span>Temperature</span>
          <select
            value={values.temperatureUnit}
            onChange={(event) =>
              setValues({
                ...values,
                temperatureUnit: event.target.value as Profile['temperatureUnit'],
              })
            }
          >
            <option value="C">Celsius</option>
            <option value="F">Fahrenheit</option>
          </select>
        </label>
        <label>
          <span>Locale</span>
          <input
            value={values.locale}
            onChange={(event) => setValues({ ...values, locale: event.target.value })}
          />
        </label>
        <label>
          <span>Time zone</span>
          <input
            value={values.timezone}
            onChange={(event) => setValues({ ...values, timezone: event.target.value })}
          />
        </label>
      </div>
      <button
        className="primary-button compact"
        type="button"
        disabled={archived || !values.displayName.trim()}
        onClick={() => onSave(profile, values)}
      >
        <Save size={16} /> {isNew ? 'Create profile' : 'Save profile'}
      </button>
    </section>
  );
}
