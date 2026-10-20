'use client';
/* eslint-disable @next/next/no-img-element -- Uncommitted avatar URLs need a direct loading failure fallback. */

import { Archive, Plus, RotateCcw, Save, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Fragment, useState } from 'react';
import { AppDialog } from './app-dialog';

import { RegionalChoice } from './regional-choice';
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
  const [guardianFeedback, setGuardianFeedback] = useState<
    Record<string, { error: boolean; message: string }>
  >({});
  const [pendingGuardian, setPendingGuardian] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reconcile() {
    const response = await fetch('/api/v1/profiles?enriched=true', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok)
      throw new Error(
        body.error?.message ??
          'The change may be saved. Refresh members to reload roles and archive eligibility.',
      );
    setProfiles(body.profiles);
    setGuardians(body.guardians);
  }

  async function saveProfile(profile: Profile, data: ProfileValues) {
    setError(null);
    const response = await fetch(`/api/v1/profiles/${profile.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'identity',
        displayName: data.displayName,
        color: data.color,
        avatarUrl: data.avatarUrl,
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      profile?: Profile;
      error?: { message?: string };
    } | null;
    if (!response.ok || !body?.profile) {
      const message = body?.error?.message ?? 'We could not update this profile.';
      setError(message);
      showToast(message, 'error');
      throw new Error(message);
    }
    setProfiles((current) =>
      current.map((item) => (item.id === profile.id ? { ...item, ...body.profile! } : item)),
    );
    showToast(`${body.profile.displayName} updated.`, 'success');
    router.refresh();
    return body.profile;
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
      throw new Error(message);
    }
    setProfiles((current) =>
      current.map((item) => (item.id === profile.id ? { ...item, ...body.profile! } : item)),
    );
    showToast(
      archived ? `${body.profile.displayName} archived.` : `${body.profile.displayName} restored.`,
      'success',
    );
    await reconcile();
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
      throw new Error(message);
    }
    setProfiles((current) => {
      const next = current.map((item) =>
        item.id === profile.id ? { ...item, role: body.account!.role } : item,
      );
      const activeAdmins = next.filter((item) => !item.archivedAt && item.role === 'admin');
      return next.map((item) => ({
        ...item,
        isLastAdmin: !item.archivedAt && item.role === 'admin' && activeAdmins.length === 1,
      }));
    });
    await reconcile().catch((error) => setError(error.message));
    router.refresh();
    showToast(`${profile.displayName} is now ${body.account.role}.`, 'success');
    return true;
  }

  async function setGuardian(parentProfileId: string, childProfileId: string, enabled: boolean) {
    const pair = `${parentProfileId}:${childProfileId}`;
    const parentName =
      profiles.find((item) => item.id === parentProfileId)?.displayName ?? 'Guardian';
    const childName = profiles.find((item) => item.id === childProfileId)?.displayName ?? 'child';
    setGuardianFeedback((current) => ({
      ...current,
      [pair]: { error: false, message: `Saving ${parentName}’s access to ${childName}…` },
    }));
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
      setGuardianFeedback((current) => ({ ...current, [pair]: { error: true, message } }));
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
    setGuardianFeedback((current) => ({
      ...current,
      [pair]: {
        error: false,
        message: `${parentName}’s Nutrition access to ${childName} ${enabled ? 'granted' : 'revoked'}.`,
      },
    }));
  }

  return (
    <div className="settings-page">
      <button
        className="primary-button"
        type="button"
        aria-haspopup="dialog"
        aria-controls="profile-onboarding-dialog"
        aria-expanded={adding}
        onClick={() => setAdding(true)}
      >
        <Plus size={16} /> Add profile
      </button>
      <button
        className="text-button"
        type="button"
        onClick={() => void reconcile().catch((error) => setError(error.message))}
      >
        Refresh members
      </button>
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
          description="Allow an Admin or Parent to manage a Child's Nutrition data. Guardians cannot delete the child's entries. Each switch saves immediately."
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
                            <span>
                              {parent.displayName}’s access to {child.displayName}
                            </span>
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
                                setGuardianFeedback((current) => ({
                                  ...current,
                                  [`${parent.id}:${child.id}`]: {
                                    error: true,
                                    message: `Could not confirm ${parent.displayName}’s access to ${child.displayName}. Refresh members before retrying.`,
                                  },
                                })),
                              )
                              .finally(() => setPendingGuardian(null));
                          }}
                        />
                        {pendingGuardian === `${parent.id}:${child.id}` ? <ButtonSpinner /> : null}
                        {guardianFeedback[`${parent.id}:${child.id}`] && (
                          <span
                            role={
                              guardianFeedback[`${parent.id}:${child.id}`]!.error
                                ? 'alert'
                                : 'status'
                            }
                          >
                            {guardianFeedback[`${parent.id}:${child.id}`]!.message}
                          </span>
                        )}
                      </SettingsField>
                    );
                  })}
              </SettingsGroup>
            ))}
        </SettingsPane>
      ) : null}
      <section className="profile-settings-list">
        {[...profiles]
          .sort((a, b) => Number(Boolean(a.archivedAt)) - Number(Boolean(b.archivedAt)))
          .map((profile, index, sorted) => (
            <Fragment key={profile.id}>
              {profile.archivedAt && (index === 0 || !sorted[index - 1]?.archivedAt) && (
                <h3>Archived members</h3>
              )}
              <details className="settings-member">
                <summary>
                  <strong>{profile.displayName}</strong>
                  <small>
                    {profile.role} ·{' '}
                    {profile.archivedAt
                      ? 'Archived'
                      : profile.id === activeProfileId
                        ? 'Active profile'
                        : 'Active member'}{' '}
                    · Edit
                  </small>
                </summary>
                <ProfileEditor
                  key={profile.id}
                  profile={profile}
                  active={profile.id === activeProfileId}
                  onSave={saveProfile}
                  onArchive={archive}
                  onRoleChange={saveRole}
                  lastActiveMember={profiles.filter((item) => !item.archivedAt).length === 1}
                />
              </details>
            </Fragment>
          ))}
      </section>
      {adding ? (
        <ProfileOnboardingDialog
          aiEnabled={aiEnabled}
          onClose={() => setAdding(false)}
          onProfileCreated={() => {
            void reconcile().catch((error) => setError(error.message));
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
  onProfileCreated: () => void;
  aiEnabled: boolean;
}) {
  const [dismissal, setDismissal] = useState({ dirty: false, pending: false, completion: false });

  function closeDialog() {
    if (dismissal.pending || dismissal.completion) return;
    if (dismissal.dirty && !window.confirm('Discard this new profile draft?')) return;
    onClose();
  }

  return (
    <AppDialog
      className="profile-onboarding-dialog"
      id="profile-onboarding-dialog"
      aria-labelledby="profile-onboarding-dialog-title"
      onClose={closeDialog}
    >
      <h2 className="sr-only" id="profile-onboarding-dialog-title">
        New profile onboarding
      </h2>
      <button
        className="profile-onboarding-dialog-close"
        type="button"
        disabled={dismissal.pending || dismissal.completion}
        aria-label="Close profile onboarding"
        onClick={closeDialog}
      >
        <X size={20} aria-hidden="true" />
      </button>
      <OnboardingWizard
        aiEnabled={aiEnabled}
        mode="profile"
        onDismissStateChange={setDismissal}
        onCommitted={onProfileCreated}
        onCancel={closeDialog}
        onProfileCreated={() => {
          onProfileCreated();
          onClose();
        }}
      />
    </AppDialog>
  );
}

export function ProfileEditor({
  profile,
  active,
  onSave,
  onArchive,
  onRoleChange,
  personal = false,
  lastActiveMember = false,
}: {
  profile: Profile;
  personal?: boolean;
  lastActiveMember?: boolean;
  active: boolean;
  onSave: (profile: Profile, values: ProfileValues) => Promise<Profile | void>;
  onArchive: (profile: Profile, archived: boolean) => Promise<void>;
  onRoleChange: (profile: Profile, role: AppRole) => Promise<boolean>;
}) {
  const [actionError, setActionError] = useState('');
  const [action, setAction] = useState<'save' | 'role' | 'archive' | null>(null);
  const [lastAction, setLastAction] = useState<'save' | 'role' | 'archive' | null>(null);
  const [savedMessage, setSavedMessage] = useState('');
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
  const [saved, setSaved] = useState(values);
  const dirty = JSON.stringify(saved) !== JSON.stringify(values);
  const [avatarFailed, setAvatarFailed] = useState('');
  async function perform(kind: 'save' | 'role' | 'archive', task: () => Promise<unknown>) {
    setAction(kind);
    setLastAction(kind);
    setActionError('');
    await run(task);
    setAction(null);
  }
  const archived = Boolean(profile.archivedAt);
  const [roleDraft, setRoleDraft] = useState<{ confirmed: AppRole; value: AppRole } | null>(null);
  const role = roleDraft?.confirmed === profile.role ? roleDraft.value : profile.role;
  const setRole = (value: AppRole) => setRoleDraft({ confirmed: profile.role, value });

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
      eyebrow={
        personal
          ? 'YOUR PROFILE'
          : archived
            ? 'ARCHIVED PROFILE'
            : active
              ? 'ACTIVE PROFILE'
              : 'HOUSEHOLD PROFILE'
      }
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
          : 'Household identity and access role. Personal preferences are managed from My profile.'
      }
      actions={
        !personal && (
          <button
            className="text-button"
            type="button"
            disabled={pending || (!archived && (profile.isLastAdmin || active || lastActiveMember))}
            title={
              profile.isLastAdmin && !archived
                ? 'Promote another active profile to Admin before archiving this one.'
                : undefined
            }
            onClick={() =>
              void perform('archive', async () => {
                await onArchive(profile, !archived);
                setSavedMessage(archived ? 'Profile restored.' : 'Profile archived.');
              })
            }
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
      <form
        onChange={() => {
          setSavedMessage('');
          setActionError('');
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void perform('save', async () => {
            const submitted = personal
              ? {
                  ...values,
                  goalContext: {
                    ...values.goalContext,
                    kitchenInterview: profile.goalContext.kitchenInterview,
                  },
                }
              : values;
            const acknowledged = await onSave(profile, submitted);
            const next = acknowledged
              ? ({
                  ...values,
                  ...Object.fromEntries(
                    Object.keys(values).map((key) => [key, acknowledged[key as keyof Profile]]),
                  ),
                  avatarUrl: acknowledged.avatarUrl ?? '',
                } as ProfileValues)
              : values;
            setValues(next);
            setSaved(next);
            setSavedMessage(
              personal ? 'Profile and cooking preferences saved.' : 'Profile identity saved.',
            );
          });
        }}
      >
        <fieldset className="settings-form-fields" disabled={pending || archived}>
          <div className="settings-identity-preview">
            {values.avatarUrl && avatarFailed !== values.avatarUrl ? (
              <img
                src={values.avatarUrl}
                alt=""
                onError={() => setAvatarFailed(values.avatarUrl)}
              />
            ) : (
              <span
                className="settings-avatar-fallback"
                style={{ backgroundColor: values.color }}
                aria-hidden="true"
              >
                {values.displayName.slice(0, 1)}
              </span>
            )}
            <span>
              {values.displayName || 'Your profile'}
              {dirty ? ' · Unsaved preview' : ''}
            </span>
          </div>
          <div className="settings-fields">
            {!personal && (
              <>
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
                    onChange={(event) => setRole(event.target.value as AppRole)}
                  >
                    <option value="admin">Admin</option>
                    <option value="parent">Parent</option>
                    <option value="child">Child</option>
                  </select>
                </SettingsField>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={pending || role === profile.role}
                  onClick={() =>
                    void perform('role', async () => {
                      try {
                        if (!(await onRoleChange(profile, role))) setRole(profile.role);
                        else
                          setSavedMessage('Access role updated. Identity edits remain separate.');
                      } catch (error) {
                        setRole(profile.role);
                        throw error;
                      }
                    })
                  }
                >
                  {action === 'role' ? 'Updating role…' : 'Update role'}
                </button>
                {lastAction === 'role' && actionError && (
                  <p className="form-error" role="alert">
                    {actionError}
                  </p>
                )}
              </>
            )}
            <SettingsField
              description="The name shown on your profile and in shared kitchen activity."
              title="Display name"
            >
              <input
                required
                maxLength={80}
                value={values.displayName}
                onChange={(event) => setValues({ ...values, displayName: event.target.value })}
              />
            </SettingsField>
            <SettingsField
              description="Use a link to the picture you want shown with this profile."
              title="Avatar URL (optional)"
            >
              <input
                type="url"
                maxLength={2048}
                value={values.avatarUrl}
                onChange={(event) => setValues({ ...values, avatarUrl: event.target.value })}
              />
            </SettingsField>
            <SettingsField
              description="Helps distinguish this profile in shared views."
              title="Color"
            >
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
                  description="Choose a regional number, date and time format. Stored identifiers remain editable."
                  title="Regional format"
                >
                  <RegionalChoice
                    kind="locale"
                    required
                    value={values.locale}
                    onChange={(event) => setValues({ ...values, locale: event.target.value })}
                  />
                </SettingsField>
                <SettingsField
                  description="Choose a time zone independently of regional formatting."
                  title="Time zone"
                >
                  <RegionalChoice
                    kind="timezone"
                    required
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
                    description={`${values.goalContext.focusAreas.length} of 8 selected. At the limit, deselect a choice before adding another.`}
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
                  <details className="settings-disclosure">
                    <summary>More cooking context (optional)</summary>
                    <div className="settings-fields">
                      <SettingsField
                        description="Describe what is motivating your cooking goals."
                        title="Why it matters now"
                      >
                        <textarea
                          rows={3}
                          maxLength={800}
                          value={values.goalContext.motivation}
                          onChange={(event) =>
                            updateGoalContext({ motivation: event.target.value })
                          }
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
                          onChange={(event) =>
                            updateGoalContext({ challenges: event.target.value })
                          }
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
                          onChange={(event) =>
                            updateGoalContext({ successVision: event.target.value })
                          }
                        />
                      </SettingsField>
                    </div>
                  </details>
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
        </fieldset>
        {active && !personal && <p>Switch to another active profile before archiving this one.</p>}
        {lastActiveMember && !archived && (
          <p>The last active household member cannot be archived.</p>
        )}
        {actionError && lastAction !== 'role' ? <p role="alert">{actionError}</p> : null}
        <SettingsActionBar
          status={
            action
              ? action === 'save'
                ? 'Saving profile…'
                : action === 'role'
                  ? 'Updating access role…'
                  : 'Updating archive state…'
              : actionError ||
                (dirty
                  ? `${savedMessage ? savedMessage + ' ' : ''}Unsaved profile changes`
                  : savedMessage || 'No unsaved profile changes')
          }
        >
          <button
            className="primary-button compact"
            type="submit"
            disabled={pending || archived || !dirty || !values.displayName.trim()}
            aria-busy={pending}
          >
            {action === 'save' ? <ButtonSpinner /> : <Save size={16} />}{' '}
            {action === 'save' ? 'Saving…' : 'Save profile'}
          </button>
        </SettingsActionBar>
      </form>
    </SettingsPane>
  );
}
