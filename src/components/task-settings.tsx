'use client';
import {
  SettingsField,
  SettingsGroup,
  SettingsPane,
  SettingsSubsection,
  SettingsActionBar,
  SettingsRow,
  SettingsEmpty,
} from './settings-primitives';
import { useEffect, useRef, useState } from 'react';
import { SettingsPageHeader } from './settings-page-header';
import { AiActionCard, type AiDrawerAction } from './ai-action-card';
import type { TaskSettings as Preferences } from '@/lib/domain/task-settings';
import styles from './task-settings.module.css';
type Job = {
  id: string;
  title: string;
  status: string;
  executionMode: string;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  errorCode: string | null;
  threadId: string | null;
  actionId: string | null;
};
export function TaskSettings({
  initial,
  profileId,
  profiles,
  canEdit,
}: {
  initial: { settings: Preferences; version: number; lastScheduledDate: string | null };
  profileId: string;
  profiles: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const [settings, setSettings] = useState(initial.settings);
  const [version, setVersion] = useState(initial.version);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [actions, setActions] = useState<AiDrawerAction[]>([]);
  const [jobError, setJobError] = useState('');
  const [retryTarget, setRetryTarget] = useState<Job | null>(null);
  const retryDialog = useRef<HTMLDialogElement>(null);
  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    setSettings((current) => ({ ...current, [key]: value }));
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('/api/v1/ai/jobs?personal=true', { cache: 'no-store' });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message ?? 'Tasks could not be loaded.');
        if (active) {
          setJobs(body.jobs);
          setJobError('');
        }
      } catch (error) {
        if (active) setJobError(error instanceof Error ? error.message : 'Could not load tasks.');
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  async function save() {
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch('/api/v1/account/automation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings, expectedVersion: version }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Settings could not be saved.');
      setVersion(body.version);
      setStatus('Automation preferences saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to save.');
    } finally {
      setBusy(false);
    }
  }
  async function command(job: Job, command: 'retry' | 'cancel') {
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/ai/jobs/${job.id}?personal=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Task could not be updated.');
      setJobs((current) =>
        body.job.id === job.id
          ? current.map((item) => (item.id === job.id ? body.job : item))
          : [...current.filter((item) => item.id !== body.job.id), body.job],
      );
    } catch (error) {
      setJobError(error instanceof Error ? error.message : 'Task update failed.');
    } finally {
      setBusy(false);
    }
  }
  async function review(job: Job) {
    if (!job.actionId) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/ai/actions/${job.actionId}?personal=true`);
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.message ?? 'Select your own profile from the user menu to review this draft.',
        );
      setActions(body.action ? [body.action] : []);
    } catch (error) {
      setJobError(error instanceof Error ? error.message : 'Could not open draft.');
    } finally {
      setBusy(false);
    }
  }
  async function decide(
    id: string,
    decision: 'confirm' | 'cancel',
    conflictResolutions?: Array<{ entryId: string; resolution: 'keep' | 'replace' }>,
  ) {
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/ai/actions/${id}?personal=true`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, ...(conflictResolutions ? { conflictResolutions } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Draft could not be updated.');
      setActions((current) => current.map((action) => (action.id === id ? body.action : action)));
    } catch (error) {
      setJobError(error instanceof Error ? error.message : 'Draft update failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="recipe-page settings-hub">
      <SettingsPageHeader
        eyebrow="MY AUTOMATION"
        title="Schedules & background tasks"
        description="Choose how your AI work runs and prepare future meal plans for review."
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <SettingsGroup
          title={<>Bulk processing</>}
          disabled={busy || !canEdit}
          className={styles.panel}
        >
          <SettingsField
            description="Choose direct processing or Batch for queued recipe and image requests."
            title="Recipe and image jobs"
          >
            <select
              value={settings.executionMode}
              onChange={(event) =>
                set('executionMode', event.target.value as Preferences['executionMode'])
              }
            >
              <option value="auto">Automatic — batch larger jobs</option>
              <option value="direct">Direct — finish sooner</option>
              <option value="batch">Batch — lower cost, up to 24 hours</option>
            </select>
          </SettingsField>
          <p>
            Batch applies to bulk recipe drafts and recipe images. Meal-plan generation runs as a
            separate queued task. Existing queued tasks keep their selected mode; retries use the
            current preference.
          </p>
          {settings.executionMode === 'auto' && (
            <SettingsField
              description="Automatic mode uses Batch when a job reaches this size."
              title="Use Batch at this many items"
            >
              <input
                type="number"
                min="2"
                max="50"
                value={settings.batchMinItems}
                onChange={(event) => set('batchMinItems', Number(event.target.value))}
              />
            </SettingsField>
          )}
        </SettingsGroup>
        <SettingsGroup
          title={<>Weekly meal-plan draft</>}
          disabled={busy || !canEdit}
          className={styles.panel}
        >
          <SettingsField
            description="Create a draft on a schedule. Review it before changing your planner."
            title="Prepare a plan automatically each week"
          >
            <input
              role="switch"
              type="checkbox"
              checked={settings.weeklyPlanEnabled}
              onChange={(event) => set('weeklyPlanEnabled', event.target.checked)}
            />
          </SettingsField>
          {settings.weeklyPlanEnabled && (
            <>
              <div className={`settings-fields ${styles.grid}`}>
                <SettingsField
                  description="The day of the week to prepare the meal-plan draft."
                  title="Day"
                >
                  <select
                    value={settings.weekday}
                    onChange={(event) => set('weekday', Number(event.target.value))}
                  >
                    {[
                      'Sunday',
                      'Monday',
                      'Tuesday',
                      'Wednesday',
                      'Thursday',
                      'Friday',
                      'Saturday',
                    ].map((day, index) => (
                      <option key={day} value={index}>
                        {day}
                      </option>
                    ))}
                  </select>
                </SettingsField>
                <SettingsField
                  description="The local hour at which the scheduled draft becomes due."
                  title="Hour (24-hour clock)"
                >
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={settings.hour}
                    onChange={(event) => set('hour', Number(event.target.value))}
                  />
                </SettingsField>
                <SettingsField
                  description="The IANA timezone used by this schedule, such as America/Chicago."
                  title="Timezone"
                >
                  <input
                    value={settings.timezone}
                    onChange={(event) => set('timezone', event.target.value)}
                  />
                </SettingsField>
                <SettingsField
                  description="Count forward from the day the draft is generated."
                  title="Start plan this many days later"
                >
                  <input
                    type="number"
                    min="0"
                    max="14"
                    value={settings.aheadDays}
                    onChange={(event) => set('aheadDays', Number(event.target.value))}
                  />
                </SettingsField>
                <SettingsField
                  description="The number of consecutive days included in each draft."
                  title="Days to plan"
                >
                  <input
                    type="number"
                    min="1"
                    max="7"
                    value={settings.days}
                    onChange={(event) => set('days', Number(event.target.value))}
                  />
                </SettingsField>
                <SettingsField
                  description="The requested starting serving count for generated meals."
                  title="Servings per meal"
                >
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={settings.servings}
                    onChange={(event) => set('servings', Number(event.target.value))}
                  />
                </SettingsField>
              </div>
              <SettingsRow
                title="Meals to include"
                description="Choose the meal slots to prepare in each scheduled draft."
                align="start"
              >
                <div className={styles.choices}>
                  {(['breakfast', 'lunch', 'dinner', 'dessert', 'snack'] as const).map((meal) => (
                    <label className={styles.check} key={meal}>
                      <input
                        type="checkbox"
                        checked={settings.mealSlots.includes(meal)}
                        onChange={(event) =>
                          set(
                            'mealSlots',
                            event.target.checked
                              ? [...settings.mealSlots, meal]
                              : settings.mealSlots.filter((item) => item !== meal),
                          )
                        }
                      />
                      {meal}
                    </label>
                  ))}
                </div>
              </SettingsRow>
              <SettingsField
                description="Choose whether plans use your recipebook, new recipes, or both."
                title="Recipes"
              >
                <select
                  value={settings.sourceMode}
                  onChange={(event) =>
                    set('sourceMode', event.target.value as Preferences['sourceMode'])
                  }
                >
                  <option value="existing">Use my recipebook</option>
                  <option value="mix">Recipebook and new recipes</option>
                  <option value="new">New recipe drafts</option>
                </select>
              </SettingsField>
              <SettingsSubsection
                title="People to plan for"
                description="Choose which household members to include in the draft."
              >
                {profiles.map((profile) => (
                  <SettingsField key={profile.id} title={<>{profile.name}</>}>
                    <input
                      role="switch"
                      type="checkbox"
                      checked={(settings.selectedProfileIds ?? [profileId]).includes(profile.id)}
                      onChange={(event) =>
                        set(
                          'selectedProfileIds',
                          event.target.checked
                            ? [...(settings.selectedProfileIds ?? [profileId]), profile.id]
                            : (settings.selectedProfileIds ?? [profileId]).filter(
                                (id) => id !== profile.id,
                              ),
                        )
                      }
                    />
                  </SettingsField>
                ))}
              </SettingsSubsection>
              <SettingsField
                description="Add household preferences and practical constraints for each draft."
                title="Planning instructions"
              >
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={settings.instructions}
                  onChange={(event) => set('instructions', event.target.value)}
                  placeholder="For example: quick weekday lunches, dinners that make leftovers."
                />
              </SettingsField>
              <SettingsField
                description="The enabled schedule can send requests using the configured provider key."
                title="I authorize paid AI requests for this enabled weekly schedule."
              >
                <input
                  type="checkbox"
                  checked={settings.allowPaidGeneration}
                  onChange={(event) => set('allowPaidGeneration', event.target.checked)}
                />
              </SettingsField>
            </>
          )}
          <p>
            Scheduled runs create a draft below. Existing meals are kept; review and confirm the
            draft before it changes your planner. The app must be running on the scheduled day. Last
            scheduled: {initial.lastScheduledDate ?? 'Never'}.
          </p>
        </SettingsGroup>
        <SettingsActionBar status={status}>
          <button className="primary-button" disabled={busy || !canEdit}>
            {busy ? 'Saving…' : 'Save preferences'}
          </button>
        </SettingsActionBar>
      </form>
      <SettingsPane
        title="Background tasks"
        description="Progress refreshes every 10 seconds. Generated drafts can be reviewed and confirmed for 24 hours."
      >
        <SettingsSubsection title="Recent tasks">
          {jobError && <p role="alert">{jobError}</p>}
          {!jobs.length && <SettingsEmpty>No background tasks yet.</SettingsEmpty>}
          {[...jobs].reverse().map((job) => (
            <article className={`settings-item ${styles.job}`} key={job.id}>
              <div>
                <strong>{job.title}</strong>
                <p>
                  {job.status.replaceAll('_', ' ')} · {job.executionMode}
                  {job.totalItems ? ` · ${job.completedItems}/${job.totalItems} completed` : ''}
                  {job.failedItems ? ` · ${job.failedItems} failed` : ''}
                </p>
                {job.totalItems > 0 && (
                  <progress
                    max={job.totalItems}
                    value={job.completedItems}
                    aria-label={`${job.title} progress`}
                  />
                )}{' '}
                {!job.totalItems && job.status === 'running' && (
                  <progress aria-label="Preparing meal-plan draft" />
                )}
                {job.errorCode && (
                  <small>
                    {(
                      {
                        worker_failed:
                          'This task stopped. Review its progress before retrying unfinished work.',
                        partial_failure:
                          'Some items need another attempt. Completed results are ready to review.',
                        worker_interrupted_review_before_retry:
                          'The worker was interrupted. A paid request may already have been sent; review before retrying.',
                        provider_poll_retry_pending:
                          'Waiting for the provider. The same batch will be checked again automatically.',
                        cancelled_provider_confirmation_pending:
                          'Stopped locally; the provider has not confirmed cancellation.',
                      } as Record<string, string>
                    )[job.errorCode] ?? job.errorCode.replaceAll('_', ' ')}
                  </small>
                )}
              </div>
              <div className={styles.actions}>
                {job.actionId && (
                  <button type="button" disabled={busy} onClick={() => void review(job)}>
                    Review draft
                  </button>
                )}
                {['queued', 'running', 'submitted'].includes(job.status) ? (
                  <button
                    type="button"
                    disabled={busy || !canEdit}
                    onClick={() => void command(job, 'cancel')}
                  >
                    Cancel
                  </button>
                ) : ['failed', 'cancelled'].includes(job.status) ? (
                  <button
                    type="button"
                    disabled={busy || !canEdit}
                    onClick={() => {
                      setRetryTarget(job);
                      retryDialog.current?.showModal();
                    }}
                  >
                    Retry unfinished
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </SettingsSubsection>
      </SettingsPane>
      {actions.map((action) => (
        <AiActionCard
          key={action.id}
          action={action}
          busy={busy}
          onDecide={(...args) => void decide(...args)}
        />
      ))}
      <dialog ref={retryDialog} aria-labelledby="retry-task-title" className={styles.retryDialog}>
        <h2 id="retry-task-title">Retry unfinished work?</h2>
        <p>
          This can make paid AI requests for unfinished items. Successful results are kept. Work
          already sent before cancellation may still be billed by the provider.
        </p>
        <div className={styles.actions}>
          <button type="button" onClick={() => retryDialog.current?.close()}>
            Keep current results
          </button>
          <button
            type="button"
            disabled={busy || !canEdit}
            onClick={() => {
              retryDialog.current?.close();
              if (retryTarget) void command(retryTarget, 'retry');
            }}
          >
            Retry task
          </button>
        </div>
      </dialog>
    </main>
  );
}
