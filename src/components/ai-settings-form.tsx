'use client';

import { useState } from 'react';

import { InlineSkeleton } from '@/components/skeleton';
import { SettingsPane } from '@/components/settings-primitives';

import styles from './ai-settings-form.module.css';

type Workload = {
  workload: string;
  model: string;
  reasoningEffort: string | null;
  enabled: boolean;
  version: number;
};
type Policy = Record<string, boolean | number | string> & { version: number };
type CatalogModel = {
  id: string;
  label: string;
  workloads: readonly string[];
  reasoning: readonly string[];
};
type Settings = {
  workloads: Workload[];
  dataPolicy: Policy;
  modelCatalog: readonly CatalogModel[];
};

const policyFields = [
  ['shareSharedRecipes', 'Shared recipes', 'Titles, ingredients, tags, and recipe details.'],
  ['shareMealPlans', 'Meal plans', 'Planned dates, meal slots, servings, and notes.'],
  [
    'shareDietaryPreferences',
    'Dietary preferences',
    'Preferences, allergies, and exclusions you recorded.',
  ],
  ['shareRecipePreferences', 'Recipe preferences', 'Ratings and preference signals.'],
  [
    'shareProfileGoals',
    'Goals and motivations',
    'The outcomes, obstacles, and personal context recorded during profile setup.',
  ],
  ['shareNutritionGoals', 'Nutrition goals', 'Targets and ranges configured for this profile.'],
  ['shareNutritionAggregates', 'Nutrition summaries', 'Daily and seven-day totals and trends.'],
  ['shareRawDiary', 'Raw nutrition diary', 'Individual logged foods and nutrient values.'],
  ['shareIdentity', 'Name and identity', 'Your household display name.'],
  ['sharePersonalMetrics', 'Personal metrics', 'Height, activity, sex category, and life stage.'],
  ['shareWeight', 'Weight', 'Current and target weight.'],
  ['shareShoppingLists', 'Shopping lists', 'List names, sources, completion, and store names.'],
] as const;

const summaryFields = [
  [
    'summaryNutritionEnabled',
    'Nutrition',
    'Patterns, goal progress, coverage, and useful metrics.',
  ],
  ['summaryMealPlansEnabled', 'Meal plans', 'Upcoming coverage, repetition, and planning gaps.'],
  [
    'summaryShoppingListsEnabled',
    'Shopping lists',
    'Remaining items, completion, and list activity.',
  ],
  ['summaryRecipesEnabled', 'Recipes', 'Library variety, recent additions, and useful gaps.'],
] as const;

function label(value: string) {
  if (value === 'nutrition_summary') return 'household summaries';
  return value.replaceAll('_', ' ');
}

export function AiSettingsForm({ initialSettings }: { initialSettings: Settings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState('');
  const imageGeneration = settings.workloads.find((item) => item.workload === 'image_generation');

  function updateWorkload(index: number, changes: Partial<Workload>) {
    setSettings((current) => ({
      ...current,
      workloads: current.workloads.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...changes } : item,
      ),
    }));
  }

  async function persistSettings(): Promise<Settings> {
    const response = await fetch('/api/v1/ai/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workloads: settings.workloads, dataPolicy: settings.dataPolicy }),
    });
    const body = (await response.json()) as Settings & { error?: { message?: string } };
    if (!response.ok) throw new Error(body.error?.message ?? 'AI settings could not be saved.');
    setSettings(body);
    return body;
  }

  async function save() {
    setSaving(true);
    setStatus('Saving…');
    try {
      await persistSettings();
      setStatus('Saved. New privacy choices apply to future AI requests.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'AI settings could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function refreshSummaries() {
    setRefreshing(true);
    setStatus('Saving settings and preparing one summary request…');
    try {
      await persistSettings();
      const response = await fetch('/api/v1/ai/summaries', { method: 'POST' });
      const body = (await response.json().catch(() => null)) as {
        summaries?: unknown[];
        error?: { message?: string };
      } | null;
      if (!response.ok)
        throw new Error(body?.error?.message ?? 'AI summaries could not be refreshed.');
      const count = body?.summaries?.length ?? 0;
      setStatus(
        count
          ? `Updated ${count} summary ${count === 1 ? 'section' : 'sections'} in one AI request.`
          : 'Nothing was sent: enabled summary sections do not have shareable data yet.',
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'AI summaries could not be refreshed.');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className={styles.shell}>
      <SettingsPane
        className={styles.panel}
        eyebrow="AI FEATURES"
        title="Recipe image generation"
        description="Household-wide permission for paid AI-created recipe imagery."
        aria-labelledby="ai-image-generation-title"
      >
        <div className={styles.globalPreference}>
          <div>
            <strong id="ai-image-generation-title">Offer image generation</strong>
            <p>Individual creation flows still keep image generation off until you choose it.</p>
          </div>
          <label className={styles.masterToggle}>
            <span>
              <strong>AI generate recipe images</strong>
              <small>Allow recipe and meal-plan tools to offer paid image generation.</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={imageGeneration?.enabled ?? true}
              onChange={(event) => {
                const enabled = event.target.checked;
                setSettings((current) => ({
                  ...current,
                  workloads: current.workloads.map((item) =>
                    item.workload === 'image_generation' ? { ...item, enabled } : item,
                  ),
                }));
              }}
            />
            <i aria-hidden="true" />
          </label>
        </div>
      </SettingsPane>
      <SettingsPane
        className={styles.panel}
        eyebrow="SUMMARIES"
        title="Household summaries"
        description="One request creates enabled insight sections together; sections without data are omitted."
      >
        <div className={styles.summarySchedule}>
          <label className={styles.field}>
            Update frequency
            <select
              value={String(settings.dataPolicy.summaryFrequency)}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  dataPolicy: {
                    ...current.dataPolicy,
                    summaryFrequency: event.target.value,
                  },
                }))
              }
            >
              <option value="off">Off</option>
              <option value="daily">Daily</option>
              <option value="every_3_days">Every 3 days</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <p>
            The schedule runs locally. A provider request is made only when an enabled section has
            shareable data.
          </p>
        </div>
        <div className={styles.summaryDomains}>
          {summaryFields.map(([key, title, description]) => (
            <label className={styles.toggle} key={key}>
              <input
                type="checkbox"
                checked={Boolean(settings.dataPolicy[key])}
                disabled={settings.dataPolicy.summaryFrequency === 'off'}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    dataPolicy: { ...current.dataPolicy, [key]: event.target.checked },
                  }))
                }
              />
              <span>
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
            </label>
          ))}
        </div>
      </SettingsPane>
      <SettingsPane
        className={styles.panel}
        eyebrow="MODEL ROUTING"
        title="Models by task"
        description="Model choices are shared by the household. Compatible custom model IDs are supported."
      >
        <div className={styles.workloads}>
          {settings.workloads.map((item, index) => {
            const choices = settings.modelCatalog.filter((model) =>
              model.workloads.includes(item.workload),
            );
            const known = choices.some((model) => model.id === item.model);
            const reasoning = settings.modelCatalog.find((model) => model.id === item.model)
              ?.reasoning ?? ['none', 'low', 'medium', 'high', 'xhigh'];
            return (
              <div className={styles.workload} key={item.workload}>
                <strong>{label(item.workload)}</strong>
                <label className={styles.field}>
                  Model
                  <select
                    value={known ? item.model : '__custom'}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value !== '__custom')
                        updateWorkload(index, { model: value, reasoningEffort: null });
                      else updateWorkload(index, { model: 'custom-model', reasoningEffort: null });
                    }}
                  >
                    {choices.map((model) => (
                      <option value={model.id} key={model.id}>
                        {model.label}
                      </option>
                    ))}
                    <option value="__custom">Custom model ID</option>
                  </select>
                  {!known ? (
                    <input
                      aria-label={`Custom model for ${label(item.workload)}`}
                      value={item.model}
                      onChange={(event) => updateWorkload(index, { model: event.target.value })}
                    />
                  ) : null}
                </label>
                <label className={styles.field}>
                  Thinking difficulty
                  <select
                    value={item.reasoningEffort ?? 'none'}
                    onChange={(event) =>
                      updateWorkload(index, {
                        reasoningEffort: event.target.value === 'none' ? null : event.target.value,
                      })
                    }
                  >
                    <option value="none">Default</option>
                    {reasoning
                      .filter((value) => value !== 'none')
                      .map((value) => (
                        <option value={value} key={value}>
                          {value}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            );
          })}
        </div>
      </SettingsPane>
      <SettingsPane
        className={styles.panel}
        eyebrow="PRIVACY"
        title="Data shared for this profile"
        description="Only enabled categories may be included in future requests. Earlier requests cannot be recalled."
      >
        <div className={styles.privacy}>
          {policyFields.map(([key, title, description]) => (
            <label className={styles.toggle} key={key}>
              <input
                type="checkbox"
                checked={Boolean(settings.dataPolicy[key])}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    dataPolicy: { ...current.dataPolicy, [key]: event.target.checked },
                  }))
                }
              />
              <span>
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
            </label>
          ))}
        </div>
      </SettingsPane>
      <div className={styles.actions}>
        <button type="button" onClick={() => void save()} disabled={saving || refreshing}>
          {saving ? <InlineSkeleton label="Saving AI settings" width="6rem" /> : 'Save AI settings'}
        </button>
        <button
          className={styles.secondaryAction}
          type="button"
          onClick={() => void refreshSummaries()}
          disabled={saving || refreshing}
        >
          {refreshing ? (
            <InlineSkeleton label="Updating AI summaries" width="8rem" />
          ) : (
            'Update summaries now'
          )}
        </button>
        <p className={styles.status} role="status">
          {status}
        </p>
      </div>
    </div>
  );
}
