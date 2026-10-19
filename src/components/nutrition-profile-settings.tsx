'use client';

import type { BodyMetrics } from '@/lib/domain/body-metrics';
import { ButtonSpinner } from './skeleton';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';

import styles from '@/components/nutrition-profile-settings.module.css';
import {
  SettingsActionBar,
  SettingsPane,
  SettingsField,
  SettingsGroup,
} from '@/components/settings-primitives';
import { createClientUuid } from '@/lib/client/client-uuid';

const CENTIMETERS_PER_INCH = 2.54;
const KILOGRAMS_PER_POUND = 0.45359237;

export type NutritionProfileSettingsValue = {
  id: string;
  advancedMetrics?: BodyMetrics;
  version: number;
  dateOfBirth: string | null;
  heightCentimeters: number | null;
  currentWeightKilograms: number | null;
  measurementSystem: 'metric' | 'imperial';
  referenceSexCategory: 'female' | 'male' | null;
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active' | null;
  nutritionGoalType: 'none' | 'maintain' | 'gain' | 'loss' | 'custom';
  targetWeightKilograms: number | null;
  targetDate: string | null;
  explicitlyEnteredLifeStage: 'pregnant' | 'breastfeeding' | null;
  dietaryPreferences: string[];
  foodAllergies: string[];
  dietaryExclusions: string[];
  estimatedTargetsEnabled: boolean;
  estimatedTargetConsent: boolean;
  weightTrackingEnabled: boolean;
  preferredEnergyUnit: 'kcal' | 'kJ';
  dailyResetTimezone: string;
  weekStartsOn: number;
  referenceJurisdiction: string;
  visibleNutrientCodes: string[];
  trendRangeDays: 7 | 14 | 30;
  showPlannedNutrition: boolean;
  showRecipeCardNutrition: boolean;
  recipeCardNutrientCodes: string[];
  showMealPlanNutrition: boolean;
};

type EnergyEstimateResponse = {
  action: 'previewed' | 'applied';
  estimate: {
    roundedKcal: number;
    exactKcal: number;
    formula: string;
    sourceVersion: string;
    sourceUrl: string;
    doi: string;
    disclosure: string;
  } | null;
  currentEnergyGoals: Array<{
    id: string;
    revision: number;
    sourceType: string;
    value: number | null;
    unit: string;
  }>;
  goal: { id: string } | null;
};

function rounded(value: number) {
  return Number(value.toFixed(4));
}

export function canonicalHeight(value: number | null, system: 'metric' | 'imperial') {
  return value === null
    ? null
    : rounded(system === 'imperial' ? value * CENTIMETERS_PER_INCH : value);
}

export function canonicalWeight(value: number | null, system: 'metric' | 'imperial') {
  return value === null
    ? null
    : rounded(system === 'imperial' ? value * KILOGRAMS_PER_POUND : value);
}

function displayedWeight(value: number | null, system: 'metric' | 'imperial') {
  return value === null ? '' : rounded(system === 'imperial' ? value / KILOGRAMS_PER_POUND : value);
}

function optionalNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? '').trim();
  return text === '' ? null : Number(text);
}

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
}

function list(value: FormDataEntryValue | null) {
  return String(value ?? '')
    .split(/[\n,]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function responseMessage(response: Response) {
  try {
    return (
      ((await response.json()) as { error?: { message?: string } }).error?.message ??
      'The profile could not be saved.'
    );
  } catch {
    return 'The profile could not be saved.';
  }
}

export function nutritionProfileUpdateRequest(
  profile: Pick<NutritionProfileSettingsValue, 'version'>,
  data: FormData,
) {
  const system = String(data.get('measurementSystem')) as 'metric' | 'imperial';
  const height =
    system === 'imperial' && data.has('heightFeet')
      ? data.get('heightFeet') === '' && data.get('heightInches') === ''
        ? null
        : Number(data.get('heightFeet')) * 12 + Number(data.get('heightInches'))
      : optionalNumber(data.get('height'));
  const targetWeight = optionalNumber(data.get('targetWeight'));
  return {
    expectedVersion: profile.version,
    settings: {
      dateOfBirth: optionalText(data.get('dateOfBirth')),
      heightCentimeters: canonicalHeight(height, system),
      measurementSystem: system,
      referenceSexCategory: optionalText(data.get('referenceSexCategory')),
      activityLevel: optionalText(data.get('activityLevel')),
      nutritionGoalType: data.get('nutritionGoalType'),
      targetWeightKilograms: canonicalWeight(targetWeight, system),
      targetDate: optionalText(data.get('targetDate')),
      explicitlyEnteredLifeStage: optionalText(data.get('explicitlyEnteredLifeStage')),
      dietaryPreferences: list(data.get('dietaryPreferences')),
      foodAllergies: list(data.get('foodAllergies')),
      dietaryExclusions: list(data.get('dietaryExclusions')),
      estimatedTargetsEnabled: data.get('estimatedTargetsEnabled') === 'on',
      estimatedTargetConsent: data.get('estimatedTargetConsent') === 'on',
      weightTrackingEnabled: data.get('weightTrackingEnabled') === 'on',
      preferredEnergyUnit: data.get('preferredEnergyUnit'),
      dailyResetTimezone: String(data.get('dailyResetTimezone') ?? ''),
      weekStartsOn: Number(data.get('weekStartsOn')),
      referenceJurisdiction: String(data.get('referenceJurisdiction') ?? ''),
      visibleNutrientCodes: data.getAll('visibleNutrientCodes').map(String),
      trendRangeDays: Number(data.get('trendRangeDays')),
      showPlannedNutrition: data.get('showPlannedNutrition') === 'on',
      showRecipeCardNutrition: data.get('showRecipeCardNutrition') === 'on',
      recipeCardNutrientCodes: data.getAll('recipeCardNutrientCodes').map(String),
      showMealPlanNutrition: data.get('showMealPlanNutrition') === 'on',
    },
  };
}

export function NutritionProfileSettings({
  profile,
  effectiveOn,
  nutrientDefinitions = [],
}: {
  profile: NutritionProfileSettingsValue;
  effectiveOn: string;
  nutrientDefinitions?: Array<{ code: string; displayName: string; category?: string }>;
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [measurementSystem, setMeasurementSystem] = useState(profile.measurementSystem);
  const [energyEstimate, setEnergyEstimate] = useState<EnergyEstimateResponse | null>(null);
  const [optionalInputsOpen, setOptionalInputsOpen] = useState(
    Boolean(
      profile.estimatedTargetsEnabled ||
      profile.dateOfBirth ||
      profile.heightCentimeters ||
      profile.currentWeightKilograms,
    ),
  );
  const estimateOperationId = useRef<string | null>(null);

  async function requestEnergyEstimate(action: 'preview' | 'apply', form: HTMLFormElement) {
    const data = new FormData(form);
    const palCategory = String(data.get('estimatePalCategory'));
    const estimateDate = String(data.get('estimateEffectiveOn'));
    if (!palCategory || !estimateDate) {
      setStatus('Choose an effective date and an exact physical-activity category.');
      return;
    }
    if (action === 'apply' && !estimateOperationId.current)
      estimateOperationId.current = createClientUuid();
    setStatus(
      action === 'preview' ? 'Calculating a server-owned preview…' : 'Applying the estimate…',
    );
    const response = await fetch(`/api/v1/nutrition/profiles/${profile.id}/goals/estimate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action,
        expectedProfileVersion: profile.version,
        effectiveOn: estimateDate,
        palCategory,
        ...(action === 'apply'
          ? {
              operationId: estimateOperationId.current,
              supersedesGoalVersionId: data.get('supersedesGoalVersionId') || null,
            }
          : {}),
      }),
    });
    if (!response.ok) {
      setStatus(await responseMessage(response));
      return;
    }
    const result = (await response.json()) as EnergyEstimateResponse;
    setEnergyEstimate(result);
    if (action === 'preview') {
      estimateOperationId.current = null;
      setStatus('Preview calculated. Review the source and uncertainty before applying.');
      return;
    }
    setStatus('Versioned estimated calorie goal applied.');
    router.refresh();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const request = nutritionProfileUpdateRequest(profile, data);
    setSaving(true);
    setStatus('Saving preferences…');
    try {
      const response = await fetch(`/api/v1/nutrition/profiles/${profile.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        setStatus(await responseMessage(response));
        return;
      }
      setStatus('Nutrition preferences saved.');
      router.refresh();
    } catch {
      setStatus('Unable to save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  const weightUnit = measurementSystem === 'imperial' ? 'lb' : 'kg';

  return (
    <SettingsPane
      className={styles.panel}
      eyebrow="ACTIVE PROFILE"
      title="Nutrition preferences"
      description="These choices apply to the household profile selected in the app header. Identity and appearance are in My profile. Add weigh-ins and body measurements on the Nutrition page."
    >
      <form className={styles.form} onSubmit={save}>
        <details
          className={`settings-disclosure ${styles.disclosure}`}
          open={optionalInputsOpen}
          onToggle={(event) => setOptionalInputsOpen(event.currentTarget.open)}
        >
          <summary>Optional body inputs and estimated targets</summary>
          <SettingsGroup
            title={<>Optional body and reference inputs</>}
            aria-describedby="sensitive-input-explanation"
          >
            <p id="sensitive-input-explanation" className={styles.notice}>
              Date of birth, body measurements, the source&apos;s sex category, activity and an
              explicit pregnancy or breastfeeding life stage are requested only to support a
              separately reviewed estimate you choose to enable. They are never inferred from
              recipes or diary activity. Manual goals need none of these values.
            </p>
            <div className={`settings-fields ${styles.grid}`}>
              <SettingsField
                description="Choose centimeters and kilograms, or feet, inches, and pounds."
                title="Measurement system"
              >
                <select
                  name="measurementSystem"
                  value={measurementSystem}
                  onChange={(event) =>
                    setMeasurementSystem(event.target.value as 'metric' | 'imperial')
                  }
                >
                  <option value="metric">Metric</option>
                  <option value="imperial">Imperial</option>
                </select>
              </SettingsField>
              <SettingsField
                description="Used only when you choose an age-based nutrition estimate."
                title="Date of birth (optional)"
              >
                <input name="dateOfBirth" type="date" defaultValue={profile.dateOfBirth ?? ''} />
              </SettingsField>
              {measurementSystem === 'imperial' ? (
                <fieldset className={`settings-fields ${styles.grid}`}>
                  <legend>Height · optional</legend>
                  <SettingsField
                    description="The whole-foot part of your measured height."
                    title="Feet"
                  >
                    <input
                      name="heightFeet"
                      type="number"
                      min="0"
                      max="9"
                      step="1"
                      defaultValue={
                        profile.heightCentimeters == null
                          ? ''
                          : Math.floor(profile.heightCentimeters / 2.54 / 12)
                      }
                    />
                  </SettingsField>
                  <SettingsField
                    description="The remaining inches after whole feet."
                    title="Inches"
                  >
                    <input
                      name="heightInches"
                      type="number"
                      min="0"
                      max="11.99"
                      step="0.1"
                      defaultValue={
                        profile.heightCentimeters == null
                          ? ''
                          : Number(((profile.heightCentimeters / 2.54) % 12).toFixed(1))
                      }
                    />
                  </SettingsField>
                </fieldset>
              ) : (
                <SettingsField
                  description="Enter your measured height in centimeters."
                  title="Height (cm) (optional)"
                >
                  <input
                    name="height"
                    type="number"
                    min="1"
                    max="300"
                    step="0.1"
                    defaultValue={profile.heightCentimeters ?? ''}
                  />
                </SettingsField>
              )}
              <SettingsField
                description="The category required by the selected nutrition reference method."
                title="Reference source sex category (optional)"
              >
                <select
                  name="referenceSexCategory"
                  defaultValue={profile.referenceSexCategory ?? ''}
                >
                  <option value="">Not provided</option>
                  <option value="female">Female category used by the source</option>
                  <option value="male">Male category used by the source</option>
                </select>
              </SettingsField>
              <SettingsField
                description="Record your usual activity level for nutrition personalization."
                title="Activity level (optional)"
              >
                <select name="activityLevel" defaultValue={profile.activityLevel ?? ''}>
                  <option value="">Not provided</option>
                  <option value="sedentary">Sedentary</option>
                  <option value="light">Light</option>
                  <option value="moderate">Moderate</option>
                  <option value="active">Active</option>
                  <option value="very_active">Very active</option>
                </select>
              </SettingsField>
              <SettingsField
                description="Provide this only if it applies to you and you want it considered."
                title="Explicit life stage (optional)"
              >
                <select
                  name="explicitlyEnteredLifeStage"
                  defaultValue={profile.explicitlyEnteredLifeStage ?? ''}
                >
                  <option value="">Not provided</option>
                  <option value="pregnant">Pregnancy explicitly entered</option>
                  <option value="breastfeeding">Breastfeeding explicitly entered</option>
                </select>
              </SettingsField>
            </div>
            <div className={styles.checks}>
              <SettingsField
                description="Keep these reference inputs available for estimates you explicitly request."
                title="Save these inputs for estimated-target use"
              >
                <input
                  role="switch"
                  name="estimatedTargetsEnabled"
                  type="checkbox"
                  defaultChecked={profile.estimatedTargetsEnabled}
                />
              </SettingsField>
              <SettingsField
                description="Allow the selected calculation to use the measurements you provide."
                title="I explicitly consent to using the entered values for a documented estimate"
              >
                <input
                  name="estimatedTargetConsent"
                  type="checkbox"
                  defaultChecked={profile.estimatedTargetConsent}
                />
              </SettingsField>
            </div>
            <p className={styles.warning}>
              Saving these inputs does not calculate, create, or replace a goal. Estimated targets
              remain unavailable until a versioned reference method is separately selected and
              applied. You can continue using manual goals.
            </p>
            <div className={styles.estimateBox}>
              <h3>Preview an adult maintenance-energy estimate</h3>
              <p>
                Adults age 19+ who are not pregnant or breastfeeding can preview the NASEM 2023
                Table 5-16 equation. Choose a fresh activity category below; the generic activity
                field above is never translated automatically.
              </p>
              <SettingsField
                description="The date this estimate should apply from."
                title="Estimate effective date"
              >
                <input name="estimateEffectiveOn" type="date" defaultValue={effectiveOn} />
              </SettingsField>
              <SettingsField
                description="Choose the category after reviewing the descriptions below."
                title="NASEM physical-activity category"
              >
                <select name="estimatePalCategory" defaultValue="">
                  <option value="">Choose after reviewing the descriptions</option>
                  <option value="inactive">Inactive</option>
                  <option value="low_active">Low active</option>
                  <option value="active">Active</option>
                  <option value="very_active">Very active</option>
                </select>
              </SettingsField>
              <details>
                <summary>How USDA describes these four categories</summary>
                <ul>
                  <li>
                    Inactive: activities of daily living only, with little activity beyond them.
                  </li>
                  <li>
                    Low active: daily living plus 60–80 minutes of moderate activity per week.
                  </li>
                  <li>
                    Active: daily living plus 30–50 minutes of moderate and 85 minutes of vigorous
                    activity per week.
                  </li>
                  <li>Very active: daily living plus 130 minutes of vigorous activity per week.</li>
                </ul>
                <p>
                  Classification is uncertain. Select the closest description yourself; the app does
                  not infer it from steps, recipes, Pantry, or diary entries.
                </p>
              </details>
              <button
                type="button"
                onClick={(event) =>
                  void requestEnergyEstimate('preview', event.currentTarget.form!)
                }
              >
                Preview estimated maintenance calories
              </button>
              {energyEstimate?.estimate ? (
                <section className={styles.estimateResult} aria-labelledby="energy-estimate-result">
                  <h4 id="energy-estimate-result">
                    Estimated maintenance energy: {energyEstimate.estimate.roundedKcal} kcal/day
                  </h4>
                  <p>{energyEstimate.estimate.disclosure}</p>
                  <details>
                    <summary>Formula and source</summary>
                    <p>
                      {energyEstimate.estimate.formula}. Unrounded result:{' '}
                      {energyEstimate.estimate.exactKcal.toFixed(4)} kcal/day; displayed and applied
                      at the nearest whole kcal.
                    </p>
                    <p>
                      <a href={energyEstimate.estimate.sourceUrl} target="_blank" rel="noreferrer">
                        {energyEstimate.estimate.sourceVersion}
                      </a>{' '}
                      · DOI {energyEstimate.estimate.doi}
                    </p>
                  </details>
                  {energyEstimate.currentEnergyGoals.length ? (
                    <SettingsField
                      description="Select a saved target only if you intend to replace it with this estimate."
                      title="Current calorie goal to supersede explicitly"
                    >
                      <select name="supersedesGoalVersionId" defaultValue="">
                        <option value="">Choose the exact current version</option>
                        {energyEstimate.currentEnergyGoals.map((goal) => (
                          <option key={goal.id} value={goal.id}>
                            {goal.value} {goal.unit} · {goal.sourceType} · revision {goal.revision}
                          </option>
                        ))}
                      </select>
                    </SettingsField>
                  ) : (
                    <p>
                      No current calorie goal will be replaced; applying starts a new goal series.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={(event) =>
                      void requestEnergyEstimate('apply', event.currentTarget.form!)
                    }
                  >
                    Apply this versioned estimate
                  </button>
                </section>
              ) : null}
            </div>
          </SettingsGroup>
        </details>

        <SettingsGroup title={<>Goals and tracking choices</>} id="nutrition-goals">
          <div className={`settings-fields ${styles.grid}`}>
            <SettingsField
              description="Describe your goal; this does not calculate or replace a calorie target."
              title="Nutrition goal type"
            >
              <select name="nutritionGoalType" defaultValue={profile.nutritionGoalType}>
                <option value="none">No body-weight goal</option>
                <option value="maintain">Maintain</option>
                <option value="gain">Gain</option>
                <option value="loss">Loss</option>
                <option value="custom">Custom</option>
              </select>
            </SettingsField>
            <SettingsField
              title={`Target weight (${weightUnit}) · optional`}
              description="An optional goal for tracking progress. Record your current weight on the Nutrition page."
            >
              <input
                key={`target-weight-${measurementSystem}`}
                name="targetWeight"
                type="number"
                min="0.0001"
                step="any"
                defaultValue={displayedWeight(profile.targetWeightKilograms, measurementSystem)}
              />
            </SettingsField>
            <SettingsField
              description="An optional date to review progress toward your goal."
              title="Target date (optional)"
            >
              <input name="targetDate" type="date" defaultValue={profile.targetDate ?? ''} />
            </SettingsField>
            <SettingsField
              description="Display food energy as kilocalories or kilojoules."
              title="Preferred energy unit"
            >
              <select name="preferredEnergyUnit" defaultValue={profile.preferredEnergyUnit}>
                <option value="kcal">Kilocalories (kcal)</option>
                <option value="kJ">Kilojoules (kJ)</option>
              </select>
            </SettingsField>
          </div>
          <SettingsField
            description="Add weigh-ins and sync measurements on the Nutrition page."
            id="weight-tracking"
            title="Enable weight tracking for this profile"
          >
            <input
              role="switch"
              name="weightTrackingEnabled"
              type="checkbox"
              defaultChecked={profile.weightTrackingEnabled}
            />
          </SettingsField>
          <p className={styles.notice}>
            Weight check-ins are associated with the active profile for personalization. Household
            profile selection is not access control, so use the app&apos;s account security for
            privacy. Each observation is stored separately so history is never overwritten.
          </p>
        </SettingsGroup>

        <SettingsGroup title={<>Food choices entered by you</>} id="food-choices">
          <p className={styles.notice}>
            These lists are used only as explicit factual inputs. Add one item per line or separate
            items with commas; the app does not infer allergies or preferences from behavior.
          </p>
          <div className={`settings-fields ${styles.grid}`}>
            <SettingsField
              description="Enter one preference per line, or separate preferences with commas."
              title="Dietary preferences (optional)"
            >
              <textarea
                name="dietaryPreferences"
                defaultValue={profile.dietaryPreferences.join('\n')}
              />
            </SettingsField>
            <SettingsField
              description="Enter only allergies you have explicitly identified, one per line."
              title="Food allergies (optional)"
            >
              <textarea name="foodAllergies" defaultValue={profile.foodAllergies.join('\n')} />
            </SettingsField>
            <SettingsField
              description="List foods or ingredients you want excluded from suggestions."
              title="Dietary exclusions (optional)"
            >
              <textarea
                name="dietaryExclusions"
                defaultValue={profile.dietaryExclusions.join('\n')}
              />
            </SettingsField>
          </div>
        </SettingsGroup>

        <SettingsGroup title={<>Nutrition display</>}>
          <p className={styles.notice}>
            These choices change only what this profile&apos;s Nutrition views display. They do not
            edit diary entries, meal plans, or goals.
          </p>
          <div className={`settings-fields ${styles.grid}`}>
            <fieldset className={styles.choiceGroup}>
              <legend>Nutrients shown in coverage</legend>
              <div className={styles.choiceGrid}>
                {nutrientDefinitions.map((item) => (
                  <label key={item.code}>
                    <input
                      type="checkbox"
                      name="visibleNutrientCodes"
                      value={item.code}
                      defaultChecked={profile.visibleNutrientCodes.includes(item.code)}
                    />
                    <span>
                      {item.displayName}
                      {item.category ? <small>{item.category}</small> : null}
                    </span>
                  </label>
                ))}
              </div>
              <p>Select between 1 and 12 nutrients.</p>
            </fieldset>
            <SettingsField
              description="The initial time span shown in your nutrition trends."
              title="Trend range"
            >
              <select name="trendRangeDays" defaultValue={profile.trendRangeDays}>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
              </select>
            </SettingsField>
          </div>
          <SettingsField
            description="Display planned intake alongside logged food."
            title="Show planned values in Nutrition charts"
          >
            <input
              role="switch"
              name="showPlannedNutrition"
              type="checkbox"
              defaultChecked={profile.showPlannedNutrition}
            />
          </SettingsField>
          <SettingsField
            description="Add the selected per-serving values to recipe cards."
            title="Show compact Nutrition facts on recipe-library cards"
          >
            <input
              role="switch"
              name="showRecipeCardNutrition"
              type="checkbox"
              defaultChecked={profile.showRecipeCardNutrition}
            />
          </SettingsField>
          <fieldset className={styles.choiceGroup}>
            <legend>Compact recipe-card nutrients</legend>
            <div className={styles.choiceGrid}>
              {[
                ['energy_kcal', 'Calories'],
                ['protein', 'Protein'],
                ['carbohydrate', 'Carbohydrate'],
                ['total_fat', 'Total fat'],
                ['fiber', 'Fiber'],
                ['sodium', 'Sodium'],
              ].map(([code, label]) => (
                <label key={code}>
                  <input
                    type="checkbox"
                    name="recipeCardNutrientCodes"
                    value={code}
                    defaultChecked={profile.recipeCardNutrientCodes.includes(code!)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <p>Select between 1 and 5 factual per-serving values.</p>
          </fieldset>
          <SettingsField
            description="Display available nutrition information while planning meals."
            title="Show Nutrition previews in the meal planner"
          >
            <input
              role="switch"
              name="showMealPlanNutrition"
              type="checkbox"
              defaultChecked={profile.showMealPlanNutrition}
            />
          </SettingsField>
        </SettingsGroup>

        <details className={`settings-disclosure ${styles.disclosure}`}>
          <summary>Advanced dates and reference defaults</summary>
          <SettingsGroup title={<>Dates and references</>}>
            <div className={`settings-fields ${styles.grid}`}>
              <SettingsField
                description="Determines the local day used for nutrition logs."
                title="Daily reset timezone"
              >
                <input
                  name="dailyResetTimezone"
                  defaultValue={profile.dailyResetTimezone}
                  required
                  maxLength={100}
                />
              </SettingsField>
              <SettingsField
                description="The first day used for weekly nutrition summaries."
                title="Week starts on"
              >
                <select name="weekStartsOn" defaultValue={profile.weekStartsOn}>
                  <option value="0">Sunday</option>
                  <option value="1">Monday</option>
                  <option value="2">Tuesday</option>
                  <option value="3">Wednesday</option>
                  <option value="4">Thursday</option>
                  <option value="5">Friday</option>
                  <option value="6">Saturday</option>
                </select>
              </SettingsField>
              <SettingsField
                description="Choose the regional nutrition reference used for daily values."
                title="Reference jurisdiction"
              >
                <input
                  name="referenceJurisdiction"
                  defaultValue={profile.referenceJurisdiction}
                  required
                  minLength={2}
                  maxLength={20}
                />
              </SettingsField>
            </div>
          </SettingsGroup>
        </details>

        <SettingsActionBar status={status}>
          <button
            className="primary-button compact"
            type="submit"
            disabled={saving}
            aria-busy={saving}
          >
            {saving ? <ButtonSpinner /> : null}
            {saving ? 'Saving…' : 'Save preferences'}
          </button>
        </SettingsActionBar>
      </form>
    </SettingsPane>
  );
}
