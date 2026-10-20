'use client';

import { validTimeZone } from '@/lib/domain/regional';
import type { BodyMetrics } from '@/lib/domain/body-metrics';
import { SettingsMergeReview, settingsFieldLabel } from './settings-merge-review';
import { ButtonSpinner } from './skeleton';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { RegionalChoice } from './regional-choice';
import { NutrientPicker } from './nutrient-picker';
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

type NutritionSettingsDraft = Omit<
  NutritionProfileSettingsValue,
  'id' | 'version' | 'currentWeightKilograms' | 'advancedMetrics'
>;
const nutritionSettingsFields = [
  'dateOfBirth',
  'heightCentimeters',
  'measurementSystem',
  'referenceSexCategory',
  'activityLevel',
  'nutritionGoalType',
  'targetWeightKilograms',
  'targetDate',
  'explicitlyEnteredLifeStage',
  'dietaryPreferences',
  'foodAllergies',
  'dietaryExclusions',
  'estimatedTargetsEnabled',
  'estimatedTargetConsent',
  'weightTrackingEnabled',
  'preferredEnergyUnit',
  'dailyResetTimezone',
  'weekStartsOn',
  'referenceJurisdiction',
  'visibleNutrientCodes',
  'trendRangeDays',
  'showPlannedNutrition',
  'showRecipeCardNutrition',
  'recipeCardNutrientCodes',
  'showMealPlanNutrition',
] as const;
function settingsValues(value: NutritionProfileSettingsValue): NutritionSettingsDraft {
  return Object.fromEntries(
    nutritionSettingsFields.map((key) => [key, value[key]]),
  ) as NutritionSettingsDraft;
}
function settingsResponse(raw: NutritionProfileSettingsValue): NutritionProfileSettingsValue {
  const value = { ...raw };
  for (const key of [
    'dietaryPreferences',
    'foodAllergies',
    'dietaryExclusions',
    'visibleNutrientCodes',
    'recipeCardNutrientCodes',
  ] as const) {
    const stored: unknown = value[key];
    const parsed: unknown = typeof stored === 'string' ? JSON.parse(stored) : stored;
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string'))
      throw new Error('Current preferences could not be read. Your draft is retained.');
    value[key] = parsed;
    if (!Array.isArray(value[key]) || value[key].some((item) => typeof item !== 'string'))
      throw new Error('Current preferences could not be read. Your draft is retained.');
  }
  return value;
}
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

async function responseMessage(response: Response, form?: HTMLFormElement) {
  try {
    const body = (await response.json()) as {
      error?: {
        message?: string;
        issues?: Array<{ path: Array<string | number>; message: string }>;
      };
    };
    const issue = body.error?.issues?.[0];
    if (issue && form) {
      const key = String(issue.path.at(-1));
      const name =
        key === 'heightCentimeters'
          ? form.elements.namedItem('height')
            ? 'height'
            : 'heightFeet'
          : key === 'targetWeightKilograms'
            ? 'targetWeight'
            : key;
      const element = form.elements.namedItem(name);
      const field =
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
          ? element
          : null;
      if (field) {
        for (let parent = field.parentElement; parent; parent = parent.parentElement)
          if (parent instanceof HTMLDetailsElement) parent.open = true;
        field.setCustomValidity(issue.message);
        field.setAttribute('aria-invalid', 'true');
        field.setAttribute('aria-describedby', 'nutrition-save-status');
        requestAnimationFrame(() => {
          field.focus();
          field.reportValidity();
        });
      }
    }
    return issue?.message ?? body.error?.message ?? 'The profile could not be saved.';
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
  personName = 'This person',
}: {
  profile: NutritionProfileSettingsValue;
  effectiveOn: string;
  personName?: string;
  nutrientDefinitions?: Array<{
    code: string;
    displayName: string;
    category?: string;
    canonicalUnit?: string;
  }>;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const lock = useRef(false);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedProfile, setSavedProfile] = useState(profile);
  const [renderProfile, setRenderProfile] = useState(profile);
  const [formGeneration, setFormGeneration] = useState(0);
  const [conflictDraft, setConflictDraft] = useState<NutritionSettingsDraft | null>(null);
  const [currentProfile, setCurrentProfile] = useState<NutritionProfileSettingsValue | null>(null);
  const [measurementSystem, setMeasurementSystem] = useState(profile.measurementSystem);
  const height = useRef(profile.heightCentimeters);
  const targetWeight = useRef(profile.targetWeightKilograms);
  function heightDisplay(cm: number | null) {
    if (cm === null) return { cm: '', feet: '', inches: '' };
    const tenths = Math.round((cm / 2.54) * 10);
    return {
      cm: String(Number(cm.toFixed(1))),
      feet: String(Math.floor(tenths / 120)),
      inches: String((tenths % 120) / 10),
    };
  }
  const [heightInput, setHeightInput] = useState(() => heightDisplay(profile.heightCentimeters));
  const [weightInput, setWeightInput] = useState(() =>
    profile.targetWeightKilograms === null
      ? ''
      : String(
          Number(
            (
              profile.targetWeightKilograms /
              (profile.measurementSystem === 'imperial' ? KILOGRAMS_PER_POUND : 1)
            ).toFixed(1),
          ),
        ),
  );
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const baseline = useRef<string | null>(null);
  const [energyEstimate, setEnergyEstimate] = useState<EnergyEstimateResponse | null>(null);
  const [estimateStatus, setEstimateStatus] = useState('');
  const [estimatePending, setEstimatePending] = useState<'preview' | 'apply' | null>(null);
  const [reviewBasis, setReviewBasis] = useState<{
    expectedProfileVersion: number;
    effectiveOn: string;
    palCategory: string;
  } | null>(null);
  const [optionalInputsOpen, setOptionalInputsOpen] = useState(false);
  const estimateOperationId = useRef<string | null>(null);
  function settingsSnapshot(data: FormData) {
    const request = nutritionProfileUpdateRequest(savedProfile, data);
    request.settings.heightCentimeters = height.current;
    request.settings.targetWeightKilograms = targetWeight.current;
    return request;
  }
  useEffect(() => {
    if (!formRef.current || lock.current) return;
    const snapshot = JSON.stringify(settingsSnapshot(new FormData(formRef.current)).settings);
    if (baseline.current === null) baseline.current = snapshot;
    setDirty(snapshot !== baseline.current);
    // The revision records changes after controlled and hidden fields have rendered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);
  function invalidateEstimate() {
    setEnergyEstimate(null);
    setReviewBasis(null);
    estimateOperationId.current = null;
    setEstimateStatus('Inputs changed. Preview again before applying.');
  }
  function changeUnits(system: 'metric' | 'imperial') {
    setMeasurementSystem(system);
    setHeightInput(heightDisplay(height.current));
    setWeightInput(
      targetWeight.current === null
        ? ''
        : String(
            Number(
              (targetWeight.current / (system === 'imperial' ? KILOGRAMS_PER_POUND : 1)).toFixed(1),
            ),
          ),
    );
  }
  function editHeight(part: 'cm' | 'feet' | 'inches', value: string) {
    const next = { ...heightInput, [part]: value };
    setHeightInput(next);
    height.current =
      measurementSystem === 'metric'
        ? next.cm === ''
          ? null
          : Number(next.cm)
        : next.feet === '' && next.inches === ''
          ? null
          : (Number(next.feet) * 12 + Number(next.inches)) * 2.54;
  }
  async function requestEnergyEstimate(action: 'preview' | 'apply', form: HTMLFormElement) {
    if (lock.current || dirty || conflictDraft) {
      setEstimateStatus(
        'Save the intended preferences and consent before previewing their saved snapshot.',
      );
      return;
    }
    const data = new FormData(form);
    const basis =
      action === 'apply'
        ? reviewBasis
        : {
            expectedProfileVersion: savedProfile.version,
            effectiveOn: String(data.get('estimateEffectiveOn')),
            palCategory: String(data.get('estimatePalCategory')),
          };
    if (!basis?.palCategory || !basis.effectiveOn) {
      setEstimateStatus('Choose an effective date and a physical-activity category.');
      return;
    }
    if (action === 'apply' && !estimateOperationId.current)
      estimateOperationId.current = createClientUuid();
    lock.current = true;
    setEstimatePending(action);
    setEstimateStatus(
      action === 'preview' ? 'Calculating the saved snapshot…' : 'Applying the reviewed estimate…',
    );
    try {
      const response = await fetch(`/api/v1/nutrition/profiles/${profile.id}/goals/estimate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action,
          ...basis,
          ...(action === 'apply'
            ? {
                operationId: estimateOperationId.current,
                supersedesGoalVersionId: data.get('supersedesGoalVersionId') || null,
              }
            : {}),
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const result = (await response.json()) as EnergyEstimateResponse;
      setEnergyEstimate(result);
      setReviewBasis(basis);
      if (action === 'preview') {
        estimateOperationId.current = null;
        setEstimateStatus(
          'Preview ready. Review its date, source and replacement before applying.',
        );
      } else {
        setEstimateStatus('The reviewed maintenance-energy goal was saved.');
        router.refresh();
      }
    } catch (error) {
      setEstimateStatus(
        error instanceof Error && !(error instanceof TypeError)
          ? error.message
          : 'The response was not received. An exact Apply retry keeps the same operation; review goals before starting a different operation.',
      );
    } finally {
      lock.current = false;
      setEstimatePending(null);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || conflictDraft) return;
    const form = event.currentTarget;
    const request = settingsSnapshot(new FormData(form));
    for (const [name, limit] of [
      ['visibleNutrientCodes', 12],
      ['recipeCardNutrientCodes', 5],
    ] as const) {
      if (request.settings[name].length < 1 || request.settings[name].length > limit) {
        const picker = form.querySelector<HTMLElement>(`[data-nutrient-picker="${name}"]`);
        picker?.querySelectorAll('details').forEach((details) => {
          details.open = true;
        });
        for (let parent = picker?.parentElement; parent; parent = parent.parentElement)
          if (parent instanceof HTMLDetailsElement) parent.open = true;
        picker?.querySelector<HTMLInputElement>('input[type=checkbox]')?.focus();
        setStatus(
          `Choose 1–${limit} ${name === 'visibleNutrientCodes' ? 'coverage' : 'compact-card'} nutrients before saving.`,
        );
        return;
      }
    }

    lock.current = true;
    setSaving(true);
    setStatus('Saving preferences…');
    setEnergyEstimate(null);
    setReviewBasis(null);
    estimateOperationId.current = null;
    try {
      const response = await fetch(`/api/v1/nutrition/profiles/${profile.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        if (response.status === 409) {
          setConflictDraft(request.settings as NutritionSettingsDraft);
          setCurrentProfile(null);
        }
        throw new Error(await responseMessage(response, form));
      }
      const body = await response.json();
      const acknowledged = body.profile as Partial<NutritionProfileSettingsValue> &
        Record<string, unknown>;
      const acknowledgedList = (
        key:
          | 'dietaryPreferences'
          | 'foodAllergies'
          | 'dietaryExclusions'
          | 'visibleNutrientCodes'
          | 'recipeCardNutrientCodes',
      ) => {
        const value = acknowledged[key];
        if (Array.isArray(value))
          return value.filter((item): item is string => typeof item === 'string');
        if (typeof value === 'string') {
          try {
            const parsed: unknown = JSON.parse(value);
            if (Array.isArray(parsed))
              return parsed.filter((item): item is string => typeof item === 'string');
          } catch {
            /* Retain the submitted list if a response omits its stored representation. */
          }
        }
        return request.settings[key];
      };
      const next = {
        ...savedProfile,
        ...request.settings,
        ...acknowledged,
        dietaryPreferences: acknowledgedList('dietaryPreferences'),
        foodAllergies: acknowledgedList('foodAllergies'),
        dietaryExclusions: acknowledgedList('dietaryExclusions'),
        visibleNutrientCodes: acknowledgedList('visibleNutrientCodes'),
        recipeCardNutrientCodes: acknowledgedList('recipeCardNutrientCodes'),
      } as NutritionProfileSettingsValue;
      setSavedProfile(next);
      updateFormProfile(next);
      baseline.current = JSON.stringify(settingsValues(next));
      setDirty(false);
      setStatus(`${personName}'s Nutrition preferences saved.`);
      router.refresh();
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'Unable to save. Check your connection and retry.',
      );
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  async function loadCurrentProfile() {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    setCurrentProfile(null);
    setStatus('Loading current preferences…');
    try {
      const response = await fetch(`/api/v1/nutrition/profiles/${profile.id}?scope=settings`, {
        cache: 'no-store',
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message ?? 'Could not load current preferences.');
      const current = settingsResponse(body.profile);
      if (current.id !== profile.id)
        throw new Error('The response belongs to another person. Your draft is retained.');
      setCurrentProfile(current);
      setStatus('Current preferences loaded. Review concurrent changes.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not load current preferences.');
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  function updateFormProfile(next: NutritionProfileSettingsValue) {
    setRenderProfile(next);
    height.current = next.heightCentimeters;
    targetWeight.current = next.targetWeightKilograms;
    setMeasurementSystem(next.measurementSystem);
    setHeightInput(heightDisplay(next.heightCentimeters));
    setWeightInput(
      next.targetWeightKilograms === null
        ? ''
        : String(
            Number(
              (
                next.targetWeightKilograms /
                (next.measurementSystem === 'imperial' ? KILOGRAMS_PER_POUND : 1)
              ).toFixed(1),
            ),
          ),
    );
    setFormGeneration((value) => value + 1);
  }
  function reconcileProfile(reviewed: NutritionSettingsDraft) {
    if (!currentProfile) return;
    setSavedProfile(currentProfile);
    baseline.current = JSON.stringify(settingsValues(currentProfile));
    updateFormProfile({ ...currentProfile, ...reviewed });
    setConflictDraft(null);
    setCurrentProfile(null);
    invalidateEstimate();
    setDirty(JSON.stringify(reviewed) !== baseline.current);
    setStatus('Reviewed preferences are ready. Save explicitly before another estimate preview.');
  }
  const estimatePrerequisites = [
    !validTimeZone(savedProfile.dailyResetTimezone) && 'Correct and save the Nutrition time zone.',
    !savedProfile.estimatedTargetsEnabled && 'Enable optional estimates and save preferences.',
    !savedProfile.estimatedTargetConsent && 'Review and save explicit estimate consent.',
    !savedProfile.dateOfBirth && 'Save a date of birth.',
    savedProfile.heightCentimeters === null && 'Save a measured height.',
    savedProfile.currentWeightKilograms === null && 'Record a current weight in Nutrition.',
    !savedProfile.referenceSexCategory && 'Save a reference source sex category.',
    savedProfile.explicitlyEnteredLifeStage &&
      'This maintenance method does not support the saved pregnancy or breastfeeding life stage.',
  ].filter(Boolean);
  const weightUnit = measurementSystem === 'imperial' ? 'lb' : 'kg';

  return (
    <SettingsPane
      className={styles.panel}
      title="Nutrition preferences"
      description={`${personName} · Preferences follow this selected household Nutrition profile. Identity and appearance are in My profile.`}
    >
      <form
        ref={formRef}
        className={styles.form}
        onSubmit={save}
        onChangeCapture={(event) => {
          const target = event.target;
          if (
            target instanceof HTMLInputElement ||
            target instanceof HTMLSelectElement ||
            target instanceof HTMLTextAreaElement
          ) {
            target.setCustomValidity('');
            target.removeAttribute('aria-invalid');
          }
        }}
        onChange={(event) => {
          const input = event.target;
          if (!(
            input instanceof HTMLInputElement ||
            input instanceof HTMLSelectElement ||
            input instanceof HTMLTextAreaElement
          ))
            return;
          const name = input.name;
          if (!name) return;
          if (
            ['estimateEffectiveOn', 'estimatePalCategory', 'supersedesGoalVersionId'].includes(name)
          ) {
            if (name !== 'supersedesGoalVersionId') invalidateEstimate();
            else estimateOperationId.current = null;
          } else {
            setRevision((value) => value + 1);
            if (energyEstimate) invalidateEstimate();
            setStatus('');
          }
        }}
        onInvalidCapture={(event) => {
          const field = event.target as HTMLElement;
          for (let parent = field.parentElement; parent; parent = parent.parentElement)
            if (parent instanceof HTMLDetailsElement) parent.open = true;
          setStatus('Check the highlighted field. Your draft has been retained.');
        }}
      >
        <nav className="settings-section-index" aria-label="Nutrition preference sections">
          {[
            ['nutrition-display', 'Display and units'],
            ['nutrition-goals', 'Goals and tracking'],
            ['food-choices', 'Food choices'],
            ['optional-estimates', 'Optional estimates'],
            ['nutrition-dates', 'Dates and references'],
            ['nutrition-save', 'Save'],
          ].map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={() => {
                const target = document.getElementById(id!);
                if (target instanceof HTMLDetailsElement) target.open = true;
              }}
            >
              {label}
            </a>
          ))}
        </nav>
        <fieldset
          key={formGeneration}
          disabled={saving || estimatePending !== null || Boolean(conflictDraft)}
          className="settings-form-fields"
        >
          <SettingsGroup title={<>Goals and tracking choices</>} id="nutrition-goals">
            <div className={`settings-fields ${styles.grid}`}>
              <SettingsField
                description="Describe your goal; this does not calculate or replace a calorie target."
                title="Nutrition goal type"
              >
                <select name="nutritionGoalType" defaultValue={renderProfile.nutritionGoalType}>
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
                  name="targetWeight"
                  type="number"
                  min="0.0001"
                  step="any"
                  value={weightInput}
                  onChange={(event) => {
                    setWeightInput(event.target.value);
                    targetWeight.current =
                      event.target.value === ''
                        ? null
                        : Number(event.target.value) *
                          (measurementSystem === 'imperial' ? KILOGRAMS_PER_POUND : 1);
                  }}
                />
              </SettingsField>
              <SettingsField
                description="An optional date to review progress toward your goal."
                title="Target date (optional)"
              >
                <input
                  name="targetDate"
                  type="date"
                  defaultValue={renderProfile.targetDate ?? ''}
                />
              </SettingsField>
              <SettingsField
                description="Display food energy as kilocalories or kilojoules."
                title="Preferred energy unit"
              >
                <select name="preferredEnergyUnit" defaultValue={renderProfile.preferredEnergyUnit}>
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
                defaultChecked={renderProfile.weightTrackingEnabled}
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
              These lists are used only as explicit factual inputs. Add one item per line or
              separate items with commas; the app does not infer allergies or preferences from
              behavior.
            </p>
            <div className={`settings-fields ${styles.grid}`}>
              <SettingsField
                description="Enter one preference per line, or separate preferences with commas."
                title="Dietary preferences (optional)"
              >
                <textarea
                  name="dietaryPreferences"
                  defaultValue={renderProfile.dietaryPreferences.join('\n')}
                />
              </SettingsField>
              <SettingsField
                description="Enter only allergies you have explicitly identified, one per line."
                title="Food allergies (optional)"
              >
                <textarea
                  name="foodAllergies"
                  defaultValue={renderProfile.foodAllergies.join('\n')}
                />
              </SettingsField>
              <SettingsField
                description="List foods or ingredients you want excluded from suggestions."
                title="Dietary exclusions (optional)"
              >
                <textarea
                  name="dietaryExclusions"
                  defaultValue={renderProfile.dietaryExclusions.join('\n')}
                />
              </SettingsField>
            </div>
          </SettingsGroup>

          <SettingsGroup title={<>Display and units</>} id="nutrition-display">
            <SettingsField
              description="Choose centimeters and kilograms, or feet, inches, and pounds."
              title="Measurement system"
            >
              <select
                name="measurementSystem"
                value={measurementSystem}
                onChange={(event) => changeUnits(event.target.value as 'metric' | 'imperial')}
              >
                <option value="metric">Metric</option>
                <option value="imperial">Imperial</option>
              </select>
            </SettingsField>
            <p className={styles.notice}>
              These choices change only what this profile&apos;s Nutrition views display. They do
              not edit diary entries, meal plans, or goals.
            </p>
            <div className={`settings-fields ${styles.grid}`}>
              <NutrientPicker
                name="visibleNutrientCodes"
                title="Nutrients shown in coverage"
                initial={renderProfile.visibleNutrientCodes}
                definitions={nutrientDefinitions}
                maximum={12}
                onChange={() => {
                  setStatus('');
                  setRevision((value) => value + 1);
                  if (energyEstimate) invalidateEstimate();
                }}
              />
              <SettingsField
                description="The initial time span shown in your nutrition trends."
                title="Trend range"
              >
                <select name="trendRangeDays" defaultValue={renderProfile.trendRangeDays}>
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
                defaultChecked={renderProfile.showPlannedNutrition}
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
                defaultChecked={renderProfile.showRecipeCardNutrition}
              />
            </SettingsField>
            <details className="settings-disclosure">
              <summary>Compact recipe-card choices · saved when hidden</summary>
              <NutrientPicker
                name="recipeCardNutrientCodes"
                title="Compact recipe-card nutrients"
                initial={renderProfile.recipeCardNutrientCodes}
                maximum={5}
                definitions={nutrientDefinitions.filter((item) =>
                  [
                    'energy_kcal',
                    'protein',
                    'carbohydrate',
                    'total_fat',
                    'fiber',
                    'sodium',
                  ].includes(item.code),
                )}
                onChange={() => {
                  setStatus('');
                  setRevision((value) => value + 1);
                  if (energyEstimate) invalidateEstimate();
                }}
              />
            </details>
            <SettingsField
              description="Display available nutrition information while planning meals."
              title="Show Nutrition previews in the meal planner"
            >
              <input
                role="switch"
                name="showMealPlanNutrition"
                type="checkbox"
                defaultChecked={renderProfile.showMealPlanNutrition}
              />
            </SettingsField>
          </SettingsGroup>

          <details
            className={`settings-disclosure ${styles.disclosure}`}
            id="optional-estimates"
            open={optionalInputsOpen}
            onToggle={(event) => setOptionalInputsOpen(event.currentTarget.open)}
          >
            <summary>
              Optional estimates ·{' '}
              {profile.heightCentimeters == null
                ? 'No saved height'
                : 'Saved body inputs available'}
            </summary>
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
                  description="Used only when you choose an age-based nutrition estimate."
                  title="Date of birth (optional)"
                >
                  <input
                    name="dateOfBirth"
                    type="date"
                    defaultValue={renderProfile.dateOfBirth ?? ''}
                  />
                </SettingsField>
                {measurementSystem === 'imperial' ? (
                  <fieldset className={styles.heightGroup}>
                    <legend>Height · optional</legend>
                    <SettingsField title="Feet">
                      <input
                        name="heightFeet"
                        type="number"
                        min="0"
                        max="9"
                        step="1"
                        value={heightInput.feet}
                        onChange={(event) => editHeight('feet', event.target.value)}
                      />
                    </SettingsField>
                    <SettingsField title="Inches">
                      <input
                        name="heightInches"
                        type="number"
                        min="0"
                        max="11.99"
                        step="0.1"
                        value={heightInput.inches}
                        onChange={(event) => editHeight('inches', event.target.value)}
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
                      value={heightInput.cm}
                      onChange={(event) => editHeight('cm', event.target.value)}
                    />
                  </SettingsField>
                )}
                <SettingsField
                  description="The category required by the selected nutrition reference method."
                  title="Reference source sex category (optional)"
                >
                  <select
                    name="referenceSexCategory"
                    defaultValue={renderProfile.referenceSexCategory ?? ''}
                  >
                    <option value="">Not provided</option>
                    <option value="female">Female (reference category)</option>
                    <option value="male">Male (reference category)</option>
                  </select>
                </SettingsField>
                <SettingsField
                  description="Record your usual activity level for nutrition personalization."
                  title="Activity level (optional)"
                >
                  <select name="activityLevel" defaultValue={renderProfile.activityLevel ?? ''}>
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
                    defaultValue={renderProfile.explicitlyEnteredLifeStage ?? ''}
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
                  title="Allow optional estimates using saved inputs"
                >
                  <input
                    role="switch"
                    name="estimatedTargetsEnabled"
                    type="checkbox"
                    defaultChecked={renderProfile.estimatedTargetsEnabled}
                  />
                </SettingsField>
                <SettingsField
                  description="Allow the selected calculation to use the measurements you provide."
                  title="I explicitly consent to using the entered values for a documented estimate"
                >
                  <input
                    name="estimatedTargetConsent"
                    type="checkbox"
                    defaultChecked={renderProfile.estimatedTargetConsent}
                  />
                </SettingsField>
              </div>
              <p className={styles.warning}>
                Saving these inputs does not calculate, create, or replace a goal. Estimated targets
                remain unavailable until a versioned reference method is separately selected and
                applied. You can continue using manual goals.
              </p>
              <div className={styles.estimateBox}>
                <h3>Preview saved inputs</h3>
                <p>
                  Save your intended body inputs, consent and preferences first. Preview uses saved
                  profile version {savedProfile.version} and the latest saved weight, not unsaved
                  fields. Disabling estimates keeps the stored inputs.
                </p>
                <a className="text-button" href="/nutrition?log=weight">
                  Record weight in Nutrition
                </a>
                {dirty && <p role="status">Unsaved preferences: save before previewing.</p>}
                {estimatePrerequisites.length > 0 && (
                  <div>
                    <p>Before previewing the saved snapshot:</p>
                    <ul>
                      {estimatePrerequisites.map((item) => (
                        <li key={String(item)}>{item}</li>
                      ))}
                    </ul>
                    <p>
                      Manual daily goals remain available in Nutrition without optional body inputs.
                    </p>
                  </div>
                )}
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
                <details className="settings-disclosure">
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
                    <li>
                      Very active: daily living plus 130 minutes of vigorous activity per week.
                    </li>
                  </ul>
                  <p>
                    Classification is uncertain. Select the closest description yourself; the app
                    does not infer it from steps, recipes, Pantry, or diary entries.
                  </p>
                </details>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={
                    dirty || saving || estimatePending !== null || estimatePrerequisites.length > 0
                  }
                  onClick={(event) =>
                    void requestEnergyEstimate('preview', event.currentTarget.form!)
                  }
                >
                  {estimatePending === 'preview'
                    ? 'Calculating…'
                    : 'Preview estimated maintenance calories'}
                </button>
                {energyEstimate?.estimate ? (
                  <section
                    className={styles.estimateResult}
                    aria-labelledby="energy-estimate-result"
                  >
                    <p>
                      {personName} · {reviewBasis?.effectiveOn} ·{' '}
                      {reviewBasis?.palCategory.replaceAll('_', ' ')} · Saved profile version{' '}
                      {reviewBasis?.expectedProfileVersion}
                    </p>
                    <h4 id="energy-estimate-result">
                      Estimated maintenance energy: {energyEstimate.estimate.roundedKcal} kcal/day
                    </h4>
                    <p>{energyEstimate.estimate.disclosure}</p>
                    <details>
                      <summary>Formula and source</summary>
                      <p>
                        {energyEstimate.estimate.formula}. Unrounded result:{' '}
                        {energyEstimate.estimate.exactKcal.toFixed(4)} kcal/day; displayed and
                        applied at the nearest whole kcal.
                      </p>
                      <p>
                        <a
                          href={energyEstimate.estimate.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
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
                              {goal.value} {goal.unit} · {goal.sourceType} · revision{' '}
                              {goal.revision}
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
                      className="primary-button"
                      disabled={
                        dirty || estimatePending !== null || energyEstimate.action === 'applied'
                      }
                      onClick={(event) =>
                        void requestEnergyEstimate('apply', event.currentTarget.form!)
                      }
                    >
                      {estimatePending === 'apply'
                        ? 'Applying…'
                        : energyEstimate.action === 'applied'
                          ? 'Goal saved'
                          : 'Apply reviewed estimate'}
                    </button>
                  </section>
                ) : null}
                {estimateStatus && <p role="status">{estimateStatus}</p>}
              </div>
            </SettingsGroup>
          </details>

          <details id="nutrition-dates" className={`settings-disclosure ${styles.disclosure}`}>
            <summary>Advanced dates and reference defaults</summary>
            <SettingsGroup title={<>Dates and references</>}>
              <div className={`settings-fields ${styles.grid}`}>
                <SettingsField
                  description="Groups events into local Nutrition days; original event timestamps remain unchanged."
                  title="Daily reset timezone"
                >
                  <RegionalChoice
                    kind="timezone"
                    name="dailyResetTimezone"
                    defaultValue={renderProfile.dailyResetTimezone}
                    required
                    maxLength={100}
                  />
                </SettingsField>
                <SettingsField
                  description="The first day used for weekly nutrition summaries."
                  title="Week starts on"
                >
                  <select name="weekStartsOn" defaultValue={renderProfile.weekStartsOn}>
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
                  description="United States (US) is the available reference label. Stored custom labels round-trip; changing this label does not create goals or change calculations."
                  title="Reference jurisdiction"
                >
                  <input
                    list="reference-jurisdictions"
                    name="referenceJurisdiction"
                    defaultValue={renderProfile.referenceJurisdiction}
                    required
                    minLength={2}
                    maxLength={20}
                  />
                  <datalist id="reference-jurisdictions">
                    <option value="US">United States (stored reference)</option>
                  </datalist>
                </SettingsField>
              </div>
            </SettingsGroup>
          </details>
        </fieldset>
        {conflictDraft && (
          <section aria-label="Review changed Nutrition preferences">
            <p role="status">
              Preferences changed elsewhere. Your edits are retained for {personName}.
            </p>
            <button
              type="button"
              className="secondary-button"
              disabled={saving}
              onClick={() => void loadCurrentProfile()}
            >
              {saving ? 'Loading current preferences…' : 'Load current preferences'}
            </button>
            {currentProfile && (
              <SettingsMergeReview
                key={JSON.stringify(currentProfile)}
                baseline={settingsValues(savedProfile)}
                draft={conflictDraft}
                label={(path) =>
                  (
                    ({
                      heightCentimeters: 'Height (cm)',
                      targetWeightKilograms: 'Target weight (kg)',
                      estimatedTargetConsent: 'Estimate consent',
                      estimatedTargetsEnabled: 'Allow optional estimates',
                      dailyResetTimezone: 'Nutrition time zone',
                    }) as Record<string, string>
                  )[path[0]] ?? settingsFieldLabel(path)
                }
                current={settingsValues(currentProfile)}
                pending={saving}
                onResolve={reconcileProfile}
                onDiscard={() => reconcileProfile(settingsValues(currentProfile))}
              />
            )}
          </section>
        )}
        <div id="nutrition-save">
          <span id="nutrition-save-status" role="status">
            {status}
          </span>
          <SettingsActionBar status={dirty ? 'Unsaved preferences' : 'No unsaved preferences'}>
            <button
              className="primary-button compact"
              type="submit"
              disabled={saving || estimatePending !== null || !dirty || Boolean(conflictDraft)}
              aria-busy={saving}
            >
              {saving ? <ButtonSpinner /> : null}
              {saving && !conflictDraft ? 'Saving…' : `Save ${personName}'s preferences`}
            </button>
          </SettingsActionBar>
        </div>
      </form>
    </SettingsPane>
  );
}
