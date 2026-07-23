'use client';

import { Archive, Plus, RotateCcw, Save, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { OnboardingWizard } from '@/components/onboarding-wizard';
import { useToast } from '@/components/toast-provider';
import {
  defaultProfileGoalContext,
  profileGoalFocusOptions,
  type ProfileGoalContext,
  type ProfileGoalFocus,
} from '@/lib/domain/profile-goals';

type Profile = {
  id: string;
  displayName: string;
  color: string;
  avatarUrl: string | null;
  units: 'metric' | 'imperial';
  temperatureUnit: 'C' | 'F';
  locale: string;
  timezone: string;
  mainGoals: string;
  goalContext: ProfileGoalContext;
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
  mainGoals: string;
  goalContext: ProfileGoalContext;
};

export function ProfileSettings({
  initialProfiles,
  activeProfileId,
}: {
  initialProfiles: Profile[];
  activeProfileId: string | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
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
      const message = body?.error?.message ?? 'We could not update this profile.';
      setError(message);
      showToast(message, 'error');
      return;
    }
    setProfiles((current) =>
      current.map((item) => (item.id === profile.id ? body.profile! : item)),
    );
    showToast(`${body.profile.displayName} updated.`, 'success');
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
      const message = body?.error?.message ?? 'We could not change this profile.';
      setError(message);
      showToast(message, 'error');
      return;
    }
    setProfiles((current) =>
      current.map((item) => (item.id === profile.id ? body.profile! : item)),
    );
    showToast(
      archived ? `${body.profile.displayName} archived.` : `${body.profile.displayName} restored.`,
      'success',
    );
    router.refresh();
  }

  return (
    <div className="settings-page">
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
      <button
        className="text-button"
        type="button"
        aria-haspopup="dialog"
        aria-controls="profile-onboarding-dialog"
        aria-expanded={adding}
        onClick={() => setAdding(true)}
      >
        <Plus size={16} /> Add another profile
      </button>
      {adding ? (
        <ProfileOnboardingDialog
          onClose={() => setAdding(false)}
          onProfileCreated={(profile) => {
            setProfiles((current) => [...current, profile]);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function ProfileOnboardingDialog({
  onClose,
  onProfileCreated,
}: {
  onClose: () => void;
  onProfileCreated: (profile: Profile) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function closeDialog() {
    dialogRef.current?.close();
  }

  return (
    <dialog
      className="profile-onboarding-dialog"
      id="profile-onboarding-dialog"
      ref={dialogRef}
      aria-labelledby="profile-onboarding-dialog-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
    >
      <h2 className="sr-only" id="profile-onboarding-dialog-title">
        New profile onboarding
      </h2>
      <button
        className="profile-onboarding-dialog-close"
        type="button"
        aria-label="Close profile onboarding"
        onClick={closeDialog}
      >
        <X size={20} aria-hidden="true" />
      </button>
      <OnboardingWizard
        mode="profile"
        onCancel={closeDialog}
        onProfileCreated={(profile) => {
          onProfileCreated(profile);
          closeDialog();
        }}
      />
    </dialog>
  );
}

function ProfileEditor({
  profile,
  active,
  onSave,
  onArchive,
}: {
  profile: Profile;
  active: boolean;
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
    mainGoals: profile.mainGoals ?? '',
    goalContext: profile.goalContext ?? defaultProfileGoalContext,
  });
  const archived = Boolean(profile.archivedAt);

  function toggleGoalFocus(focus: ProfileGoalFocus) {
    const selected = values.goalContext.focusAreas.includes(focus);
    setValues({
      ...values,
      goalContext: {
        ...values.goalContext,
        focusAreas: selected
          ? values.goalContext.focusAreas.filter((item) => item !== focus)
          : [...values.goalContext.focusAreas, focus],
      },
    });
  }

  function updateGoalContext(changes: Partial<ProfileGoalContext>) {
    setValues({
      ...values,
      goalContext: { ...values.goalContext, ...changes },
    });
  }

  return (
    <section className="settings-card profile-editor">
      <div className="profile-editor-heading">
        <div>
          <span
            className="profile-dot"
            style={{ backgroundColor: values.color }}
            aria-hidden="true"
          />
          <h2>{profile.displayName}</h2>
          {active && <small>Active profile</small>}
          {archived && <small>Archived</small>}
        </div>
        <button className="text-button" type="button" onClick={() => onArchive(profile, !archived)}>
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
        <section
          className="full-width-field profile-goal-settings"
          aria-labelledby={`goals-${profile.id}`}
        >
          <div>
            <h3 id={`goals-${profile.id}`}>What this profile wants help with</h3>
            <p>These reflections can be updated whenever priorities or routines change.</p>
          </div>
          <div className="profile-goal-settings-options">
            {profileGoalFocusOptions.map((option) => {
              const selected = values.goalContext.focusAreas.includes(option.value);
              return (
                <label className={selected ? 'selected' : ''} key={option.value}>
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={!selected && values.goalContext.focusAreas.length >= 8}
                    onChange={() => toggleGoalFocus(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
          <div className="field-grid two-columns">
            <label>
              <span>Why it matters now</span>
              <textarea
                rows={3}
                maxLength={800}
                value={values.goalContext.motivation}
                onChange={(event) => updateGoalContext({ motivation: event.target.value })}
              />
            </label>
            <label>
              <span>What gets in the way</span>
              <textarea
                rows={3}
                maxLength={800}
                value={values.goalContext.challenges}
                onChange={(event) => updateGoalContext({ challenges: event.target.value })}
              />
            </label>
            <label className="full-width-field">
              <span>What success feels like</span>
              <textarea
                rows={3}
                maxLength={800}
                value={values.goalContext.successVision}
                onChange={(event) => updateGoalContext({ successVision: event.target.value })}
              />
            </label>
          </div>
        </section>
        <label className="full-width-field">
          <span>
            Anything else the app should remember <em>(optional)</em>
          </span>
          <textarea
            rows={3}
            value={values.mainGoals}
            onChange={(event) => setValues({ ...values, mainGoals: event.target.value })}
          />
        </label>
      </div>
      <button
        className="primary-button compact"
        type="button"
        disabled={archived || !values.displayName.trim()}
        onClick={() => onSave(profile, values)}
      >
        <Save size={16} /> Save profile
      </button>
    </section>
  );
}
