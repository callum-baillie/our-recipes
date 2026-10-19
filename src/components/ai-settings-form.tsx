'use client';

import { AiSummaryCards, type AiSummaryCardData } from './ai-summary-cards';
import { useRef, useState } from 'react';

import { AI_WORKLOAD_DEFAULTS, aiWorkloadSchema } from '@/lib/domain/ai-assistant';

import { LoadingIndicator } from '@/components/skeleton';
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

export function AiSettingsForm({
  initialSettings,
  privacyOnly = false,
  personName = 'Your profile',
}: {
  initialSettings: Settings;
  privacyOnly?: boolean;
  personName?: string;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedSummaries, setUpdatedSummaries] = useState<AiSummaryCardData[]>([]);
  const [status, setStatus] = useState('');
  const [statusSource, setStatusSource] = useState<'save' | 'refresh'>('save');
  const lock = useRef(false);
  const [savedPolicy, setSavedPolicy] = useState(JSON.stringify(initialSettings.dataPolicy));
  const dirty = JSON.stringify(settings.dataPolicy) !== savedPolicy;
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
      body: JSON.stringify(
        privacyOnly
          ? { dataPolicy: settings.dataPolicy }
          : { workloads: settings.workloads, dataPolicy: settings.dataPolicy },
      ),
    });
    const body = (await response.json()) as Settings & { error?: { message?: string } };
    if (!response.ok) throw new Error(body.error?.message ?? 'AI settings could not be saved.');
    setSettings(body);
    setSavedPolicy(JSON.stringify(body.dataPolicy));
    return body;
  }

  async function save() {
    if (lock.current) return;
    lock.current = true;
    setStatusSource('save');
    setSaving(true);
    setStatus('Saving…');
    try {
      await persistSettings();
      setStatus('Saved. New privacy choices apply to future AI requests.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'AI settings could not be saved.');
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  async function refreshSummaries() {
    if (lock.current) return;
    lock.current = true;
    let policySaved = false;
    setStatusSource('refresh');
    setRefreshing(true);
    setStatus('Saving settings and preparing one summary request…');
    try {
      await persistSettings();
      policySaved = true;
      const response = await fetch('/api/v1/ai/summaries?scope=account', { method: 'POST' });
      const body = (await response.json().catch(() => null)) as {
        summaries?: AiSummaryCardData[];
        outcome?: string;
        recipient?: { id: string; name: string };
        error?: { message?: string };
      } | null;
      if (!response.ok)
        throw new Error(body?.error?.message ?? 'AI summaries could not be refreshed.');
      const count = body?.summaries?.length ?? 0;
      setUpdatedSummaries(body?.summaries ?? []);
      setStatus(
        count
          ? `${body?.recipient?.name ?? personName}: updated ${count} summary ${count === 1 ? 'section' : 'sections'}. Privacy and summary settings saved.`
          : `${personName}: privacy and summary settings saved. ${body?.outcome === 'disabled_workload' ? 'Summary requests are disabled by task or account rules.' : body?.outcome === 'disabled_outputs' ? 'No summary outputs are enabled.' : 'No eligible shared evidence is available for the enabled outputs.'}`,
      );
    } catch (error) {
      setStatus(
        `${policySaved ? 'Privacy and summary settings saved; summary updating failed. ' : ''}${error instanceof Error ? error.message : 'AI summaries could not be refreshed.'}`,
      );
    } finally {
      lock.current = false;
      setRefreshing(false);
    }
  }

  return (
    <div id="ai-privacy" className="settings-stack" onChange={() => setStatus('')}>
      <nav className="settings-section-index" aria-label="Privacy and summary sections">
        <a href="#ai-summary-policy">Desired outputs</a>
        <a href="#ai-sharing-inputs">Permitted inputs</a>
        <a href="#ai-privacy-save">Save privacy settings</a>
      </nav>
      {!privacyOnly && (
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
      )}
      <SettingsPane
        id="ai-summary-policy"
        title="Summaries"
        description="Choose which summaries to prepare and how often to refresh them."
      >
        <SettingsField
          title="Update frequency"
          description="Off stops automatic refresh. You can still explicitly update enabled summaries here; a new request may be paid."
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
        </SettingsSubsection>
        <SettingsRow
          role="group"
          aria-label={`Update ${personName}'s summaries`}
          title={`Update ${personName}'s summaries`}
          description="Saves only privacy and summary settings, then requests enabled summaries for this person. It does not save the separate AI defaults draft."
        >
          <button
            className="secondary-button"
            type="button"
            disabled={saving || refreshing}
            onClick={() => void refreshSummaries()}
          >
            {refreshing ? 'Updating summaries…' : 'Update summaries'}
          </button>
          {statusSource === 'refresh' && status && (
            <p className="settings-local-status" role="status">
              {status}
            </p>
          )}
          {updatedSummaries.length > 0 && (
            <a href="#my-summary-results">View {personName}&apos;s updated summaries</a>
          )}
        </SettingsRow>
      </SettingsPane>
      {!privacyOnly && (
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
      )}
      <SettingsPane
        id="ai-sharing-inputs"
        title="Permitted inputs"
        description="Only enabled categories may be sent for this profile’s future AI requests. Earlier requests cannot be recalled."
      >
        <p>
          Desired outputs do not enable input sharing. Enable only the categories you intend to
          share. An output without permitted evidence cannot be prepared.{' '}
          <a href="/account/nutrition">Nutrition preferences</a>
        </p>
        {[
          { title: 'Recipes and planning', fields: policyFields.slice(0, 5) },
          { title: 'Nutrition and identity', fields: policyFields.slice(5, 11) },
          { title: 'Pantry and shopping', fields: policyFields.slice(11) },
        ].map((group) => (
          <SettingsSubsection key={group.title} title={group.title}>
            {group.fields.map(([key, title, description]) => (
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
          </SettingsSubsection>
        ))}
      </SettingsPane>
      {updatedSummaries.length > 0 && (
        <>
          <section id="my-summary-results">
            <h2>{personName}&apos;s generated snapshots</h2>
            {updatedSummaries.map((summary) => (
              <AiSummaryCards
                key={summary.id}
                domain={summary.domain}
                placement="nutrition"
                initialSummary={summary}
              />
            ))}
          </section>
        </>
      )}
      <div id="ai-privacy-save">
        <SettingsActionBar
          status={
            (statusSource === 'save' ? status : '') ||
            (dirty
              ? 'Unsaved privacy and summary settings'
              : 'No unsaved privacy or summary settings')
          }
        >
          <button
            className="primary-button"
            type="button"
            disabled={saving || refreshing || !dirty}
            onClick={() => void save()}
          >
            {saving ? (
              <>
                <LoadingIndicator label="Saving AI settings" /> Saving…
              </>
            ) : (
              'Save privacy and summary settings'
            )}
          </button>
        </SettingsActionBar>
      </div>
    </div>
  );
}
