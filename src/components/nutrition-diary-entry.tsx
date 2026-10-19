'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { NutritionEventFields, NutritionFeedback } from './nutrition-form-fields';
import { useNutritionDraft } from './use-nutrition-draft';
import { useNutritionRequest } from './use-nutrition-request';
import { createClientUuid } from '@/lib/client/client-uuid';
import {
  nutritionEventInstant,
  nutritionPortion,
  nutritionWallTime,
} from '@/lib/domain/nutrition-ui';
import type { DiaryEntry, ProfileSummary, NutrientDefinition } from './nutrition-dashboard';
import styles from './nutrition-dashboard.module.css';

type Task = 'correct' | 'copy_entry' | 'move' | 'reassign' | 'delete' | 'restore';
const labels: Record<Task, string> = {
  correct: 'Correct portion or nutrients',
  copy_entry: 'Copy entry',
  move: 'Move entry',
  reassign: 'Move to another person',
  delete: 'Delete entry',
  restore: 'Restore deleted entry',
};
export function NutritionDiaryEntry({
  entry,
  profile,
  profiles,
  definitions,
  today,
  onSaved,
}: {
  entry: DiaryEntry;
  profile: ProfileSummary;
  profiles: ProfileSummary[];
  definitions: NutrientDefinition[];
  today: string;
  onSaved?: (message: string) => void;
}) {
  const [task, setTask] = useState<Task | ''>('');
  const [busy, setBusy] = useState(false);
  const consumed = entry.state === 'eaten' || entry.state === 'corrected';
  const energy = entry.values.find((value) => value.nutrientCode === 'energy_kcal')?.amount;
  const options: Task[] = consumed
    ? ['correct', 'copy_entry', 'move', 'reassign', 'delete']
    : entry.state === 'deleted'
      ? ['restore']
      : ['delete'];
  return (
    <li className={styles.diaryRow}>
      <div className={styles.entryIdentity}>
        <strong>{entry.sourceNameSnapshot || `${entry.mealSlot} ${entry.state}`}</strong>
        <span>
          {nutritionPortion(entry)}
          {nutritionPortion(entry) ? ' · ' : ''}
          {entry.mealSlot} ·{' '}
          {new Intl.DateTimeFormat(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: profile.dailyResetTimezone ?? 'UTC',
          }).format(new Date(entry.occurredAt))}
        </span>
        <small>
          {entry.state}
          {entry.values.some((value) => value.estimated) ? ' · includes estimates' : ''} · revision{' '}
          {entry.revision}
        </small>
      </div>
      <span className={styles.entryAmount}>
        {consumed
          ? energy === undefined
            ? 'Calories unknown'
            : `${energy.toLocaleString()} kcal`
          : 'Not in consumed totals'}
      </span>
      <div className={styles.entryActions}>
        {profile.canManageProfile ? (
          <label>
            <span className="sr-only">Action for {entry.sourceNameSnapshot || entry.mealSlot}</span>
            <select
              value={task}
              disabled={busy}
              onChange={(event) => setTask(event.target.value as Task | '')}
            >
              <option value="">Entry actions</option>
              {options.map((option) => (
                <option key={option} value={option}>
                  {labels[option]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <small>Read only</small>
        )}
        <details>
          <summary className="recipe-disclosure-summary">
            Record details
            <ChevronDown size={16} />
          </summary>
          <p>
            State: {entry.state} · revision {entry.revision}
            {entry.revisionReason ? ` · ${entry.revisionReason}` : ''}. Only eaten or corrected food
            contributes to totals.
          </p>
          {consumed && (
            <ul>
              {entry.values.map((value) => (
                <li key={value.nutrientCode}>
                  {definitions.find((item) => item.code === value.nutrientCode)?.displayName ??
                    value.nutrientCode}
                  : {value.amount}{' '}
                  {definitions.find((item) => item.code === value.nutrientCode)?.canonicalUnit} ·{' '}
                  {Math.round(value.completeness * 100)}% coverage
                  {value.estimated ? ' · estimated' : ''}
                </li>
              ))}
            </ul>
          )}
        </details>
      </div>
      {task && (
        <DiaryEntryTask
          key={`${profile.id}:${entry.id}:${task}`}
          entry={entry}
          task={task}
          profile={profile}
          profiles={profiles}
          definitions={definitions}
          today={today}
          onClose={() => setTask('')}
          onBusy={setBusy}
          onSaved={onSaved}
        />
      )}
    </li>
  );
}

function DiaryEntryTask({
  entry,
  task,
  profile,
  profiles,
  definitions,
  today,
  onClose,
  onBusy,
  onSaved,
}: {
  entry: DiaryEntry;
  task: Task;
  profile: ProfileSummary;
  profiles: ProfileSummary[];
  definitions: NutrientDefinition[];
  today: string;
  onClose: () => void;
  onBusy: (busy: boolean) => void;
  onSaved?: (message: string) => void;
}) {
  const router = useRouter();
  const local = nutritionWallTime(new Date(entry.occurredAt), profile.dailyResetTimezone ?? 'UTC');
  const { draft, update, clear, notice } = useNutritionDraft<
    Record<string, string> & {
      date: string;
      time: string;
      occurrence: string;
      mealSlot: string;
      targetProfileId: string;
      portion: string;
      unit: string;
      reason: string;
      operationId: string;
    }
  >(`${profile.id}:entry:${entry.id}:${task}`, {
    date: local.slice(0, 10),
    time: local.slice(11),
    occurrence: '',
    mealSlot: entry.mealSlot,
    targetProfileId: profile.id,
    portion: String(entry.portionWeightGrams ?? entry.servingCount ?? entry.quantity ?? 1),
    unit: entry.unit ?? 'portion',
    reason: '',
    operationId: '',
    uncertain: '',
    ...Object.fromEntries(
      entry.values.map((value) => [`value-${value.nutrientCode}`, String(value.amount)]),
    ),
  });
  const request = useNutritionRequest(`${profile.id}:${entry.id}:${task}`);
  const target =
    (task === 'copy_entry' || task === 'reassign'
      ? profiles.find((item) => item.id === draft.targetProfileId)
      : profile) ?? profile;
  function change(patch: Record<string, string | undefined>) {
    update({
      ...Object.fromEntries(
        Object.entries(patch).filter((item): item is [string, string] => item[1] !== undefined),
      ),
      operationId: '',
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !profile.canManageProfile ||
      request.isPending() ||
      (draft.uncertain && ['correct', 'delete'].includes(task))
    )
      return;
    onBusy(true);
    try {
      let url = `/api/v1/nutrition/profiles/${profile.id}/`;
      let body: object;
      const replay = !['correct', 'delete'].includes(task);
      if (task === 'delete') {
        if (
          !window.confirm(
            `Delete ${entry.sourceNameSnapshot || 'this skipped record'}? This adds deletion history; it does not erase earlier revisions.`,
          )
        )
          return;
        url += `intake/${entry.id}/delete`;
        body = { reason: draft.reason };
      } else if (task === 'correct') {
        const common = {
          occurredAt: entry.occurredAt,
          mealSlot: entry.mealSlot,
          supersedesIntakeRevisionId: entry.id,
          revisionReason: draft.reason,
        };
        if (entry.sourceType === 'recipe') {
          url += 'intake/recipe';
          body = {
            ...common,
            recipeCalculationId: entry.recipeCalculationId,
            servingCount: entry.portionWeightGrams != null ? null : Number(draft.portion),
            portionWeightGrams: entry.portionWeightGrams != null ? Number(draft.portion) : null,
          };
        } else if (entry.sourceType === 'product') {
          url += 'intake/product';
          body = {
            ...common,
            productId: entry.productId,
            quantity: Number(draft.portion),
            unit: draft.unit,
          };
        } else {
          url += 'intake/manual';
          body = {
            ...common,
            sourceName: entry.sourceNameSnapshot,
            quantity: Number(draft.portion),
            unit: draft.unit,
            values: entry.values.flatMap((value) =>
              draft[`value-${value.nutrientCode}`]?.trim()
                ? [
                    {
                      nutrientCode: value.nutrientCode,
                      amount: Number(draft[`value-${value.nutrientCode}`]),
                    },
                  ]
                : [],
            ),
          };
        }
      } else {
        const key = draft.operationId || createClientUuid();
        update({ operationId: key });
        url += 'diary-commands';
        body = {
          command: task,
          sourceRevisionId: entry.id,
          idempotencyKey: key,
          ...(task === 'restore'
            ? { reason: draft.reason }
            : {
                occurredAt: nutritionEventInstant(
                  draft.date,
                  draft.time,
                  target.dailyResetTimezone ?? 'UTC',
                  draft.occurrence,
                ),
                mealSlot: draft.mealSlot,
                ...(task === 'copy_entry' || task === 'reassign'
                  ? { targetProfileId: target.id }
                  : {}),
                ...(task === 'move' || task === 'reassign' ? { reason: draft.reason } : {}),
              }),
        };
      }
      const result = await request.send(task, url, body, { replay, pending: `${labels[task]}…` });
      if (!result) {
        if (request.isUncertain(task)) update({ uncertain: 'yes' });
        return;
      }
      request.message(
        task,
        'success',
        task === 'restore'
          ? 'Entry restored. Its confirmed food values contribute to the applicable day again.'
          : `${labels[task]} saved${task === 'copy_entry' || task === 'reassign' ? ` for ${target.displayName}` : ''}.`,
      );
      onSaved?.(`${labels[task]} saved for ${target.displayName}.`);
      clear();
      router.refresh();
    } catch (error) {
      request.message(
        task,
        'error',
        error instanceof Error ? error.message : 'Check the entered values.',
      );
    } finally {
      onBusy(false);
    }
  }
  return (
    <form className={styles.entryTask} onSubmit={submit}>
      <h3>{labels[task]}</h3>
      {notice && <p className={styles.helper}>{notice}</p>}
      <fieldset
        className={styles.formFields}
        disabled={request.pending || Boolean(draft.uncertain)}
      >
        {task === 'correct' && (
          <>
            <div className={styles.formGrid}>
              <label>
                {entry.sourceType === 'recipe'
                  ? entry.portionWeightGrams != null
                    ? 'Amount consumed (g)'
                    : 'Servings'
                  : 'Amount consumed'}
                <input
                  type="number"
                  min="0.000001"
                  step="any"
                  value={draft.portion}
                  onChange={(event) => change({ portion: event.target.value })}
                  required
                />
              </label>
              {entry.sourceType !== 'recipe' && (
                <label>
                  Unit
                  <input
                    value={draft.unit}
                    maxLength={30}
                    onChange={(event) => change({ unit: event.target.value })}
                    required
                  />
                </label>
              )}
            </div>
            {entry.sourceType === 'manual' && (
              <fieldset className={styles.nutrientFields}>
                <legend>Total nutrients for the entire corrected amount</legend>
                <p className={styles.helper}>
                  Amounts are not multiplied. Review them when changing the portion; blank removes
                  that nutrient from this revision.
                </p>
                <div className={styles.formGrid}>
                  {entry.values.map((value) => (
                    <label key={value.nutrientCode}>
                      {definitions.find((item) => item.code === value.nutrientCode)?.displayName ??
                        value.nutrientCode}{' '}
                      ({definitions.find((item) => item.code === value.nutrientCode)?.canonicalUnit}
                      )
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={draft[`value-${value.nutrientCode}`] ?? ''}
                        onChange={(event) =>
                          change({ [`value-${value.nutrientCode}`]: event.target.value })
                        }
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </>
        )}
        {(task === 'copy_entry' || task === 'reassign') && (
          <label>
            Destination person
            <select
              value={draft.targetProfileId}
              onChange={(event) => change({ targetProfileId: event.target.value })}
            >
              {profiles
                .filter((item) => task === 'reassign' || item.canManageProfile)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.displayName}
                  </option>
                ))}
            </select>
          </label>
        )}
        {['copy_entry', 'move', 'reassign'].includes(task) && (
          <NutritionEventFields
            draft={draft}
            update={change}
            timeZone={target.dailyResetTimezone ?? 'UTC'}
            today={today}
          />
        )}
        {task !== 'copy_entry' && (
          <label>
            Reason
            <input
              value={draft.reason}
              onChange={(event) => change({ reason: event.target.value })}
              maxLength={500}
              required
            />
          </label>
        )}
        {task === 'restore' && (
          <p className={styles.helper}>
            Restoring creates a new revision and returns the original confirmed food to totals; the
            deletion remains in history.
          </p>
        )}
      </fieldset>
      <button
        className={task === 'delete' ? styles.destructiveAction : styles.primaryAction}
        type="submit"
        disabled={
          request.pending ||
          !profile.canManageProfile ||
          (Boolean(draft.uncertain) && ['correct', 'delete'].includes(task))
        }
      >
        {request.pending ? 'Saving…' : draft.uncertain ? 'Retry exact request' : labels[task]}
      </button>
      {draft.uncertain && (
        <p className={styles.helper}>
          Check the current diary before starting a different operation. This draft stays in this
          tab.{' '}
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  'Have you checked whether this request saved? Starting fresh uses a new operation.',
                )
              ) {
                clear();
                window.location.reload();
              }
            }}
          >
            Start fresh after checking
          </button>
        </p>
      )}
      <NutritionFeedback value={request.feedback[task]} />
      <button type="button" onClick={onClose} disabled={request.pending}>
        Close editor
      </button>
    </form>
  );
}
