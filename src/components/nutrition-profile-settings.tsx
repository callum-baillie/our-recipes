'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';

import styles from '@/components/nutrition-profile-settings.module.css';

const CENTIMETERS_PER_INCH = 2.54;
const KILOGRAMS_PER_POUND = 0.45359237;

export type NutritionProfileSettingsValue = {
  id: string;
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

function displayedHeight(value: number | null, system: 'metric' | 'imperial') {
  return value === null
    ? ''
    : rounded(system === 'imperial' ? value / CENTIMETERS_PER_INCH : value);
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
  const height = optionalNumber(data.get('height'));
  const currentWeight = optionalNumber(data.get('currentWeight'));
  const targetWeight = optionalNumber(data.get('targetWeight'));
  return {
    expectedVersion: profile.version,
    settings: {
      dateOfBirth: optionalText(data.get('dateOfBirth')),
      heightCentimeters: canonicalHeight(height, system),
      currentWeightKilograms: canonicalWeight(currentWeight, system),
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
  const [measurementSystem, setMeasurementSystem] = useState(profile.measurementSystem);
  const [energyEstimate, setEnergyEstimate] = useState<EnergyEstimateResponse | null>(null);
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
      estimateOperationId.current = crypto.randomUUID();
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
    setStatus('Saving Nutrition settings…');
    const response = await fetch(`/api/v1/nutrition/profiles/${profile.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      setStatus(await responseMessage(response));
      return;
    }
    setStatus('Nutrition settings saved.');
    router.refresh();
  }

  const heightUnit = measurementSystem === 'imperial' ? 'in' : 'cm';
  const weightUnit = measurementSystem === 'imperial' ? 'lb' : 'kg';

  return (
    <section className={styles.panel} aria-labelledby="nutrition-profile-settings-heading">
      <header>
        <p className={styles.eyebrow}>Active profile</p>
        <h2 id="nutrition-profile-settings-heading">Nutrition settings</h2>
        <p>
          These choices apply to the household profile selected in the app header. Change the
          profile name or avatar from household profile settings.
        </p>
      </header>
      <form className={styles.form} onSubmit={save}>
        <fieldset aria-describedby="sensitive-input-explanation">
          <legend>Optional body and reference inputs</legend>
          <p id="sensitive-input-explanation" className={styles.notice}>
            Date of birth, body measurements, the source&apos;s sex category, activity and an
            explicit pregnancy or breastfeeding life stage are requested only to support a
            separately reviewed estimate you choose to enable. They are never inferred from recipes
            or diary activity. Manual goals need none of these values.
          </p>
          <div className={styles.grid}>
            <label>
              Measurement system
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
            </label>
            <label>
              Date of birth <span>Optional</span>
              <input name="dateOfBirth" type="date" defaultValue={profile.dateOfBirth ?? ''} />
            </label>
            <label>
              Height ({heightUnit}) <span>Optional</span>
              <input
                key={`height-${measurementSystem}`}
                name="height"
                type="number"
                min="0.0001"
                step="any"
                defaultValue={displayedHeight(profile.heightCentimeters, measurementSystem)}
              />
            </label>
            <label>
              Current weight ({weightUnit}) <span>Optional</span>
              <input
                key={`current-weight-${measurementSystem}`}
                name="currentWeight"
                type="number"
                min="0.0001"
                step="any"
                defaultValue={displayedWeight(profile.currentWeightKilograms, measurementSystem)}
              />
            </label>
            <label>
              Reference source sex category <span>Optional</span>
              <select name="referenceSexCategory" defaultValue={profile.referenceSexCategory ?? ''}>
                <option value="">Not provided</option>
                <option value="female">Female category used by the source</option>
                <option value="male">Male category used by the source</option>
              </select>
            </label>
            <label>
              Activity level <span>Optional</span>
              <select name="activityLevel" defaultValue={profile.activityLevel ?? ''}>
                <option value="">Not provided</option>
                <option value="sedentary">Sedentary</option>
                <option value="light">Light</option>
                <option value="moderate">Moderate</option>
                <option value="active">Active</option>
                <option value="very_active">Very active</option>
              </select>
            </label>
            <label>
              Explicit life stage <span>Optional</span>
              <select
                name="explicitlyEnteredLifeStage"
                defaultValue={profile.explicitlyEnteredLifeStage ?? ''}
              >
                <option value="">Not provided</option>
                <option value="pregnant">Pregnancy explicitly entered</option>
                <option value="breastfeeding">Breastfeeding explicitly entered</option>
              </select>
            </label>
          </div>
          <div className={styles.checks}>
            <label>
              <input
                name="estimatedTargetsEnabled"
                type="checkbox"
                defaultChecked={profile.estimatedTargetsEnabled}
              />
              Save these inputs for estimated-target use
            </label>
            <label>
              <input
                name="estimatedTargetConsent"
                type="checkbox"
                defaultChecked={profile.estimatedTargetConsent}
              />
              I explicitly consent to using the entered values for a documented estimate
            </label>
          </div>
          <p className={styles.warning}>
            Saving these inputs does not calculate, create, or replace a goal. Estimated targets
            remain unavailable until a versioned reference method is separately selected and
            applied. You can continue using manual goals.
          </p>
          <div className={styles.estimateBox}>
            <h3>Preview an adult maintenance-energy estimate</h3>
            <p>
              Adults age 19+ who are not pregnant or breastfeeding can preview the NASEM 2023 Table
              5-16 equation. Choose a fresh activity category below; the generic activity field
              above is never translated automatically.
            </p>
            <label>
              Estimate effective date
              <input name="estimateEffectiveOn" type="date" defaultValue={effectiveOn} />
            </label>
            <label>
              NASEM physical-activity category
              <select name="estimatePalCategory" defaultValue="">
                <option value="">Choose after reviewing the descriptions</option>
                <option value="inactive">Inactive</option>
                <option value="low_active">Low active</option>
                <option value="active">Active</option>
                <option value="very_active">Very active</option>
              </select>
            </label>
            <details>
              <summary>How USDA describes these four categories</summary>
              <ul>
                <li>
                  Inactive: activities of daily living only, with little activity beyond them.
                </li>
                <li>Low active: daily living plus 60–80 minutes of moderate activity per week.</li>
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
              onClick={(event) => void requestEnergyEstimate('preview', event.currentTarget.form!)}
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
                  <label>
                    Current calorie goal to supersede explicitly
                    <select name="supersedesGoalVersionId" defaultValue="">
                      <option value="">Choose the exact current version</option>
                      {energyEstimate.currentEnergyGoals.map((goal) => (
                        <option key={goal.id} value={goal.id}>
                          {goal.value} {goal.unit} · {goal.sourceType} · revision {goal.revision}
                        </option>
                      ))}
                    </select>
                  </label>
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
        </fieldset>

        <fieldset>
          <legend>Goals and tracking choices</legend>
          <div className={styles.grid}>
            <label>
              Nutrition goal type
              <select name="nutritionGoalType" defaultValue={profile.nutritionGoalType}>
                <option value="none">No body-weight goal</option>
                <option value="maintain">Maintain</option>
                <option value="gain">Gain</option>
                <option value="loss">Loss</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label>
              Target weight ({weightUnit}) <span>Optional</span>
              <input
                key={`target-weight-${measurementSystem}`}
                name="targetWeight"
                type="number"
                min="0.0001"
                step="any"
                defaultValue={displayedWeight(profile.targetWeightKilograms, measurementSystem)}
              />
            </label>
            <label>
              Target date <span>Optional</span>
              <input name="targetDate" type="date" defaultValue={profile.targetDate ?? ''} />
            </label>
            <label>
              Preferred energy unit
              <select name="preferredEnergyUnit" defaultValue={profile.preferredEnergyUnit}>
                <option value="kcal">Kilocalories (kcal)</option>
                <option value="kJ">Kilojoules (kJ)</option>
              </select>
            </label>
          </div>
          <label className={styles.inlineCheck}>
            <input
              name="weightTrackingEnabled"
              type="checkbox"
              defaultChecked={profile.weightTrackingEnabled}
            />
            Show weight tracking for this profile
          </label>
        </fieldset>

        <fieldset>
          <legend>Food choices entered by you</legend>
          <p className={styles.notice}>
            These lists are used only as explicit factual inputs. Add one item per line or separate
            items with commas; the app does not infer allergies or preferences from behavior.
          </p>
          <div className={styles.grid}>
            <label>
              Dietary preferences <span>Optional</span>
              <textarea
                name="dietaryPreferences"
                defaultValue={profile.dietaryPreferences.join('\n')}
              />
            </label>
            <label>
              Food allergies <span>Optional</span>
              <textarea name="foodAllergies" defaultValue={profile.foodAllergies.join('\n')} />
            </label>
            <label>
              Dietary exclusions <span>Optional</span>
              <textarea
                name="dietaryExclusions"
                defaultValue={profile.dietaryExclusions.join('\n')}
              />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Nutrition display</legend>
          <p className={styles.notice}>
            These choices change only what this profile&apos;s Nutrition views display. They do not
            edit diary entries, meal plans, or goals.
          </p>
          <div className={styles.grid}>
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
            <label>
              Trend range
              <select name="trendRangeDays" defaultValue={profile.trendRangeDays}>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
              </select>
            </label>
          </div>
          <label className={styles.inlineCheck}>
            <input
              name="showPlannedNutrition"
              type="checkbox"
              defaultChecked={profile.showPlannedNutrition}
            />
            Show planned values in Nutrition charts
          </label>
          <label className={styles.inlineCheck}>
            <input
              name="showRecipeCardNutrition"
              type="checkbox"
              defaultChecked={profile.showRecipeCardNutrition}
            />
            Show compact Nutrition facts on recipe-library cards
          </label>
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
          <label className={styles.inlineCheck}>
            <input
              name="showMealPlanNutrition"
              type="checkbox"
              defaultChecked={profile.showMealPlanNutrition}
            />
            Show Nutrition previews in the meal planner
          </label>
        </fieldset>

        <fieldset>
          <legend>Dates and references</legend>
          <div className={styles.grid}>
            <label>
              Daily reset timezone
              <input
                name="dailyResetTimezone"
                defaultValue={profile.dailyResetTimezone}
                required
                maxLength={100}
              />
            </label>
            <label>
              Week starts on
              <select name="weekStartsOn" defaultValue={profile.weekStartsOn}>
                <option value="0">Sunday</option>
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
                <option value="6">Saturday</option>
              </select>
            </label>
            <label>
              Reference jurisdiction
              <input
                name="referenceJurisdiction"
                defaultValue={profile.referenceJurisdiction}
                required
                minLength={2}
                maxLength={20}
              />
            </label>
          </div>
        </fieldset>

        <button className="primary-button" type="submit">
          Save Nutrition settings
        </button>
        <p className={styles.status} role="status" aria-live="polite">
          {status}
        </p>
      </form>
    </section>
  );
}
