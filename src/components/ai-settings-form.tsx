'use client';

import { useState } from 'react';

import { AI_WORKLOAD_DEFAULTS, aiWorkloadSchema } from '@/lib/domain/ai-assistant';

import { InlineSkeleton } from '@/components/skeleton';
import {
  SettingsPane,
  SettingsField,
  SettingsRow,
  SettingsSubsection,
  SettingsActionBar,
} from '@/components/settings-primitives';

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
  [
    'sharePersonalMetrics',
    'Personal metrics',
    'Age, height, activity, sex category, life stage, and recorded body composition. Mass values also require Weight sharing.',
  ],
  ['shareWeight', 'Weight', 'Current and target weight.'],
  [
    'sharePantry',
    'Pantry stock',
    'Available food, quantities, locations, and recorded expiry dates.',
  ],
  ['shareShoppingLists', 'Shopping lists', 'List names, items, quantities, notes, and completion.'],
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
    <div className="settings-stack">
      <SettingsPane
        title="Recipe images"
        description="Shared permission to offer paid AI image generation. Each creation flow still asks whether to generate images."
      >
        <SettingsField
          title="Offer AI image generation"
          description="Allow recipe and meal-plan tools to offer generated photos."
        >
          <input
            type="checkbox"
            role="switch"
            checked={imageGeneration?.enabled ?? true}
            disabled={saving || refreshing}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                workloads: current.workloads.map((item) =>
                  item.workload === 'image_generation'
                    ? { ...item, enabled: event.target.checked }
                    : item,
                ),
              }))
            }
          />
        </SettingsField>
      </SettingsPane>
      <SettingsPane
        title="Summaries"
        description="Choose which summaries to prepare and how often to refresh them."
      >
        <SettingsField
          title="Update frequency"
          description="The server requests a summary only when an enabled section has shareable data."
        >
          <select
            value={String(settings.dataPolicy.summaryFrequency)}
            disabled={saving || refreshing}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                dataPolicy: { ...current.dataPolicy, summaryFrequency: event.target.value },
              }))
            }
          >
            <option value="off">Off</option>
            <option value="daily">Daily</option>
            <option value="every_3_days">Every 3 days</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </SettingsField>
        <SettingsSubsection title="Included sections">
          {summaryFields.map(([key, title, description]) => (
            <SettingsField key={key} title={title} description={description}>
              <input
                type="checkbox"
                role="switch"
                checked={Boolean(settings.dataPolicy[key])}
                disabled={saving || refreshing || settings.dataPolicy.summaryFrequency === 'off'}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    dataPolicy: { ...current.dataPolicy, [key]: event.target.checked },
                  }))
                }
              />
            </SettingsField>
          ))}
        </SettingsSubsection>
        <SettingsRow
          title="Refresh summaries now"
          description="Saves your current choices and requests fresh summaries using the enabled data categories."
        >
          <button
            className="secondary-button"
            type="button"
            disabled={saving || refreshing}
            onClick={() => void refreshSummaries()}
          >
            {refreshing ? 'Updating summaries…' : 'Update summaries'}
          </button>
        </SettingsRow>
      </SettingsPane>
      <SettingsPane
        title="Models by task"
        description="These model choices are shared by the household. Compatible custom model IDs are supported."
      >
        <SettingsRow
          title="Recommended defaults"
          description="Select the recommended Luna models for text tasks. Save to apply your changes."
        >
          <button
            className="secondary-button"
            type="button"
            disabled={saving || refreshing}
            onClick={() =>
              setSettings((current) => ({
                ...current,
                workloads: current.workloads.map((item) => {
                  const workload = aiWorkloadSchema.safeParse(item.workload);
                  return workload.success && workload.data !== 'image_generation'
                    ? { ...item, ...AI_WORKLOAD_DEFAULTS[workload.data] }
                    : item;
                }),
              }))
            }
          >
            Use recommended models
          </button>
        </SettingsRow>
        {settings.workloads.map((item, index) => {
          const choices = settings.modelCatalog.filter((model) =>
            model.workloads.includes(item.workload),
          );
          const known = choices.some((model) => model.id === item.model);
          const reasoning = settings.modelCatalog.find((model) => model.id === item.model)
            ?.reasoning ?? ['none', 'low', 'medium', 'high', 'xhigh'];
          return (
            <SettingsSubsection key={item.workload} title={label(item.workload)}>
              <SettingsField
                title="Model"
                description="Select the model used for this type of request."
              >
                <select
                  disabled={saving || refreshing}
                  value={known ? item.model : '__custom'}
                  onChange={(event) =>
                    updateWorkload(index, {
                      model:
                        event.target.value === '__custom' ? 'custom-model' : event.target.value,
                      reasoningEffort: null,
                    })
                  }
                >
                  {choices.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                  <option value="__custom">Custom model ID</option>
                </select>
              </SettingsField>
              {!known && (
                <SettingsField
                  title="Custom model ID"
                  description="Enter a model available to the configured provider account."
                >
                  <input
                    disabled={saving || refreshing}
                    value={item.model}
                    onChange={(event) => updateWorkload(index, { model: event.target.value })}
                  />
                </SettingsField>
              )}
              <SettingsField
                title="Reasoning effort"
                description="Use the model default or choose an available effort level."
              >
                <select
                  disabled={saving || refreshing}
                  value={item.reasoningEffort ?? 'none'}
                  onChange={(event) =>
                    updateWorkload(index, {
                      reasoningEffort: event.target.value === 'none' ? null : event.target.value,
                    })
                  }
                >
                  <option value="none">Model default</option>
                  {reasoning
                    .filter((value) => value !== 'none')
                    .map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                </select>
              </SettingsField>
            </SettingsSubsection>
          );
        })}
      </SettingsPane>
      <SettingsPane
        title="Data sharing"
        description="Only enabled categories may be sent for this profile’s future AI requests. Earlier requests cannot be recalled."
      >
        {policyFields.map(([key, title, description]) => (
          <SettingsField key={key} title={title} description={description}>
            <input
              type="checkbox"
              role="switch"
              checked={Boolean(settings.dataPolicy[key])}
              disabled={saving || refreshing}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  dataPolicy: { ...current.dataPolicy, [key]: event.target.checked },
                }))
              }
            />
          </SettingsField>
        ))}
      </SettingsPane>
      <SettingsActionBar status={status}>
        <button
          className="primary-button"
          type="button"
          disabled={saving || refreshing}
          onClick={() => void save()}
        >
          {saving ? <InlineSkeleton label="Saving AI settings" width="6rem" /> : 'Save AI settings'}
        </button>
      </SettingsActionBar>
    </div>
  );
}
