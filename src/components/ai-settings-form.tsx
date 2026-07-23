'use client';

import { useState } from 'react';

import { InlineSkeleton } from '@/components/skeleton';

import styles from './ai-settings-form.module.css';

type Workload = {
  workload: string;
  model: string;
  reasoningEffort: string | null;
  enabled: boolean;
  version: number;
};
type Policy = Record<string, boolean | number> & { version: number };
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
  ['dailySummaryEnabled', 'Daily AI summary', 'Generate a daily nutrition recap.'],
  [
    'weeklySummaryEnabled',
    'Weekly AI summaries',
    'Generate nutrition and planning recaps each week.',
  ],
] as const;

function label(value: string) {
  return value.replaceAll('_', ' ');
}

export function AiSettingsForm({ initialSettings }: { initialSettings: Settings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
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

  async function save() {
    setSaving(true);
    setStatus('Saving…');
    try {
      const response = await fetch('/api/v1/ai/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workloads: settings.workloads, dataPolicy: settings.dataPolicy }),
      });
      const body = (await response.json()) as Settings & { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? 'AI settings could not be saved.');
      setSettings(body);
      setStatus('Saved. New privacy choices apply to future AI requests.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'AI settings could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.shell}>
      <section className={styles.panel} aria-labelledby="ai-image-generation-title">
        <div className={styles.globalPreference}>
          <div>
            <h2 id="ai-image-generation-title">Recipe image generation</h2>
            <p>
              Set the household-wide permission for AI-created recipe images. Individual creation
              flows still keep image generation off until you choose it.
            </p>
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
      </section>
      <section className={styles.panel}>
        <header>
          <h2>Models by task</h2>
          <p>
            Model choices are shared by the household. Custom model IDs are supported when OpenAI
            makes a compatible model available.
          </p>
        </header>
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
      </section>
      <section className={styles.panel}>
        <header>
          <h2>Data shared for this profile</h2>
          <p>
            Only enabled categories may be included in future requests. Turning a category off does
            not recall data from requests already sent.
          </p>
        </header>
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
      </section>
      <div className={styles.actions}>
        <button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? <InlineSkeleton label="Saving AI settings" width="6rem" /> : 'Save AI settings'}
        </button>
        <p className={styles.status} role="status">
          {status}
        </p>
      </div>
    </div>
  );
}
