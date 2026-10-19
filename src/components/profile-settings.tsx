'use client';

import { Archive, Plus, RotateCcw, Save, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { kitchenInterviewQuestions, emptyKitchenInterview } from './kitchen-interview';
import { OnboardingWizard } from '@/components/onboarding-wizard';
import {
  SettingsActionBar,
  SettingsPane,
  SettingsField,
  SettingsGroup,
  SettingsSubsection,
  SettingsRow,
} from '@/components/settings-primitives';
import { ButtonSpinner } from './skeleton';
import { usePendingAction } from './use-pending-action';
import { useToast } from '@/components/toast-provider';
import {
  defaultProfileGoalContext,
  profileGoalFocusOptions,
  type ProfileGoalContext,
  type ProfileGoalFocus,
} from '@/lib/domain/profile-goals';
import type { AppRole } from '@/lib/domain/permissions';

export type Profile = {
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
  role: AppRole;
  isLastAdmin: boolean;
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
  initialGuardians,
  activeProfileId,
  aiEnabled = false,
}: {
  initialProfiles: Profile[];
  initialGuardians: Array<{ parentProfileId: string; childProfileId: string }>;
  activeProfileId: string | null;
  aiEnabled?: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [profiles, setProfiles] = useState(initialProfiles);
  const [adding, setAdding] = useState(false);
  const [guardians, setGuardians] = useState(initialGuardians);
  const [pendingGuardian, setPendingGuardian] = useState<string | null>(null);
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

  async function saveRole(profile: Profile, role: AppRole): Promise<boolean> {
    setError(null);
    const response = await fetch(`/api/v1/admin/profiles/${profile.id}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    const body = (await response.json().catch(() => null)) as {
      account?: { profileId: string; role: AppRole; isLastAdmin: boolean };
      error?: { message?: string };
    } | null;
    if (!response.ok || !body?.account) {
      const message = body?.error?.message ?? 'We could not change this role.';
      setError(message);
      showToast(message, 'error');
      return false;
    }
    router.refresh();
    showToast(`${profile.displayName} is now ${body.account.role}.`, 'success');
    return true;
  }

  async function setGuardian(parentProfileId: string, childProfileId: string, enabled: boolean) {
    setError(null);
    const response = await fetch('/api/v1/admin/guardians', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentProfileId, childProfileId, enabled }),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    if (!response.ok) {
      const message = body?.error?.message ?? 'We could not change guardian access.';
      setError(message);
      showToast(message, 'error');
      return;
    }
    setGuardians((current) =>
      enabled
        ? [...current, { parentProfileId, childProfileId }]
        : current.filter(
            (item) =>
              item.parentProfileId !== parentProfileId || item.childProfileId !== childProfileId,
          ),
    );
    showToast(enabled ? 'Guardian access granted.' : 'Guardian access revoked.', 'success');
  }

  return (
    <div className="settings-page">
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {profiles.some((profile) => profile.role === 'child' && !profile.archivedAt) ? (
        <SettingsPane
          className="guardian-settings"
          eyebrow="PERMISSIONS"
          title="Guardian access"
          description="Allow an Admin or Parent to manage a Child's Nutrition data. Guardians cannot delete the child's entries."
          aria-labelledby="guardian-heading"
        >
          {profiles
            .filter((profile) => profile.role === 'child' && !profile.archivedAt)
            .map((child) => (
              <SettingsGroup title={<>{child.displayName}</>} key={child.id}>
                {profiles
                  .filter(
                    (profile) =>
                      profile.id !== child.id &&
                      !profile.archivedAt &&
                      (profile.role === 'admin' || profile.role === 'parent'),
                  )
                  .map((parent) => {
                    const enabled = guardians.some(
                      (item) =>
                        item.parentProfileId === parent.id && item.childProfileId === child.id,
                    );
                    return (
                      <SettingsField
                        key={parent.id}
                        title={
                          <>
                            <span>{parent.displayName}</span>
                          </>
                        }
                        description={
                          <>
                            <small>{parent.role}</small>
                          </>
                        }
                      >
                        <input
                          role="switch"
                          type="checkbox"
                          checked={enabled}
                          disabled={pendingGuardian !== null}
                          aria-busy={pendingGuardian === `${parent.id}:${child.id}`}
                          onChange={(event) => {
                            setPendingGuardian(`${parent.id}:${child.id}`);
                            void setGuardian(parent.id, child.id, event.target.checked)
                              .catch(() =>
                                setError('Could not save the guardian assignment. Try again.'),
                              )
                              .finally(() => setPendingGuardian(null));
                          }}
                        />
                        {pendingGuardian === `${parent.id}:${child.id}` ? <ButtonSpinner /> : null}
                      </SettingsField>
                    );
                  })}
              </SettingsGroup>
            ))}
        </SettingsPane>
      ) : null}
      <section className="profile-settings-list">
        {profiles.map((profile) => (
          <ProfileEditor
            key={profile.id}
            profile={profile}
            active={profile.id === activeProfileId}
            onSave={saveProfile}
            onArchive={archive}
            onRoleChange={saveRole}
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
          aiEnabled={aiEnabled}
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
  aiEnabled,
  onClose,
  onProfileCreated,
}: {
  onClose: () => void;
  onProfileCreated: (profile: Profile) => void;
  aiEnabled: boolean;
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
        aiEnabled={aiEnabled}
        mode="profile"
        onCancel={closeDialog}
        onProfileCreated={(profile) => {
          onProfileCreated({ ...profile, role: 'parent', isLastAdmin: false });
          closeDialog();
        }}
      />
    </dialog>
  );
}

export function ProfileEditor({
  profile,
  active,
  onSave,
  onArchive,
  onRoleChange,
  personal = false,
}: {
  profile: Profile;
  personal?: boolean;
  active: boolean;
  onSave: (profile: Profile, values: ProfileValues) => Promise<void>;
  onArchive: (profile: Profile, archived: boolean) => Promise<void>;
  onRoleChange: (profile: Profile, role: AppRole) => Promise<boolean>;
}) {
  const [actionError, setActionError] = useState('');
  const { pending, run } = usePendingAction(setActionError);
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
  const [role, setRole] = useState(profile.role);

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
    <SettingsPane
      className="profile-editor"
      eyebrow={archived ? 'ARCHIVED PROFILE' : active ? 'ACTIVE PROFILE' : 'HOUSEHOLD PROFILE'}
      title={
        <span className="profile-editor-title">
          <span
            className="profile-dot"
            style={{ backgroundColor: values.color }}
            aria-hidden="true"
          />
          {profile.displayName}
        </span>
      }
      description={
        personal
          ? 'Your identity, regional preferences, and cooking goals.'
          : profile.isLastAdmin
            ? 'This is the only active admin. Promote another admin before demoting or archiving it.'
            : 'Household identity and access role. Personal preferences are managed from My profile.'
      }
      actions={
        !personal && (
          <button
            className="text-button"
            type="button"
            disabled={pending || (profile.isLastAdmin && !archived)}
            title={
              profile.isLastAdmin && !archived
                ? 'Promote another active profile to Admin before archiving this one.'
                : undefined
            }
            onClick={() => void run(() => onArchive(profile, !archived))}
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
        )
      }
    >
      <div className="settings-fields">
        {!personal && (
          <SettingsField
            title="Access role"
            description={
              <>
                <small>
                  {profile.isLastAdmin
                    ? 'This is the only active admin. Promote another admin before demoting it.'
                    : 'Admin manages settings; Parent manages shared content; Child is personal-only.'}
                </small>
              </>
            }
          >
            <select
              value={role}
              disabled={pending}
              aria-busy={pending}
              onChange={async (event) => {
                const nextRole = event.target.value as AppRole;
                setRole(nextRole);
                if (!(await run(() => onRoleChange(profile, nextRole)))) setRole(profile.role);
              }}
            >
              <option value="admin">Admin</option>
              <option value="parent">Parent</option>
              <option value="child">Child</option>
            </select>
          </SettingsField>
        )}
        <SettingsField
          description="The name shown on your profile and in shared kitchen activity."
          title="Display name"
        >
          <input
            value={values.displayName}
            onChange={(event) => setValues({ ...values, displayName: event.target.value })}
          />
        </SettingsField>
        <SettingsField
          description="Use a link to the picture you want shown with this profile."
          title="Avatar URL (optional)"
        >
          <input
            value={values.avatarUrl}
            onChange={(event) => setValues({ ...values, avatarUrl: event.target.value })}
          />
        </SettingsField>
        <SettingsField description="Helps distinguish this profile in shared views." title="Color">
          <input
            type="color"
            value={values.color}
            onChange={(event) => setValues({ ...values, color: event.target.value })}
          />
        </SettingsField>
        {personal && (
          <>
            <SettingsField
              description="Choose how recipe quantities are displayed for this profile."
              title="Units"
            >
              <select
                value={values.units}
                onChange={(event) =>
                  setValues({ ...values, units: event.target.value as Profile['units'] })
                }
              >
                <option value="metric">Metric</option>
                <option value="imperial">US customary</option>
              </select>
            </SettingsField>
            <SettingsField
              description="Choose the unit used for cooking temperatures."
              title="Temperature"
            >
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
            </SettingsField>
            <SettingsField
              description="Controls regional number and date formatting, such as en-US or en-GB."
              title="Locale"
            >
              <input
                value={values.locale}
                onChange={(event) => setValues({ ...values, locale: event.target.value })}
              />
            </SettingsField>
            <SettingsField
              description="Use an IANA timezone, such as America/Chicago, for local dates and times."
              title="Time zone"
            >
              <input
                value={values.timezone}
                onChange={(event) => setValues({ ...values, timezone: event.target.value })}
              />
            </SettingsField>
            <SettingsSubsection
              title="Cooking goals"
              description="Update these preferences as your priorities and routines change."
            >
              <SettingsRow
                title="Focus areas"
                description="Choose the kinds of support you would find useful."
                align="start"
              >
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
              </SettingsRow>
              <div className="settings-fields">
                <SettingsField
                  description="Describe what is motivating your cooking goals."
                  title="Why it matters now"
                >
                  <textarea
                    rows={3}
                    maxLength={800}
                    value={values.goalContext.motivation}
                    onChange={(event) => updateGoalContext({ motivation: event.target.value })}
                  />
                </SettingsField>
                <SettingsField
                  description="Share practical obstacles the assistant should consider."
                  title="What gets in the way"
                >
                  <textarea
                    rows={3}
                    maxLength={800}
                    value={values.goalContext.challenges}
                    onChange={(event) => updateGoalContext({ challenges: event.target.value })}
                  />
                </SettingsField>
                <SettingsField
                  description="Describe the outcome you are working toward."
                  title="What success feels like"
                >
                  <textarea
                    rows={3}
                    maxLength={800}
                    value={values.goalContext.successVision}
                    onChange={(event) => updateGoalContext({ successVision: event.target.value })}
                  />
                </SettingsField>
              </div>
            </SettingsSubsection>
            {!personal && (
              <SettingsSubsection
                title="Kitchen interview"
                description="Food preferences are gentle guidance; allergies and exclusions always take priority."
              >
                {kitchenInterviewQuestions.map((question) => (
                  <SettingsField
                    key={question.key}
                    title={question.title}
                    description={question.help}
                  >
                    <textarea
                      rows={2}
                      maxLength={question.key === 'taste' ? 500 : 800}
                      value={values.goalContext.kitchenInterview?.[question.key] ?? ''}
                      onChange={(event) =>
                        updateGoalContext({
                          kitchenInterview: {
                            ...emptyKitchenInterview,
                            ...values.goalContext.kitchenInterview,
                            [question.key]: event.target.value,
                          },
                        })
                      }
                    />
                  </SettingsField>
                ))}
              </SettingsSubsection>
            )}
            <SettingsField
              description="Additional context for this profile’s cooking preferences."
              title="Anything else the app should remember (optional)"
            >
              <textarea
                rows={3}
                value={values.mainGoals}
                onChange={(event) => setValues({ ...values, mainGoals: event.target.value })}
              />
            </SettingsField>
          </>
        )}
      </div>
      {actionError ? <p role="alert">{actionError}</p> : null}
      <SettingsActionBar>
        <button
          className="primary-button compact"
          type="button"
          disabled={pending || archived || !values.displayName.trim()}
          aria-busy={pending}
          onClick={() => void run(() => onSave(profile, values))}
        >
          {pending ? <ButtonSpinner /> : <Save size={16} />} {pending ? 'Saving…' : 'Save profile'}
        </button>
      </SettingsActionBar>
    </SettingsPane>
  );
}
