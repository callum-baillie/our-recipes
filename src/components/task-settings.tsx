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
import { scheduledDraftExample } from '@/lib/domain/task-settings';
import { RegionalChoice } from './regional-choice';
import { SettingsPageHeader } from './settings-page-header';
import { AiActionCard, type AiDrawerAction } from './ai-action-card';
import { AsyncSkeleton, ButtonSpinner } from './skeleton';
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
  const [savingSettings, setSavingSettings] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [pendingJobAction, setPendingJobAction] = useState<{
    id: string;
    action: 'review' | 'cancel' | 'retry';
  } | null>(null);
  const [pendingDecision, setPendingDecision] = useState<{
    id: string;
    decision: 'confirm' | 'cancel';
  } | null>(null);
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});
  const [actions, setActions] = useState<AiDrawerAction[]>([]);
  const reviewSurface = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const [saved, setSaved] = useState(JSON.stringify(initial.settings));
  const [errorJobId, setErrorJobId] = useState<string | null>(null);
  const [pollError, setPollError] = useState('');
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
          setPollError('');
        }
      } catch (error) {
        if (active) setPollError(error instanceof Error ? error.message : 'Could not load tasks.');
      } finally {
        if (active) setJobsLoading(false);
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
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setSavingSettings(true);
    setStatus('');
    try {
      const response = await fetch('/api/v1/account/automation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: Object.fromEntries(
            Object.entries(settings).filter(
              ([key]) => key !== 'executionMode' && key !== 'batchMinItems',
            ),
          ),
          expectedVersion: version,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Settings could not be saved.');
      setVersion(body.version);
      setSettings(body.settings);
      setSaved(JSON.stringify(body.settings));
      setStatus('Automation preferences saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to save.');
    } finally {
      lock.current = false;
      setBusy(false);
      setSavingSettings(false);
    }
  }
  async function command(job: Job, command: 'retry' | 'cancel') {
    if (lock.current) return;
    lock.current = true;
    setErrorJobId(job.id);
    setJobError('');
    setBusy(true);
    setPendingJobAction({ id: job.id, action: command });
    try {
      const response = await fetch(`/api/v1/ai/jobs/${job.id}?personal=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Task could not be updated.');
      if (command === 'retry') retryDialog.current?.close();
      setJobs((current) =>
        body.job.id === job.id
          ? current.map((item) => (item.id === job.id ? body.job : item))
          : [...current.filter((item) => item.id !== body.job.id), body.job],
      );
    } catch (error) {
      setJobError(error instanceof Error ? error.message : 'Task update failed.');
    } finally {
      lock.current = false;
      setBusy(false);
      setPendingJobAction(null);
    }
  }
  async function review(job: Job) {
    if (!job.actionId || lock.current) return;
    lock.current = true;
    setErrorJobId(job.id);
    setJobError('');
    setBusy(true);
    setPendingJobAction({ id: job.id, action: 'review' });
    try {
      const response = await fetch(`/api/v1/ai/actions/${job.actionId}?personal=true`);
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.message ?? 'Select your own profile from the user menu to review this draft.',
        );
      setActions(body.action ? [body.action] : []);
      requestAnimationFrame(() => {
        reviewSurface.current?.focus();
        reviewSurface.current?.scrollIntoView({ block: 'start' });
      });
    } catch (error) {
      setJobError(error instanceof Error ? error.message : 'Could not open draft.');
    } finally {
      lock.current = false;
      setBusy(false);
      setPendingJobAction(null);
    }
  }
  async function decide(
    id: string,
    decision: 'confirm' | 'cancel',
    conflictResolutions?: Array<{ entryId: string; resolution: 'keep' | 'replace' }>,
  ) {
    if (lock.current) return;
    lock.current = true;
    setReviewErrors((current) => ({ ...current, [id]: '' }));
    setBusy(true);
    setPendingDecision({ id, decision });
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
      setReviewErrors((current) => ({
        ...current,
        [id]: error instanceof Error ? error.message : 'Draft update failed.',
      }));
    } finally {
      lock.current = false;
      setBusy(false);
      setPendingDecision(null);
    }
  }
  const schedule = scheduledDraftExample(settings, new Date(), initial.lastScheduledDate);
  return (
    <main className="recipe-page settings-hub">
      <SettingsPageHeader
        eyebrow="MY AUTOMATION"
        title="Schedules & background tasks"
        description="Prepare future meal-plan drafts for review and follow your personal tasks."
      />
      <form
        onChange={() => setStatus('')}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <SettingsPane
          title="AI processing preferences"
          description="Choose task models and Direct or Batch processing in your AI preferences. Existing queued tasks retain their selected processing mode."
        >
          <a className="text-button" href="/account/ai">
            Open my AI preferences
          </a>
        </SettingsPane>
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
                  <RegionalChoice
                    kind="timezone"
                    required
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
          {settings.weeklyPlanEnabled && (
            <p>
              <strong>Scheduled draft:</strong>{' '}
              {
                ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
                  settings.weekday
                ]
              }{' '}
              at {String(settings.hour).padStart(2, '0')}:00 ({settings.timezone}); {settings.days}{' '}
              days starting {settings.aheadDays} {settings.aheadDays === 1 ? 'day' : 'days'} after
              that run ·{' '}
              {profiles
                .filter((profile) =>
                  (settings.selectedProfileIds ?? [profileId]).includes(profile.id),
                )
                .map((profile) => profile.name)
                .join(', ')}{' '}
              · {settings.mealSlots.join(', ')}.
            </p>
          )}
          {schedule && settings.weeklyPlanEnabled && (
            <p>
              Prospective run date: {schedule.runDate} · Plan {schedule.start}–{schedule.end}. A
              running server must perform the scheduled check; this is not a completed or applied
              plan.
            </p>
          )}
          <p>
            Scheduled runs create a draft below. Existing meals are kept; review and confirm the
            draft before it changes your planner. The app must be running on the scheduled day. Last
            scheduled: {initial.lastScheduledDate ?? 'Never'}.
          </p>
        </SettingsGroup>
        <SettingsActionBar
          status={
            status ||
            (JSON.stringify(settings) !== saved
              ? 'Unsaved schedule changes'
              : 'No unsaved schedule changes')
          }
        >
          <button className="primary-button" disabled={busy || !canEdit} aria-busy={savingSettings}>
            {savingSettings ? <ButtonSpinner /> : null}
            {savingSettings ? 'Saving…' : 'Save schedule'}
          </button>
        </SettingsActionBar>
      </form>
      <SettingsPane
        title="Background tasks"
        description="Progress refreshes every 10 seconds. Generated drafts can be reviewed and confirmed for 24 hours."
      >
        <SettingsSubsection title="Recent tasks">
          {jobsLoading ? (
            <AsyncSkeleton label="Loading recent background tasks" variant="rows" />
          ) : (
            <>
              {pollError && (
                <p role="alert">{pollError} Last known tasks are retained; polling will retry.</p>
              )}
              {jobError && !errorJobId && <p role="alert">{jobError}</p>}
              {!jobs.length && !jobError && !pollError && (
                <SettingsEmpty>No background tasks yet.</SettingsEmpty>
              )}
            </>
          )}
          {[...jobs].reverse().map((job) => (
            <article className={`settings-item ${styles.job}`} key={job.id}>
              <div>
                <strong>{job.title}</strong>
                {jobError && errorJobId === job.id && <p role="alert">{jobError}</p>}
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
                  <button
                    type="button"
                    disabled={busy}
                    aria-busy={
                      pendingJobAction?.id === job.id && pendingJobAction.action === 'review'
                    }
                    onClick={() => void review(job)}
                  >
                    {pendingJobAction?.id === job.id && pendingJobAction.action === 'review' ? (
                      <ButtonSpinner />
                    ) : null}
                    {pendingJobAction?.id === job.id && pendingJobAction.action === 'review'
                      ? 'Opening draft…'
                      : 'Review draft'}
                  </button>
                )}
                {['queued', 'running', 'submitted'].includes(job.status) ? (
                  <button
                    type="button"
                    disabled={busy || !canEdit}
                    aria-busy={
                      pendingJobAction?.id === job.id && pendingJobAction.action === 'cancel'
                    }
                    onClick={() => void command(job, 'cancel')}
                  >
                    {pendingJobAction?.id === job.id && pendingJobAction.action === 'cancel' ? (
                      <ButtonSpinner />
                    ) : null}
                    {pendingJobAction?.id === job.id && pendingJobAction.action === 'cancel'
                      ? 'Cancelling…'
                      : 'Cancel'}
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
      <div
        ref={reviewSurface}
        id="task-draft-review"
        tabIndex={-1}
        aria-label="Generated draft review"
      >
        {actions.map((action) => (
          <div key={action.id}>
            <AiActionCard
              action={action}
              busy={busy}
              pendingDecision={pendingDecision?.id === action.id ? pendingDecision.decision : null}
              onDecide={(...args) => void decide(...args)}
            />
            {reviewErrors[action.id] && (
              <p role="alert" className="form-error">
                {reviewErrors[action.id]}
              </p>
            )}
          </div>
        ))}
      </div>
      <dialog
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
        ref={retryDialog}
        aria-labelledby="retry-task-title"
        className={styles.retryDialog}
      >
        <h2 id="retry-task-title">Retry unfinished work?</h2>
        <p>
          This can make paid AI requests for unfinished items. Successful results are kept. Work
          already sent before cancellation may still be billed by the provider.
        </p>
        {jobError && <p role="alert">{jobError}</p>}
        <div className={styles.actions}>
          <button type="button" disabled={busy} onClick={() => retryDialog.current?.close()}>
            Keep current results
          </button>
          <button
            type="button"
            disabled={busy || !canEdit}
            aria-busy={
              pendingJobAction?.action === 'retry' && pendingJobAction.id === retryTarget?.id
            }
            onClick={() => {
              if (retryTarget) void command(retryTarget, 'retry');
            }}
          >
            {pendingJobAction?.action === 'retry' && pendingJobAction.id === retryTarget?.id ? (
              <ButtonSpinner />
            ) : null}
            {pendingJobAction?.action === 'retry' && pendingJobAction.id === retryTarget?.id
              ? 'Retrying…'
              : 'Retry task'}
          </button>
        </div>
      </dialog>
    </main>
  );
}
