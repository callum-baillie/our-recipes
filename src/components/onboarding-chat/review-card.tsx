'use client';

import { Pencil, ShieldCheck, Trash2 } from 'lucide-react';
import { Fragment } from 'react';

import { BrandIcon } from '@/components/brand-icon';
import { brandIconLabel } from '@/lib/appearance';
import { hasProfileGoalContext, summarizeProfileGoals } from '@/lib/domain/profile-goals';

import { firstRecipeChoices, type ChatProfile, type ChatState } from './flow';
import styles from './onboarding-chat.module.css';

function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() ?? '?';
}

const nutritionSummary = (item: ChatProfile): string => {
  if (item.nutritionPath === 'later' || item.nutritionPath === 'unset') return 'Set up later';
  const dietary =
    item.nutrition.dietaryPreferences.length +
    item.nutrition.foodAllergies.length +
    item.nutrition.dietaryExclusions.length;
  const goal = {
    none: 'Tracking nutrition',
    maintain: 'Maintaining weight',
    loss: 'Weight loss goal',
    gain: 'Weight gain goal',
    custom: 'Own plan',
  }[item.nutrition.nutritionGoalType];
  return [goal, dietary ? `${dietary} dietary note${dietary === 1 ? '' : 's'}` : null]
    .filter(Boolean)
    .join(' · ');
};

export function ReviewCard({
  state,
  disabled,
  onChange,
  onRemove,
}: {
  state: ChatState;
  disabled: boolean;
  onChange: (section: string) => void;
  onRemove: (profileId: number) => void;
}) {
  const initial = state.mode === 'initial';
  const recipe = firstRecipeChoices.find((option) => option.value === state.firstRecipeChoice);
  return (
    <div className={styles.review} data-testid="onboarding-review">
      <dl className={styles.reviewList}>
        {initial ? (
          <div className={styles.reviewRow}>
            <dt>Kitchen</dt>
            <dd>
              <span className={styles.reviewKitchen}>
                <BrandIcon icon={state.brandIcon} size={18} />
                <strong>{state.kitchenName}</strong>
                <small>{brandIconLabel(state.brandIcon)} icon</small>
              </span>
              <button
                className="text-button"
                type="button"
                disabled={disabled}
                onClick={() => onChange('kitchen')}
                aria-label="Change kitchen name"
              >
                <Pencil size={14} aria-hidden="true" /> Change
              </button>
            </dd>
          </div>
        ) : null}
        {state.profiles.map((item, index) => (
          <Fragment key={item.localId}>
            <div className={styles.reviewRow}>
              <dt>{state.profiles.length > 1 ? `Profile ${index + 1}` : 'Profile'}</dt>
              <dd>
                <span className={styles.reviewProfile}>
                  <span
                    className={styles.avatar}
                    style={{ backgroundColor: item.profile.color }}
                    aria-hidden="true"
                  >
                    {initialOf(item.profile.displayName)}
                  </span>
                  <span>
                    <strong>{item.profile.displayName}</strong>
                    <small>
                      {item.credentials.email} ·{' '}
                      {index === 0 && initial
                        ? 'Admin'
                        : `${item.role[0]!.toUpperCase()}${item.role.slice(1)}`}{' '}
                      · {item.profile.units === 'imperial' ? 'US customary' : 'Metric'}
                    </small>
                  </span>
                </span>
                <span className={styles.reviewActions}>
                  <button
                    className="text-button"
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(`identity:${item.localId}`)}
                    aria-label={`Edit ${item.profile.displayName}`}
                  >
                    <Pencil size={14} aria-hidden="true" /> Change
                  </button>
                  {index > 0 ? (
                    <button
                      className="text-button danger-text-button"
                      type="button"
                      disabled={disabled}
                      onClick={() => onRemove(item.localId)}
                      aria-label={`Remove ${item.profile.displayName}`}
                    >
                      <Trash2 size={14} aria-hidden="true" /> Remove
                    </button>
                  ) : null}
                </span>
              </dd>
            </div>
            <div className={styles.reviewRow}>
              <dt>Nutrition</dt>
              <dd>
                <span>{nutritionSummary(item)}</span>
                <button
                  className="text-button"
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(`nutrition:${item.localId}`)}
                  aria-label={`Change nutrition for ${item.profile.displayName}`}
                >
                  <Pencil size={14} aria-hidden="true" /> Change
                </button>
              </dd>
            </div>
            <div className={styles.reviewRow}>
              <dt>Goals &amp; tastes</dt>
              <dd>
                <span>
                  {item.goalsPath === 'chat' &&
                  hasProfileGoalContext(item.profile.goalContext, item.profile.mainGoals)
                    ? summarizeProfileGoals(item.profile.goalContext, item.profile.mainGoals)
                    : 'Added later'}
                </span>
                <button
                  className="text-button"
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(`goals:${item.localId}`)}
                  aria-label={`Change goals for ${item.profile.displayName}`}
                >
                  <Pencil size={14} aria-hidden="true" /> Change
                </button>
              </dd>
            </div>
          </Fragment>
        ))}
        {initial ? (
          <div className={styles.reviewRow}>
            <dt>First recipe</dt>
            <dd>
              <span>{recipe?.label}</span>
              <button
                className="text-button"
                type="button"
                disabled={disabled}
                onClick={() => onChange('recipe')}
                aria-label="Change first recipe"
              >
                <Pencil size={14} aria-hidden="true" /> Change
              </button>
            </dd>
          </div>
        ) : null}
      </dl>
      <p className={styles.reviewNote}>
        <ShieldCheck size={15} aria-hidden="true" />
        <span>
          <strong>Trusted household reminder.</strong> Profiles personalize the app but do not
          restrict access. Keep this installation on a trusted network.
        </span>
      </p>
    </div>
  );
}
