'use client';

import { BodyCompositionEstimatePanel } from './body-composition-estimate';
import type { CompositionEstimate } from '@/lib/domain/qn-body-composition';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Link2, SlidersHorizontal, X } from 'lucide-react';
import { MultiValueCombobox } from './multi-value-combobox';
import { bodyMetricFields, bodyMetricsError, type BodyMetrics } from '@/lib/domain/body-metrics';
import { onboardingNutritionSchema, type OnboardingNutritionInput } from '@/lib/domain/setup';
import {
  nutritionOnboardingGuidance,
  onboardingPaces,
  onboardingTimeline,
} from '@/lib/domain/nutrition-onboarding-guidance';
import styles from './nutrition-onboarding-flow.module.css';

type Props = {
  value: OnboardingNutritionInput;
  onChange: (value: OnboardingNutritionInput) => void;
  units: 'metric' | 'imperial';
  timeZone: string;
  onBack: () => void;
  onComplete: () => void;
};
type Reading = {
  userId: string;
  userLabel?: string;
  weightKilograms: number;
  measuredAt: string;
  bodyFatPercent?: number;
  compositionEstimate?: CompositionEstimate;
};
type Device = { config: string; name: string; model: string };
const steps = [
  'Get started',
  'About you',
  'Measurements',
  'Activity',
  'Your goal',
  'Your target',
  'Food preferences',
  'Your routine',
  'Review',
];
const activityChoices = [
  ['sedentary', 'Mostly seated', 'Mostly sitting, with little exercise.'],
  ['light', 'Lightly active', 'Some walking or light exercise, about 1–3 days a week.'],
  ['moderate', 'Moderately active', 'Regular movement and exercise, about 3–5 days a week.'],
  ['active', 'Very active', 'A physical job or hard exercise on most days.'],
  ['very_active', 'Highly active', 'A very physical job combined with demanding training.'],
] as const;

export function NutritionOnboardingFlow({
  value,
  onChange,
  units,
  timeZone,
  onBack,
  onComplete,
}: Props) {
  const [estimate, setEstimate] = useState<CompositionEstimate | null>(null);
  const [step, setStep] = useState(0);
  const [unit, setUnit] = useState(units);
  const [heightUnit, setHeightUnit] = useState(units);
  const totalHeightInches =
    value.heightCentimeters === null
      ? null
      : Math.round((value.heightCentimeters / 2.54) * 100) / 100;
  const heightFeet = totalHeightInches === null ? '' : Math.floor(totalHeightInches / 12);
  const heightInches =
    totalHeightInches === null ? '' : Number((totalHeightInches % 12).toFixed(2));
  const [error, setError] = useState('');
  const [advancedDraft, setAdvancedDraft] = useState<BodyMetrics>({});
  const [advancedError, setAdvancedError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [connectionId, setConnectionId] = useState<string | null>(value.vesyncConnectionId);
  const [devices, setDevices] = useState<Device[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [importNote, setImportNote] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState('US');
  const advanced = useRef<HTMLDialogElement>(null);
  const connection = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const today = new Date().toISOString().slice(0, 10);
  const guidance = nutritionOnboardingGuidance(value, today);
  const canSuggestPace =
    guidance.bmi !== null &&
    (value.nutritionGoalType !== 'loss' ||
      (guidance.canSuggestLoss &&
        (value.targetWeightKilograms === null ||
          value.targetWeightKilograms >= guidance.range!.min)));
  const timeline = canSuggestPace
    ? onboardingTimeline(
        value.currentWeightKilograms,
        value.targetWeightKilograms,
        value.weightGoalPace,
        value.nutritionGoalType,
        today,
      )
    : null;
  const changeGoal = value.nutritionGoalType === 'loss' || value.nutritionGoalType === 'gain';
  const visibleSteps = steps
    .map((label, index) => ({ label, index }))
    .filter((item) => item.index !== 5 || changeGoal);
  const position = visibleSteps.findIndex((item) => item.index === step);
  const weightFactor = unit === 'imperial' ? 2.2046226218 : 1;
  const weightUnit = unit === 'imperial' ? 'lb' : 'kg';
  const weightText = (kg: number) =>
    `${(kg * weightFactor).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${weightUnit}`;
  const update = (patch: Partial<OnboardingNutritionInput>) => onChange({ ...value, ...patch });
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  function navigate(direction: number) {
    setError('');
    if (direction < 0) {
      if (step === 0) onBack();
      else setStep(visibleSteps[position - 1]!.index);
      return;
    }
    const parsed = onboardingNutritionSchema.safeParse(value);
    const relevant: Record<number, string[]> = {
      1: ['dateOfBirth', 'referenceSexCategory'],
      2: ['heightCentimeters', 'currentWeightKilograms', 'advancedMetrics'],
      3: ['activityLevel', 'lifeStage'],
      5: ['targetWeightKilograms', 'targetDate'],
    };
    if (!parsed.success) {
      const issue = parsed.error.issues.find(
        (issue) => step === 8 || relevant[step]?.includes(String(issue.path[0])),
      );
      if (issue) {
        setError(issue.message);
        return;
      }
    }
    if (step === 8) {
      onComplete();
      return;
    }
    setStep(visibleSteps[position + 1]!.index);
  }
  function numberField(
    label: string,
    key: 'heightCentimeters' | 'currentWeightKilograms' | 'targetWeightKilograms',
    factor: number,
    suffix: string,
    max: number,
  ) {
    return (
      <label className={styles.field}>
        <span>{label}</span>
        <div className={styles.numberField}>
          <input
            aria-label={label}
            type="number"
            inputMode="decimal"
            min="0.1"
            max={max}
            step="any"
            value={value[key] === null ? '' : Number((value[key]! * factor).toFixed(3))}
            onChange={(event) =>
              update({
                [key]: event.target.value === '' ? null : Number(event.target.value) / factor,
                ...(key === 'currentWeightKilograms' ? { measurementRecordedAt: null } : {}),
              })
            }
          />
          <span>{suffix}</span>
        </div>
      </label>
    );
  }
  async function scaleRequest(payload: Record<string, unknown>) {
    const response = await fetch('/api/v1/setup/vesync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error?.message ?? 'The scale connection failed. Try again.');
    return result;
  }
  async function preview(id: string, config: string) {
    const result = await scaleRequest({ action: 'preview', connectionId: id, config });
    setReadings(result.readings);
    if (!result.readings.length)
      setConnectionError(
        'No recent measurements were returned. Sync your scale in VeSync, then try again.',
      );
  }
  async function connect(event: React.FormEvent) {
    event.preventDefault();
    setConnecting(true);
    setConnectionError('');
    setReadings([]);
    try {
      const result = await scaleRequest({ action: 'connect', email, password, country, timeZone });
      setPassword('');
      setConnectionId(result.connectionId);
      setDevices(result.devices);
      if (result.devices.length === 1) await preview(result.connectionId, result.devices[0].config);
    } catch (error) {
      setPassword('');
      setConnectionError(error instanceof Error ? error.message : 'Unable to connect.');
    } finally {
      setConnecting(false);
    }
  }
  async function chooseReading(reading: Reading) {
    setConnecting(true);
    setConnectionError('');
    try {
      const result = await scaleRequest({ action: 'select', connectionId, userId: reading.userId });
      const imported = result.reading as Reading;
      setEstimate(imported.compositionEstimate ?? null);
      update({
        currentWeightKilograms: imported.weightKilograms,
        advancedMetrics: {
          ...value.advancedMetrics,
          ...(imported.bodyFatPercent !== undefined
            ? { bodyFatPercent: imported.bodyFatPercent }
            : {}),
        },
        measurementRecordedAt: imported.measuredAt,
        vesyncConnectionId: connectionId,
        weightTrackingEnabled: true,
      });
      setImportNote(
        `Weight${imported.bodyFatPercent !== undefined ? ' and body fat' : ''} imported from ${new Date(imported.measuredAt).toLocaleDateString()}. Review the measurement date; other VeSync readings can be entered under Advanced measurements.`,
      );
      connection.current?.close();
    } catch (error) {
      setConnectionError(
        error instanceof Error ? error.message : 'Unable to import this measurement.',
      );
    } finally {
      setConnecting(false);
    }
  }
  async function disconnect() {
    setConnecting(true);
    try {
      if (connectionId) await scaleRequest({ action: 'disconnect', connectionId });
    } catch {
      /* An expired pending connection can still be removed from the local draft. */
    } finally {
      setConnectionId(null);
      setDevices([]);
      setReadings([]);
      update({ vesyncConnectionId: null, measurementRecordedAt: null });
      setImportNote('Scale disconnected. Your entered measurements are still available to review.');
      setConnecting(false);
    }
  }
  const canEstimate = guidance.maintenance !== null;
  return (
    <div className={styles.flow}>
      <div className={styles.progress}>
        <span>
          Nutrition · {position + 1} of {visibleSteps.length}
        </span>
        <span>{steps[step]}</span>
        <progress max={visibleSteps.length} value={position + 1} />
      </div>
      <h2 ref={heading} tabIndex={-1} className={styles.title}>
        {
          [
            'Let’s make nutrition fit you',
            'A little about you',
            'What are your measurements?',
            'How active is your usual week?',
            'What would you like to work towards?',
            'Choose a manageable target',
            'What works for you at the table?',
            'Make this part of your routine',
            'Your nutrition starting point',
          ][step]
        }
      </h2>
      <p className={styles.lead}>
        {
          [
            'A few short steps. Share what you know and leave anything else blank. You can change it later.',
            'Your birthday lets us calculate your age. The formula category is only needed for energy estimates.',
            'Use your own measurements or import a weigh-in. Calculations appear once there is enough information.',
            'Include your daily routine as well as exercise. Choose the closest description, or leave this for later.',
            'Choose a direction. A weight target is optional.',
            'These are planning estimates. Progress varies, so revisit the target as you go.',
            'Choose suggestions or type your own. Leave a question blank if it does not apply.',
            'Keep the features that will be useful to you.',
            'Review what you entered and decide whether you want estimated energy guidance.',
          ][step]
        }
      </p>
      {step === 0 ? (
        <div className={styles.startOptions}>
          <button
            type="button"
            className={styles.linkCard}
            onClick={() => {
              setConnectionError('');
              connection.current?.showModal();
            }}
          >
            <Link2 />
            <span>
              <strong>
                {value.vesyncConnectionId
                  ? 'Review VeSync connection'
                  : 'Connect a weight tracking app'}
              </strong>
              <small>VeSync · Etekcity ESF24</small>
            </span>
            <ArrowRight />
          </button>
          <p className={styles.hint}>
            You’ll sign in, choose your scale user, and review the measurement before it is used.
          </p>
          <button type="button" className={styles.secondary} onClick={() => navigate(1)}>
            Enter my details manually
          </button>
          <button type="button" className={styles.textButton} onClick={onComplete}>
            Set up nutrition later
          </button>
        </div>
      ) : null}
      {step === 1 ? (
        <div className={styles.stack}>
          <label className={styles.field}>
            <span>When were you born?</span>
            <input
              type="date"
              max={today}
              value={value.dateOfBirth}
              onChange={(e) => update({ dateOfBirth: e.target.value })}
            />
            <small>
              {guidance.age !== null
                ? `Age ${guidance.age} · calculated from your birthday`
                : 'Optional. Your birthday stays in your profile.'}
            </small>
          </label>
          <fieldset className={styles.question}>
            <legend>Which reference category should energy estimates use?</legend>
            <p>
              These formulas use female or male reference data. This does not define your gender.
            </p>
            <div className={styles.inlineChoices}>
              {(
                [
                  ['female', 'Female reference'],
                  ['male', 'Male reference'],
                  ['', 'Skip estimates'],
                ] as const
              ).map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={(value.referenceSexCategory ?? '') === key}
                  onClick={() => update({ referenceSexCategory: key || null })}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      ) : null}
      {step === 2 ? (
        <>
          <div className={styles.units} role="group" aria-label="Weight units">
            <button
              type="button"
              aria-pressed={unit === 'metric'}
              onClick={() => setUnit('metric')}
            >
              Kilograms
            </button>
            <button
              type="button"
              aria-pressed={unit === 'imperial'}
              onClick={() => setUnit('imperial')}
            >
              Pounds
            </button>
          </div>
          <div className={styles.fields}>
            <fieldset className={styles.question}>
              <legend>Height</legend>
              <div className={styles.units} role="group" aria-label="Height units">
                <button
                  type="button"
                  aria-pressed={heightUnit === 'imperial'}
                  onClick={() => setHeightUnit('imperial')}
                >
                  Feet &amp; inches
                </button>
                <button
                  type="button"
                  aria-pressed={heightUnit === 'metric'}
                  onClick={() => setHeightUnit('metric')}
                >
                  Centimetres
                </button>
              </div>
              {heightUnit === 'metric' ? (
                numberField('Height in centimetres', 'heightCentimeters', 1, 'cm', 300)
              ) : (
                <div className={styles.fields}>
                  <label className={styles.field}>
                    <span>Feet</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max="9"
                      step="1"
                      value={heightFeet}
                      onChange={(event) => {
                        const feet = Number(event.target.value);
                        if (!Number.isInteger(feet) || feet < 0 || feet > 9) return;
                        const inches = feet * 12 + Number(heightInches);
                        update({
                          heightCentimeters: inches ? Number((inches * 2.54).toFixed(4)) : null,
                        });
                      }}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Inches</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max="11.99"
                      step="any"
                      value={heightInches}
                      onChange={(event) => {
                        const extra = Number(event.target.value);
                        if (!Number.isFinite(extra) || extra < 0 || extra >= 12) return;
                        const inches = Number(heightFeet) * 12 + extra;
                        update({
                          heightCentimeters: inches ? Number((inches * 2.54).toFixed(4)) : null,
                        });
                      }}
                    />
                  </label>
                </div>
              )}
            </fieldset>
            {numberField(
              'Current weight',
              'currentWeightKilograms',
              weightFactor,
              weightUnit,
              1000 * weightFactor,
            )}
          </div>
          <div className={styles.inlineActions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                setAdvancedDraft({ ...value.advancedMetrics });
                setAdvancedError('');
                advanced.current?.showModal();
              }}
            >
              <SlidersHorizontal size={18} /> Advanced measurements
              {Object.values(value.advancedMetrics).some((v) => v != null) ? ' · added' : ''}
            </button>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => connection.current?.showModal()}
            >
              <Link2 size={18} />{' '}
              {value.vesyncConnectionId ? 'VeSync connected' : 'Import from VeSync'}
            </button>
          </div>
          {guidance.bmi !== null ? (
            <aside className={styles.insight}>
              <strong>Your BMI is {guidance.bmi.toFixed(1)}</strong>
              <p>
                For your height, the adult BMI reference range corresponds to approximately{' '}
                {weightText(guidance.range!.min)}–{weightText(guidance.range!.max)}.
              </p>
              <small>
                BMI is a screening measure. It does not distinguish muscle from fat or determine
                your personal ideal weight.{' '}
                <a
                  href="https://www.cdc.gov/bmi/adult-calculator/"
                  target="_blank"
                  rel="noreferrer"
                >
                  About BMI
                </a>
              </small>
            </aside>
          ) : (
            <p className={styles.hint}>
              Adult BMI guidance appears after you enter your birthday, height and weight. Adult
              reference ranges are not used for children or pregnancy.
            </p>
          )}
        </>
      ) : null}
      {step === 3 ? (
        <div className={styles.stack}>
          <fieldset className={styles.question}>
            <legend>Activity level</legend>
            <div className={styles.cards}>
              {activityChoices.map(([key, label, description]) => (
                <label key={key} className={styles.choice}>
                  <input
                    type="radio"
                    name="onboarding-activity"
                    checked={value.activityLevel === key}
                    onChange={() => update({ activityLevel: key })}
                  />
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                </label>
              ))}
            </div>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => update({ activityLevel: null })}
            >
              Leave activity unset
            </button>
          </fieldset>
          <label className={styles.field}>
            <span>Pregnant or breastfeeding?</span>
            <select
              value={value.lifeStage ?? ''}
              onChange={(e) =>
                update({
                  lifeStage: (e.target.value || null) as OnboardingNutritionInput['lifeStage'],
                  estimatedTargetsEnabled: false,
                  estimatedTargetConsent: false,
                })
              }
            >
              <option value="">No / prefer not to say</option>
              <option value="pregnant">Pregnant</option>
              <option value="breastfeeding">Breastfeeding</option>
            </select>
            <small>
              If either applies, general weight-loss and energy suggestions will be turned off.
            </small>
          </label>
        </div>
      ) : null}
      {step === 4 ? (
        <fieldset className={styles.question}>
          <legend>Nutrition goal</legend>
          <div className={styles.cards}>
            {(
              [
                ['none', 'Understand my nutrition', 'Track food without a weight goal.'],
                ['maintain', 'Maintain my weight', 'Focus on a consistent routine.'],
                ['loss', 'Lose weight', 'Choose a measured pace and a first milestone.'],
                ['gain', 'Gain weight', 'Build towards a gradual weight gain.'],
                ['custom', 'Use my own plan', 'Set detailed targets later in settings.'],
              ] as const
            ).map(([key, label, description]) => (
              <label className={styles.choice} key={key}>
                <input
                  type="radio"
                  name="onboarding-goal"
                  checked={value.nutritionGoalType === key}
                  onChange={() =>
                    update({
                      nutritionGoalType: key,
                      targetWeightKilograms: null,
                      targetDate: '',
                      weightGoalPace: null,
                    })
                  }
                />
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {step === 5 ? (
        <div className={styles.stack}>
          {numberField(
            'Target weight',
            'targetWeightKilograms',
            weightFactor,
            weightUnit,
            1000 * weightFactor,
          )}
          {value.nutritionGoalType === 'loss' && guidance.firstMilestone !== null ? (
            <aside className={styles.insight}>
              <strong>A first milestone: {weightText(guidance.firstMilestone)}</strong>
              <p>
                That is 5% below the weight you entered. NIDDK describes a 5–10% change over six
                months as a common starting goal for adults with excess weight.
              </p>
              <button
                type="button"
                className={styles.textButton}
                onClick={() =>
                  update({ targetWeightKilograms: Number(guidance.firstMilestone!.toFixed(1)) })
                }
              >
                Use this first milestone
              </button>
              <a
                href="https://www.niddk.nih.gov/health-information/weight-management/healthy-eating-physical-activity-for-life/health-tips-for-adults"
                target="_blank"
                rel="noreferrer"
              >
                Read the guidance
              </a>
            </aside>
          ) : null}
          {value.nutritionGoalType === 'loss' && !canSuggestPace ? (
            <p className={styles.hint}>
              Personalised loss suggestions need adult age, height and weight and are not offered
              during pregnancy, breastfeeding or when the current or target weight is below the
              adult BMI reference range. You can leave the target unset and use a clinician’s plan.
            </p>
          ) : null}
          <fieldset className={styles.question}>
            <legend>What pace feels manageable?</legend>
            <div className={styles.paces}>
              {Object.entries(onboardingPaces)
                .filter(([key]) => value.nutritionGoalType === 'loss' || key !== 'intense')
                .map(([key, option]) => {
                  const available = canSuggestPace;
                  const rate = value.currentWeightKilograms
                    ? Math.min(option.kgPerWeek, value.currentWeightKilograms * 0.01)
                    : null;
                  return (
                    <label className={styles.choice} key={key}>
                      <input
                        type="radio"
                        name="onboarding-pace"
                        disabled={!available}
                        checked={value.weightGoalPace === key}
                        onChange={() =>
                          update({
                            weightGoalPace: key as OnboardingNutritionInput['weightGoalPace'],
                          })
                        }
                      />
                      <span>
                        <strong>{option.label}</strong>
                        {rate && available ? <b>About {weightText(rate)} / week</b> : null}
                        <small>{option.description}</small>
                      </span>
                    </label>
                  );
                })}
            </div>
          </fieldset>
          {timeline && guidance.bmi !== null ? (
            <aside className={styles.insight}>
              <strong>Approximately {timeline.weeks} weeks</strong>
              <p>
                This is a rough timeframe from your current and target weights. Weight change is not
                linear and this is not a promised completion date.
              </p>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => update({ targetDate: timeline.date })}
              >
                Use {new Date(`${timeline.date}T12:00:00Z`).toLocaleDateString()} as a review date
              </button>
            </aside>
          ) : null}
          <details>
            <summary>Choose or change the target date</summary>
            <label className={styles.field}>
              <span>Target date (optional)</span>
              <input
                type="date"
                min={today}
                value={value.targetDate}
                onChange={(e) => update({ targetDate: e.target.value })}
              />
            </label>
            {timeline && value.targetDate && value.targetDate < timeline.date ? (
              <p className={styles.hint}>
                That date is sooner than the selected pace suggests. Consider a later date.
              </p>
            ) : null}
          </details>
        </div>
      ) : null}
      {step === 6 ? (
        <div className={styles.stack}>
          <MultiValueCombobox
            label="How do you like to eat?"
            helper="Optional eating styles or preferences."
            placeholder="Add an eating preference"
            options={[
              'Vegetarian',
              'Vegan',
              'Pescatarian',
              'Mediterranean',
              'Gluten-free',
              'Dairy-free',
              'Halal',
              'Kosher',
            ]}
            value={value.dietaryPreferences}
            onChange={(dietaryPreferences) => update({ dietaryPreferences })}
          />
          <MultiValueCombobox
            label="Any food allergies?"
            helper="Add known allergies. Always check ingredients when cooking."
            placeholder="Add a known allergy"
            options={[
              'Peanuts',
              'Tree nuts',
              'Milk',
              'Eggs',
              'Wheat',
              'Soy',
              'Fish',
              'Shellfish',
              'Sesame',
            ]}
            value={value.foodAllergies}
            onChange={(foodAllergies) => update({ foodAllergies })}
          />
        </div>
      ) : null}
      {step === 7 ? (
        <div className={styles.stack}>
          <MultiValueCombobox
            label="Anything else you avoid?"
            helper="Ingredients or foods you would prefer to leave out."
            placeholder="Add a food to avoid"
            options={['Alcohol', 'Pork', 'Beef', 'Mushrooms', 'Olives', 'Cilantro', 'Spicy food']}
            value={value.dietaryExclusions}
            onChange={(dietaryExclusions) => update({ dietaryExclusions })}
          />
          <label className={styles.choice}>
            <input
              type="checkbox"
              checked={value.weightTrackingEnabled}
              onChange={(e) => update({ weightTrackingEnabled: e.target.checked })}
            />
            <span>
              <strong>Keep a weight history</strong>
              <small>Save this starting measurement and record changes over time.</small>
            </span>
          </label>
        </div>
      ) : null}
      {step === 8 ? (
        <div className={styles.stack}>
          <dl className={styles.review}>
            <div>
              <dt>Age</dt>
              <dd>{guidance.age ?? 'Not entered'}</dd>
            </div>
            <div>
              <dt>Height</dt>
              <dd>
                {value.heightCentimeters
                  ? heightUnit === 'imperial'
                    ? `${heightFeet} ft ${heightInches} in`
                    : `${value.heightCentimeters.toLocaleString(undefined, { maximumFractionDigits: 1 })} cm`
                  : 'Not entered'}
              </dd>
            </div>
            <div>
              <dt>Weight</dt>
              <dd>
                {value.currentWeightKilograms
                  ? weightText(value.currentWeightKilograms)
                  : 'Not entered'}
              </dd>
            </div>
            <div>
              <dt>Goal</dt>
              <dd>
                {
                  {
                    none: 'Track nutrition',
                    maintain: 'Maintain weight',
                    loss: 'Lose weight',
                    gain: 'Gain weight',
                    custom: 'My own plan',
                  }[value.nutritionGoalType]
                }
              </dd>
            </div>
            {value.targetWeightKilograms ? (
              <div>
                <dt>Target</dt>
                <dd>{weightText(value.targetWeightKilograms)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Advanced readings</dt>
              <dd>
                {Object.values(value.advancedMetrics).filter((v) => v != null).length ||
                  'None entered'}
              </dd>
            </div>
          </dl>
          <label className={styles.choice}>
            <input
              type="checkbox"
              checked={value.estimatedTargetsEnabled}
              disabled={!canEstimate && !value.estimatedTargetsEnabled}
              onChange={(e) =>
                update({
                  estimatedTargetsEnabled: e.target.checked,
                  estimatedTargetConsent: e.target.checked,
                })
              }
            />
            <span>
              <strong>Show estimated maintenance energy</strong>
              <small>
                I agree to use my entered measurements and activity for an estimate. I can turn this
                off in settings.
              </small>
            </span>
          </label>
          {canEstimate && value.estimatedTargetsEnabled ? (
            <aside className={styles.insight}>
              <strong>
                About {guidance.maintenance!.toLocaleString()} kcal / day to maintain weight
              </strong>
              <p>
                Based on your entered age, height, weight, reference category and activity, using
                NASEM 2023. Activity categories are approximate. This is a starting estimate, not a
                prescribed intake or weight-loss calorie target.
              </p>
              <a
                href="https://www.nationalacademies.org/read/26818/chapter/7"
                target="_blank"
                rel="noreferrer"
              >
                Calculation source
              </a>
            </aside>
          ) : !canEstimate ? (
            <p className={styles.hint}>
              An estimate needs complete adult measurements, a reference category and an activity
              level. You can finish without one.
            </p>
          ) : null}
        </div>
      ) : null}
      {importNote ? (
        <p className={styles.notice} role="status">
          {importNote}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={() => navigate(-1)}>
          <ArrowLeft size={18} /> Back
        </button>
        <button type="button" className={styles.primary} onClick={() => navigate(1)}>
          {step === 8 ? 'Save nutrition choices' : 'Continue'}
          {step === 8 ? <Check size={18} /> : <ArrowRight size={18} />}
        </button>
      </div>
      {(step === 2 || step === 8) && (
        <BodyCompositionEstimatePanel
          estimate={estimate}
          measuredAt={value.measurementRecordedAt ?? undefined}
          imperial={unit === 'imperial'}
        />
      )}
      <dialog ref={advanced} className={styles.dialog} aria-labelledby="advanced-metrics-title">
        <div className={styles.dialogHeading}>
          <div>
            <h2 id="advanced-metrics-title">Advanced measurements</h2>
            <p>
              Copy readings from your scale or a measurement report. Leave anything you do not know
              blank.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close advanced measurements"
            onClick={() => advanced.current?.close()}
          >
            <X />
          </button>
        </div>
        <div className={styles.metricFields}>
          {bodyMetricFields.map((field) => {
            const factor = field.unit === 'kg' ? weightFactor : 1;
            const unitLabel = field.unit === 'kg' ? weightUnit : field.unit;
            return (
              <label key={field.key} className={styles.field}>
                <span>
                  {field.label} ({unitLabel})
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  max={field.max * factor}
                  value={
                    advancedDraft[field.key] == null
                      ? ''
                      : Number((advancedDraft[field.key]! * factor).toFixed(3))
                  }
                  onChange={(e) =>
                    setAdvancedDraft((current) => ({
                      ...current,
                      [field.key]: e.target.value === '' ? null : Number(e.target.value) / factor,
                    }))
                  }
                />
                <small>{field.help}</small>
              </label>
            );
          })}
        </div>
        <p className={styles.hint}>
          Home-scale body composition values are estimates. They are saved as supplied and do not
          replace your birthday, activity level or nutrition targets.
        </p>
        {advancedError ? (
          <p role="alert" className={styles.error}>
            {advancedError}
          </p>
        ) : null}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => advanced.current?.close()}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              const message = bodyMetricsError(advancedDraft, value.currentWeightKilograms);
              if (message) {
                setAdvancedError(message);
                return;
              }
              update({ advancedMetrics: advancedDraft });
              advanced.current?.close();
            }}
          >
            Save measurements
          </button>
        </div>
      </dialog>
      <dialog
        ref={connection}
        className={styles.dialog}
        aria-labelledby="vesync-title"
        onClose={() => setPassword('')}
        onCancel={(event) => {
          if (connecting) event.preventDefault();
        }}
      >
        <div className={styles.dialogHeading}>
          <div>
            <h2 id="vesync-title">Connect VeSync</h2>
            <p>Etekcity ESF24 · import your latest available weigh-in</p>
          </div>
          <button
            type="button"
            disabled={connecting}
            aria-label="Close VeSync connection"
            onClick={() => connection.current?.close()}
          >
            <X />
          </button>
        </div>
        {value.vesyncConnectionId ? (
          <div className={styles.stack}>
            <p>
              Your selected VeSync user is connected. The connection will be saved when you finish
              onboarding.
            </p>
            <button
              type="button"
              className={styles.secondary}
              disabled={connecting}
              onClick={() => void disconnect()}
            >
              Disconnect VeSync
            </button>
          </div>
        ) : (
          <form className={styles.stack} onSubmit={(event) => void connect(event)}>
            <p className={styles.hint}>
              Sign in with your VeSync email and password. Bòrd sends them to VeSync through this
              server and does not save your password. Only an encrypted session is retained. Sync
              your scale in the VeSync app first.
            </p>
            <label className={styles.field}>
              <span>VeSync email</span>
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>VeSync password</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Account country</span>
              <input
                value={country}
                maxLength={2}
                pattern="[A-Z]{2}"
                required
                onChange={(e) => setCountry(e.target.value.toUpperCase())}
              />
              <small>Two-letter country code, such as US, GB or CA.</small>
            </label>
            <button className={styles.primary} disabled={connecting} type="submit">
              {connecting ? 'Connecting…' : 'Sign in to VeSync'}
            </button>
          </form>
        )}
        {devices.length > 1 ? (
          <div className={styles.stack}>
            <h3>Choose your scale</h3>
            {devices.map((device) => (
              <button
                type="button"
                key={device.config}
                className={styles.secondary}
                disabled={connecting}
                onClick={async () => {
                  setConnecting(true);
                  setConnectionError('');
                  try {
                    await preview(connectionId!, device.config);
                  } catch (error) {
                    setConnectionError(
                      error instanceof Error ? error.message : 'Unable to read scale.',
                    );
                  } finally {
                    setConnecting(false);
                  }
                }}
              >
                {device.name} · {device.model}
              </button>
            ))}
          </div>
        ) : null}
        {readings.length && !value.vesyncConnectionId ? (
          <div className={styles.stack}>
            <h3>Which measurement is yours?</h3>
            <p>
              Confirm your scale user before importing. Other people on the same VeSync account may
              appear here.
            </p>
            {readings.map((reading) => (
              <button
                key={reading.userId}
                type="button"
                disabled={connecting}
                className={styles.linkCard}
                onClick={() => void chooseReading(reading)}
              >
                <span>
                  <strong>{weightText(reading.weightKilograms)}</strong>
                  <small>
                    {reading.userLabel ?? `VeSync user ${reading.userId}`} ·{' '}
                    {new Date(reading.measuredAt).toLocaleString()}
                    {reading.bodyFatPercent !== undefined
                      ? ` · ${reading.bodyFatPercent}% body fat`
                      : ''}
                  </small>
                </span>
                <span>Use this measurement</span>
              </button>
            ))}
          </div>
        ) : null}
        {connectionError ? (
          <p role="alert" className={styles.error}>
            {connectionError}
          </p>
        ) : null}
      </dialog>
    </div>
  );
}
