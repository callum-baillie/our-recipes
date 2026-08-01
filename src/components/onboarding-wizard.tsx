'use client';

import {
  ArrowLeft,
  BadgeDollarSign,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ChefHat,
  HeartPulse,
  Import,
  Leaf,
  Pencil,
  Plus,
  Scale,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  Trash2,
  UserRound,
  UtensilsCrossed,
  WandSparkles,
} from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { BrandIconPicker } from '@/components/brand-icon-picker';
import { MultiValueCombobox } from '@/components/multi-value-combobox';
import { InlineSkeleton } from '@/components/skeleton';
import { AppearanceSettings } from '@/components/theme-toggle';
import { useToast } from '@/components/toast-provider';
import { parseBrandIcon, type BrandIconId } from '@/lib/appearance';
import { DEFAULT_KITCHEN_NAME } from '@/lib/brand';
import { profileCredentialsSchema, type ProfileCredentialsInput } from '@/lib/domain/auth';
import { type AppRole } from '@/lib/domain/permissions';
import {
  defaultProfileGoalContext,
  hasProfileGoalContext,
  profileGoalFocusOptions,
  summarizeProfileGoals,
  type ProfileGoalContext,
  type ProfileGoalFocus,
} from '@/lib/domain/profile-goals';
import {
  defaultOnboardingNutrition,
  defaultProfileInput,
  onboardingHeightCentimeters,
  onboardingNutritionSchema,
  onboardingWeightKilograms,
  secureProfileOnboardingSchema,
  setupSchema,
  type FirstRecipeChoice,
  type OnboardingMeasurementUnit,
  type OnboardingNutritionInput,
  type ProfileInput,
} from '@/lib/domain/setup';
import {
  weightGoalPaces,
  weightTargetTimeline,
  type WeightGoalPace,
} from '@/lib/domain/weight-target-guidance';
import {
  SCOTTISH_STOVIES_IMAGE_ALT,
  SCOTTISH_STOVIES_IMAGE_PATH,
  SCOTTISH_STOVIES_RECIPE,
} from '@/lib/domain/example-recipes';

const profileColors = ['#A85032', '#5B713E', '#D1863A', '#466F75', '#76558C', '#9B5C70'];
const maximumSetupProfiles = 12;

function GoalFocusIcon({ focus }: { focus: ProfileGoalFocus }) {
  const props = { size: 18, strokeWidth: 2.1, 'aria-hidden': true as const };
  switch (focus) {
    case 'feel-healthier':
      return <HeartPulse {...props} />;
    case 'weight-goals':
      return <Scale {...props} />;
    case 'organized-meals':
      return <CalendarDays {...props} />;
    case 'easier-groceries':
      return <ShoppingBasket {...props} />;
    case 'understand-nutrition':
      return <Leaf {...props} />;
    case 'cook-more':
      return <ChefHat {...props} />;
    case 'discover-recipes':
      return <UtensilsCrossed {...props} />;
    case 'reduce-food-waste':
      return <Trash2 {...props} />;
    case 'save-money':
      return <BadgeDollarSign {...props} />;
    case 'support-dietary-needs':
      return <ShieldCheck {...props} />;
  }
}

const activityOptions = [
  { value: '', label: 'Not set', description: 'Skip this unless you want estimated targets.' },
  {
    value: 'sedentary',
    label: 'Sedentary',
    description: 'Mostly seated with little intentional weekly activity.',
  },
  {
    value: 'light',
    label: 'Lightly active',
    description: 'Light activity or exercise around 1–3 days each week.',
  },
  {
    value: 'moderate',
    label: 'Moderately active',
    description: 'Moderate activity or exercise around 3–5 days each week.',
  },
  {
    value: 'active',
    label: 'Active',
    description: 'Hard activity or exercise on most days of the week.',
  },
  {
    value: 'very_active',
    label: 'Very active',
    description: 'Very hard training or a highly physical daily routine.',
  },
] as const;

const nutritionGoalOptions = [
  {
    value: 'none',
    label: 'No goal',
    description: 'Keep Nutrition available without a weight goal.',
  },
  {
    value: 'maintain',
    label: 'Maintain',
    description: 'Use current weight as the planning direction.',
  },
  { value: 'gain', label: 'Gain weight', description: 'Set a gradual weight-gain direction.' },
  { value: 'loss', label: 'Lose weight', description: 'Set a gradual weight-loss direction.' },
  {
    value: 'custom',
    label: 'Custom',
    description: 'Configure detailed goals later in Nutrition settings.',
  },
] as const;

const formulaCategoryOptions = [
  { value: '', label: 'Not set', description: 'Leave blank when estimates are not needed.' },
  {
    value: 'female',
    label: 'Female reference',
    description: 'Uses the female category in the reference energy formula.',
  },
  {
    value: 'male',
    label: 'Male reference',
    description: 'Uses the male category in the reference energy formula.',
  },
] as const;

const dietaryPreferenceOptions = [
  'Vegetarian',
  'Vegan',
  'Pescatarian',
  'Mediterranean',
  'Low carbohydrate',
  'High protein',
  'Gluten-free',
  'Dairy-free',
  'Halal',
  'Kosher',
] as const;

const foodAllergyOptions = [
  'Peanuts',
  'Tree nuts',
  'Milk',
  'Eggs',
  'Wheat',
  'Soy',
  'Fish',
  'Shellfish',
  'Sesame',
] as const;

const dietaryExclusionOptions = [
  'Alcohol',
  'Pork',
  'Beef',
  'Mushrooms',
  'Olives',
  'Cilantro',
  'Spicy food',
  'Artificial sweeteners',
] as const;

type RichChoice = { value: string; label: string; description: string };

function RichChoiceField({
  legend,
  helper,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  helper: string;
  name: string;
  value: string;
  options: readonly RichChoice[];
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="onboarding-rich-choice-fieldset">
      <legend>{legend}</legend>
      <p>{helper}</p>
      <div className="onboarding-rich-choice-options">
        {options.map((option) => (
          <label
            className={
              value === option.value ? 'onboarding-rich-choice selected' : 'onboarding-rich-choice'
            }
            key={option.value || 'not-set'}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </span>
            {value === option.value ? <Check size={15} strokeWidth={3} aria-hidden="true" /> : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function OnboardingSwitch({
  checked,
  title,
  description,
  onChange,
}: {
  checked: boolean;
  title: string;
  description: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={checked ? 'onboarding-switch checked' : 'onboarding-switch'}
      onClick={() => onChange(!checked)}
    >
      <span className="onboarding-switch-track" aria-hidden="true">
        <span />
      </span>
      <span className="onboarding-switch-copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
    </button>
  );
}

const profileTypeOptions = [
  {
    value: 'adult',
    label: 'Adult',
    description: 'A personal profile for regular planning, recipe history, and Nutrition.',
    access: 'No profile-type restrictions.',
  },
  {
    value: 'dependent',
    label: 'Dependent',
    description: 'For a child or anyone whose meals and Nutrition are managed with support.',
    access: 'Intended for supervised use; it is not a security lock.',
  },
] as const;

type ProfileTypeValue = (typeof profileTypeOptions)[number]['value'];

const accessRoleOptions: Array<{
  value: AppRole;
  label: string;
  description: string;
}> = [
  {
    value: 'admin',
    label: 'Admin',
    description: 'Full access, including profiles, settings, backups, and API keys.',
  },
  {
    value: 'parent',
    label: 'Parent',
    description: 'Can manage shared recipes, plans, lists, collections, and pantry items.',
  },
  {
    value: 'child',
    label: 'Child',
    description: 'Can view shared content and manage only their own personal entries.',
  },
];

function RichProfileTypeSelect({
  id,
  labelId,
  describedBy,
  value,
  onChange,
}: {
  id: string;
  labelId: string;
  describedBy: string;
  value: ProfileTypeValue;
  onChange: (value: ProfileTypeValue) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedIndex = Math.max(
    0,
    profileTypeOptions.findIndex((option) => option.value === value),
  );
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const selectedOption = profileTypeOptions[selectedIndex]!;
  const listboxId = `${id}-listbox`;

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    function closeOnViewportChange(event: Event) {
      if (event.type === 'scroll' && menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    window.addEventListener('resize', closeOnViewportChange);
    window.addEventListener('scroll', closeOnViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      window.removeEventListener('resize', closeOnViewportChange);
      window.removeEventListener('scroll', closeOnViewportChange, true);
    };
  }, [open]);

  function openMenu() {
    const trigger = triggerRef.current;
    if (trigger) {
      const rect = trigger.getBoundingClientRect();
      const actions = trigger
        .closest('.onboarding-shell')
        ?.querySelector<HTMLElement>('.onboarding-actions');
      const gap = 6;
      const preferredHeight = 300;
      const lowerBoundary = Math.min(
        window.innerHeight,
        actions?.getBoundingClientRect().top ?? window.innerHeight,
      );
      const spaceBelow = lowerBoundary - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const openAbove = spaceBelow < preferredHeight && spaceAbove > spaceBelow;
      setMenuStyle(
        openAbove
          ? {
              right: window.innerWidth - rect.right,
              bottom: window.innerHeight - rect.top + gap,
              width: rect.width,
              maxHeight: Math.min(preferredHeight, spaceAbove),
            }
          : {
              top: rect.bottom + gap,
              left: rect.left,
              width: rect.width,
              maxHeight: Math.min(preferredHeight, spaceBelow),
            },
      );
    }
    setActiveIndex(selectedIndex);
    setOpen(true);
  }

  function selectOption(index: number) {
    const option = profileTypeOptions[index];
    if (!option) return;
    onChange(option.value);
    setActiveIndex(index);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className="onboarding-rich-select" ref={containerRef}>
      <button
        className="onboarding-rich-select-trigger"
        id={id}
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
            return;
          }
          if (event.key === 'Tab') {
            setOpen(false);
            return;
          }
          if (!open) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              openMenu();
            }
            return;
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((current) => (current + 1) % profileTypeOptions.length);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex(
              (current) => (current - 1 + profileTypeOptions.length) % profileTypeOptions.length,
            );
          } else if (event.key === 'Home') {
            event.preventDefault();
            setActiveIndex(0);
          } else if (event.key === 'End') {
            event.preventDefault();
            setActiveIndex(profileTypeOptions.length - 1);
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            selectOption(activeIndex);
          }
        }}
      >
        <span className="onboarding-rich-select-copy">
          <strong>{selectedOption.label}</strong>
          <small>{selectedOption.description}</small>
        </span>
        <ChevronDown size={19} aria-hidden="true" />
      </button>
      {open
        ? createPortal(
            <div
              className="onboarding-rich-select-menu"
              id={listboxId}
              ref={menuRef}
              role="listbox"
              style={menuStyle}
            >
              {profileTypeOptions.map((option, index) => (
                <button
                  className={index === activeIndex ? 'active' : undefined}
                  id={`${id}-option-${index}`}
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectOption(index)}
                >
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                  {option.value === value ? (
                    <Check size={17} strokeWidth={3} aria-hidden="true" />
                  ) : null}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

type ProfileRecord = {
  id: string;
  displayName: string;
  color: string;
  avatarUrl: string | null;
  units: 'metric' | 'imperial';
  temperatureUnit: 'C' | 'F';
  locale: string;
  timezone: string;
  mainGoals: string;
  goalContext: ProfileGoalContext;
  archivedAt: string | null;
};

type WizardStep = 'app' | 'appearance' | 'profile' | 'nutrition' | 'goals' | 'recipe' | 'review';

const firstRecipeOptions: Array<{
  value: FirstRecipeChoice;
  label: string;
  description: string;
  icon: typeof BookOpen;
}> = [
  {
    value: 'example',
    label: 'Use Example recipe',
    description: 'Start with our complete Traditional Scottish Stovies recipe.',
    icon: BookOpen,
  },
  {
    value: 'ai',
    label: 'AI generate',
    description: 'Describe what you want and review an AI-generated recipe before saving.',
    icon: WandSparkles,
  },
  {
    value: 'import',
    label: 'Import (From URL or Paste/JSON)',
    description: 'Bring in a recipe you already trust from another source.',
    icon: Import,
  },
  {
    value: 'manual',
    label: 'Manual',
    description: 'Build your first recipe from a blank, structured recipe form.',
    icon: Pencil,
  },
];

type ProfileDraft = {
  localId: number;
  role: AppRole;
  profile: ProfileInput;
  credentials: ProfileCredentialsInput;
  nutrition: OnboardingNutritionInput;
  heightUnit: OnboardingMeasurementUnit;
  heightPrimary: string;
  heightSecondary: string;
  weightUnit: OnboardingMeasurementUnit;
  weightPrimary: string;
  weightSecondary: string;
  targetWeight: string;
  weightGoalPace: WeightGoalPace;
  dietaryPreferences: string[];
  foodAllergies: string[];
  dietaryExclusions: string[];
};

type RegionalDefaults = Pick<ProfileInput, 'locale' | 'timezone'>;

function createProfileDraft(
  localId: number,
  regional: RegionalDefaults,
  colorIndex = 0,
): ProfileDraft {
  return {
    localId,
    role: 'parent',
    profile: {
      ...defaultProfileInput,
      ...regional,
      color: profileColors[colorIndex % profileColors.length]!,
      goalContext: {
        ...defaultProfileGoalContext,
        focusAreas: [...defaultProfileGoalContext.focusAreas],
      },
    },
    credentials: { email: '', passphrase: '', pin: '' },
    nutrition: { ...defaultOnboardingNutrition },
    heightUnit: defaultProfileInput.units,
    heightPrimary: '',
    heightSecondary: '',
    weightUnit: defaultProfileInput.units,
    weightPrimary: '',
    weightSecondary: '',
    targetWeight: '',
    weightGoalPace: 'steady',
    dietaryPreferences: [],
    foodAllergies: [],
    dietaryExclusions: [],
  };
}

function canonicalNutritionForDraft(draft: ProfileDraft): OnboardingNutritionInput {
  return {
    ...draft.nutrition,
    heightCentimeters: onboardingHeightCentimeters(
      draft.heightUnit,
      draft.heightPrimary,
      draft.heightSecondary,
    ),
    currentWeightKilograms: onboardingWeightKilograms(
      draft.weightUnit,
      draft.weightPrimary,
      draft.weightSecondary,
    ),
    targetWeightKilograms: onboardingWeightKilograms(draft.weightUnit, draft.targetWeight),
    dietaryPreferences: draft.dietaryPreferences,
    foodAllergies: draft.foodAllergies,
    dietaryExclusions: draft.dietaryExclusions,
  };
}

function avatarInitial(displayName: string): string {
  return Array.from(displayName.trim())[0]?.toLocaleUpperCase() ?? '?';
}

export function OnboardingWizard({
  mode,
  onCancel,
  onProfileCreated,
}: {
  mode: 'initial' | 'profile';
  onCancel?: () => void;
  onProfileCreated?: (profile: ProfileRecord) => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const steps: WizardStep[] =
    mode === 'initial'
      ? ['app', 'appearance', 'profile', 'nutrition', 'goals', 'recipe', 'review']
      : ['profile', 'nutrition', 'goals', 'review'];
  const [stepIndex, setStepIndex] = useState(0);
  const [kitchenName, setKitchenName] = useState(DEFAULT_KITCHEN_NAME);
  const [brandIcon, setBrandIcon] = useState<BrandIconId>(parseBrandIcon(null));
  const [regionalDefaults, setRegionalDefaults] = useState<RegionalDefaults>({
    locale: defaultProfileInput.locale,
    timezone: defaultProfileInput.timezone,
  });
  const [profileDrafts, setProfileDrafts] = useState<ProfileDraft[]>([
    createProfileDraft(1, {
      locale: defaultProfileInput.locale,
      timezone: defaultProfileInput.timezone,
    }),
  ]);
  const [activeProfileIndex, setActiveProfileIndex] = useState(0);
  const [profileReviewMode, setProfileReviewMode] = useState<'edit' | 'new' | null>(null);
  const nextProfileId = useRef(2);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [firstRecipeChoice, setFirstRecipeChoice] = useState<FirstRecipeChoice>('example');
  const [firstRecipeImportMode, setFirstRecipeImportMode] = useState<'url' | 'text' | 'json'>(
    'url',
  );
  const [securityCompletion, setSecurityCompletion] = useState<{
    groups: Array<{ profileName: string; codes: string[] }>;
    destination: string;
    requiresEmailVerification: boolean;
    createdProfile?: ProfileRecord;
  } | null>(null);
  const [recoveryCodesSaved, setRecoveryCodesSaved] = useState(false);
  const currentStep = steps[stepIndex]!;
  const activeDraft = profileDrafts[activeProfileIndex]!;
  const {
    role,
    profile,
    credentials,
    nutrition,
    heightUnit,
    heightPrimary,
    heightSecondary,
    weightUnit,
    weightPrimary,
    weightSecondary,
    targetWeight,
    weightGoalPace,
    dietaryPreferences,
    foodAllergies,
    dietaryExclusions,
  } = activeDraft;
  const activeProfileType =
    profileTypeOptions.find((option) => option.value === nutrition.profileType) ??
    profileTypeOptions[0];

  useEffect(() => {
    const browserRegionalDefaults = {
      locale: navigator.language || defaultProfileInput.locale,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || defaultProfileInput.timezone,
    };
    const frame = window.requestAnimationFrame(() => {
      setRegionalDefaults(browserRegionalDefaults);
      setProfileDrafts((current) =>
        current.map((draft) => ({
          ...draft,
          profile: { ...draft.profile, ...browserRegionalDefaults },
        })),
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function updateActiveDraft(update: (draft: ProfileDraft) => ProfileDraft) {
    setProfileDrafts((current) =>
      current.map((draft, index) => (index === activeProfileIndex ? update(draft) : draft)),
    );
  }

  function setProfile(value: ProfileInput) {
    updateActiveDraft((draft) => ({ ...draft, profile: value }));
  }

  function setCredentials(value: ProfileCredentialsInput) {
    updateActiveDraft((draft) => ({ ...draft, credentials: value }));
  }

  function setRole(value: AppRole) {
    updateActiveDraft((draft) => ({
      ...draft,
      role: value,
      nutrition:
        value === 'child' ? { ...draft.nutrition, profileType: 'dependent' } : draft.nutrition,
    }));
  }

  function setNutrition(value: OnboardingNutritionInput) {
    updateActiveDraft((draft) => ({ ...draft, nutrition: value }));
  }

  function setHeightSegment(segment: 'primary' | 'secondary', value: string) {
    updateActiveDraft((draft) => ({
      ...draft,
      [segment === 'primary' ? 'heightPrimary' : 'heightSecondary']: value,
    }));
  }

  function setWeightSegment(segment: 'primary' | 'secondary', value: string) {
    updateActiveDraft((draft) => ({
      ...draft,
      [segment === 'primary' ? 'weightPrimary' : 'weightSecondary']: value,
    }));
  }

  function setWeightGoalPace(value: WeightGoalPace) {
    updateActiveDraft((draft) => ({ ...draft, weightGoalPace: value }));
  }

  function setTargetWeight(value: string) {
    updateActiveDraft((draft) => ({ ...draft, targetWeight: value }));
  }

  function setHeightUnit(unit: OnboardingMeasurementUnit) {
    updateActiveDraft((draft) => {
      const centimeters = onboardingHeightCentimeters(
        draft.heightUnit,
        draft.heightPrimary,
        draft.heightSecondary,
      );
      if (centimeters === null) {
        return { ...draft, heightUnit: unit, heightPrimary: '', heightSecondary: '' };
      }
      if (unit === 'metric') {
        return {
          ...draft,
          heightUnit: unit,
          heightPrimary: String(Math.round(centimeters * 10) / 10),
          heightSecondary: '',
        };
      }
      const totalInches = centimeters / 2.54;
      const feet = Math.floor(totalInches / 12);
      const inches = Math.round((totalInches - feet * 12) * 10) / 10;
      return {
        ...draft,
        heightUnit: unit,
        heightPrimary: String(feet),
        heightSecondary: String(inches),
      };
    });
  }

  function setWeightUnit(unit: OnboardingMeasurementUnit) {
    updateActiveDraft((draft) => {
      const kilograms = onboardingWeightKilograms(
        draft.weightUnit,
        draft.weightPrimary,
        draft.weightSecondary,
      );
      const targetWeightKilograms = onboardingWeightKilograms(draft.weightUnit, draft.targetWeight);
      if (kilograms === null) {
        return {
          ...draft,
          weightUnit: unit,
          weightPrimary: '',
          weightSecondary: '',
          targetWeight:
            targetWeightKilograms === null
              ? ''
              : String(
                  Math.round(
                    (unit === 'metric'
                      ? targetWeightKilograms
                      : targetWeightKilograms * 2.2046226218) * 10,
                  ) / 10,
                ),
        };
      }
      if (unit === 'metric') {
        const wholeKilograms = Math.floor(kilograms);
        return {
          ...draft,
          weightUnit: unit,
          weightPrimary: String(wholeKilograms),
          weightSecondary: String(Math.round((kilograms - wholeKilograms) * 1_000)),
          targetWeight:
            targetWeightKilograms === null
              ? ''
              : String(Math.round(targetWeightKilograms * 10) / 10),
        };
      }
      const totalPounds = kilograms * 2.2046226218;
      const pounds = Math.floor(totalPounds);
      return {
        ...draft,
        weightUnit: unit,
        weightPrimary: String(pounds),
        weightSecondary: String(Math.round((totalPounds - pounds) * 160) / 10),
        targetWeight:
          targetWeightKilograms === null
            ? ''
            : String(Math.round(targetWeightKilograms * 2.2046226218 * 10) / 10),
      };
    });
  }

  function setDietaryPreferences(value: string[]) {
    updateActiveDraft((draft) => ({ ...draft, dietaryPreferences: value }));
  }

  function setFoodAllergies(value: string[]) {
    updateActiveDraft((draft) => ({ ...draft, foodAllergies: value }));
  }

  function setDietaryExclusions(value: string[]) {
    updateActiveDraft((draft) => ({ ...draft, dietaryExclusions: value }));
  }

  const canonicalNutrition = canonicalNutritionForDraft(activeDraft);
  const weightGoalType = nutrition.nutritionGoalType;
  const isWeightChangeGoal = weightGoalType === 'gain' || weightGoalType === 'loss';
  const weightTargetTimelineEstimate =
    weightGoalType === 'gain' || weightGoalType === 'loss'
      ? weightTargetTimeline({
          goalType: weightGoalType,
          currentWeightKilograms: canonicalNutrition.currentWeightKilograms,
          targetWeightKilograms: canonicalNutrition.targetWeightKilograms,
          pace: weightGoalPace,
          startsOn: new Date().toISOString().slice(0, 10),
        })
      : null;
  const targetWeightDirectionMismatch =
    canonicalNutrition.currentWeightKilograms !== null &&
    canonicalNutrition.targetWeightKilograms !== null &&
    ((nutrition.nutritionGoalType === 'loss' &&
      canonicalNutrition.targetWeightKilograms >= canonicalNutrition.currentWeightKilograms) ||
      (nutrition.nutritionGoalType === 'gain' &&
      canonicalNutrition.targetWeightKilograms <= canonicalNutrition.currentWeightKilograms));
  const targetDateIsEarlierThanSuggested =
    Boolean(nutrition.targetDate) &&
    Boolean(weightTargetTimelineEstimate?.targetDate) &&
    nutrition.targetDate < weightTargetTimelineEstimate!.targetDate;
  const goalContext = profile.goalContext ?? defaultProfileGoalContext;

  function setGoalContext(changes: Partial<ProfileGoalContext>) {
    setProfile({
      ...profile,
      goalContext: { ...goalContext, ...changes },
    });
  }

  function toggleGoalFocus(focus: ProfileGoalFocus) {
    const selected = goalContext.focusAreas.includes(focus);
    setGoalContext({
      focusAreas: selected
        ? goalContext.focusAreas.filter((item) => item !== focus)
        : [...goalContext.focusAreas, focus],
    });
  }

  function currentStepError(): string | null {
    if (currentStep === 'app' && !kitchenName.trim()) {
      return 'Give your kitchen a name to continue.';
    }
    if (currentStep === 'profile') {
      if (!profile.displayName.trim()) return 'Add a display name to continue.';
      const parsedCredentials = profileCredentialsSchema.safeParse(credentials);
      if (!parsedCredentials.success) {
        return parsedCredentials.error.issues[0]?.message ?? 'Check the profile sign-in details.';
      }
    }
    if (currentStep === 'nutrition') {
      const parsedNutrition = onboardingNutritionSchema.safeParse(canonicalNutrition);
      if (!parsedNutrition.success) {
        return (
          parsedNutrition.error.issues[0]?.message ?? 'Check the Nutrition details to continue.'
        );
      }
    }
    return null;
  }

  function next() {
    const message = currentStepError();
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    if (currentStep === 'goals') setProfileReviewMode(null);
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  }

  function editProfile(index: number) {
    setError(null);
    setActiveProfileIndex(index);
    setProfileReviewMode('edit');
    setStepIndex(steps.indexOf('profile'));
  }

  function addAnotherProfile() {
    if (profileDrafts.length >= maximumSetupProfiles) return;
    const nextIndex = profileDrafts.length;
    const nextDraft = createProfileDraft(
      nextProfileId.current,
      regionalDefaults,
      nextProfileId.current - 1,
    );
    nextProfileId.current += 1;
    setError(null);
    setProfileDrafts((current) => [...current, nextDraft]);
    setActiveProfileIndex(nextIndex);
    setProfileReviewMode('new');
    setStepIndex(steps.indexOf('profile'));
  }

  function removeAdditionalProfile(index: number) {
    if (index === 0) return;
    setProfileDrafts((current) => current.filter((_, draftIndex) => draftIndex !== index));
    setActiveProfileIndex(0);
  }

  function returnToReview() {
    if (profileReviewMode === 'new') {
      setProfileDrafts((current) =>
        current.filter((_, draftIndex) => draftIndex !== activeProfileIndex),
      );
      setActiveProfileIndex(0);
    }
    setError(null);
    setProfileReviewMode(null);
    setStepIndex(steps.indexOf('review'));
  }

  async function submit() {
    const canonicalDrafts = profileDrafts.map((draft) => ({
      role: draft.role,
      profile: draft.profile,
      credentials: draft.credentials,
      nutrition: canonicalNutritionForDraft(draft),
    }));
    const firstDraft = canonicalDrafts[0]!;
    const payload =
      mode === 'initial'
        ? {
            kitchenName,
            kitchenIcon: brandIcon,
            profile: firstDraft.profile,
            credentials: firstDraft.credentials,
            nutrition: firstDraft.nutrition,
            additionalProfiles: canonicalDrafts.slice(1),
            firstRecipeChoice,
          }
        : { role, profile, credentials, nutrition: canonicalNutrition };
    const parsed =
      mode === 'initial'
        ? setupSchema.safeParse(payload)
        : secureProfileOnboardingSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the onboarding answers.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        mode === 'initial' ? '/api/v1/setup' : '/api/v1/profiles/onboarding',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed.data),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        profile?: ProfileRecord;
        firstRecipeId?: string | null;
        recoveryCodes?: string[] | Array<{ profileId: string; codes: string[] }>;
        requiresEmailVerification?: boolean;
        error?: { message?: string };
      } | null;
      if (!response.ok) throw new Error(body?.error?.message ?? 'Onboarding could not be saved.');
      showToast(
        mode === 'initial' ? 'Your shared kitchen is ready.' : 'Profile onboarding complete.',
        'success',
      );
      if (mode === 'initial') {
        const destination =
          firstRecipeChoice === 'example' && body?.firstRecipeId
            ? `/recipes/${body.firstRecipeId}`
            : firstRecipeChoice === 'ai'
              ? '/capture?mode=text&onboarding=1'
              : firstRecipeChoice === 'import'
                ? firstRecipeImportMode === 'json'
                  ? '/import?mode=jsonld&onboarding=1'
                  : `/capture?mode=${firstRecipeImportMode}&onboarding=1`
                : '/recipes/new?onboarding=1';
        const recoveryEntries = Array.isArray(body?.recoveryCodes) ? body.recoveryCodes : [];
        setSecurityCompletion({
          groups: profileDrafts.map((draft, index) => {
            const entry = recoveryEntries[index];
            return {
              profileName: draft.profile.displayName,
              codes: typeof entry === 'string' ? [entry] : (entry?.codes ?? []),
            };
          }),
          destination,
          requiresEmailVerification: Boolean(body?.requiresEmailVerification),
        });
      } else if (body?.profile) {
        const recoveryEntries = Array.isArray(body.recoveryCodes) ? body.recoveryCodes : [];
        setSecurityCompletion({
          groups: [
            {
              profileName: body.profile.displayName,
              codes: recoveryEntries.filter((entry): entry is string => typeof entry === 'string'),
            },
          ],
          destination: '/settings/profiles',
          requiresEmailVerification: Boolean(body.requiresEmailVerification),
          createdProfile: body.profile,
        });
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Onboarding could not be saved.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function copyRecoveryCodes() {
    if (!securityCompletion) return;
    const text = securityCompletion.groups
      .map((group) => `${group.profileName}\n${group.codes.map((code) => `- ${code}`).join('\n')}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      showToast('Recovery codes copied. Store them somewhere private.', 'success');
    } catch {
      showToast('Copy was unavailable. Select and save the codes manually.', 'error');
    }
  }

  function continueAfterSecuritySetup() {
    if (!securityCompletion || !recoveryCodesSaved) return;
    if (mode === 'profile' && securityCompletion.createdProfile) {
      onProfileCreated?.(securityCompletion.createdProfile);
      return;
    }
    const params = new URLSearchParams({
      setup: '1',
      callbackUrl: securityCompletion.destination,
    });
    router.push(`/sign-in?${params.toString()}`);
    router.refresh();
  }

  if (securityCompletion) {
    return (
      <section className="onboarding-shell onboarding-security-complete" aria-live="polite">
        <div className="onboarding-heading">
          <ShieldCheck size={25} aria-hidden="true" />
          <div>
            <p className="eyebrow">SECURITY SETUP COMPLETE</p>
            <h2>Save your recovery codes.</h2>
            <p>
              Each code works once if email recovery is unavailable. Bòrd will not show these codes
              again.
            </p>
          </div>
        </div>
        {securityCompletion.requiresEmailVerification ? (
          <div className="setup-note" role="note">
            <span aria-hidden="true">✦</span>
            <p>
              <strong>Check each profile email.</strong> Email verification is required before that
              profile can sign in.
            </p>
          </div>
        ) : null}
        <div className="recovery-code-groups">
          {securityCompletion.groups.map((group, index) => (
            <section key={`${group.profileName}-${index}`} aria-labelledby={`recovery-${index}`}>
              <h3 id={`recovery-${index}`}>{group.profileName}</h3>
              <ul>
                {group.codes.map((code) => (
                  <li key={code}>
                    <code>{code}</code>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <button className="secondary-button" type="button" onClick={copyRecoveryCodes}>
          Copy all recovery codes
        </button>
        <label className="recovery-code-confirmation">
          <input
            type="checkbox"
            checked={recoveryCodesSaved}
            onChange={(event) => setRecoveryCodesSaved(event.target.checked)}
          />
          <span>I saved these one-time codes somewhere private.</span>
        </label>
        <button
          className="primary-button"
          type="button"
          disabled={!recoveryCodesSaved}
          onClick={continueAfterSecuritySetup}
        >
          {mode === 'initial' ? 'Continue to sign in' : 'Finish profile setup'}
        </button>
      </section>
    );
  }

  return (
    <section className={`onboarding-shell ${mode === 'initial' ? 'initial' : 'profile-only'}`}>
      <header className="onboarding-progress">
        <div>
          <p className="eyebrow">
            {mode === 'initial' ? 'WELCOME TO YOUR KITCHEN' : 'NEW PROFILE'}
          </p>
          <span>
            Step {stepIndex + 1} of {steps.length}
          </span>
        </div>
        <div className="onboarding-progress-track" aria-hidden="true">
          <span style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
        </div>
      </header>

      <div className="onboarding-step" aria-live="polite">
        {currentStep === 'app' ? (
          <>
            <div className="onboarding-heading">
              <Sparkles size={25} aria-hidden="true" />
              <div>
                <h2>Name your kitchen.</h2>
                <p>Bòrd is the default. Choose another name if it feels more like home.</p>
              </div>
            </div>
            <div className="field-grid">
              <label className="full-width-field">
                <span>Kitchen name</span>
                <input
                  value={kitchenName}
                  maxLength={80}
                  onChange={(event) => setKitchenName(event.target.value)}
                />
                <small>Your kitchen name appears in the header and install icon.</small>
              </label>
            </div>
            <BrandIconPicker selected={brandIcon} onSelect={setBrandIcon} />
          </>
        ) : null}

        {currentStep === 'appearance' ? (
          <>
            <div className="onboarding-heading">
              <Sparkles size={25} aria-hidden="true" />
              <div>
                <h2>Choose how the app feels.</h2>
                <p>Theme choices belong to this browser and can change at any time.</p>
              </div>
            </div>
            <AppearanceSettings />
          </>
        ) : null}

        {currentStep === 'profile' ? (
          <>
            <div className="onboarding-heading">
              <UserRound size={25} aria-hidden="true" />
              <div>
                <h2>
                  {mode === 'initial' && activeProfileIndex === 0
                    ? 'Create your first profile.'
                    : mode === 'initial'
                      ? 'Add another profile.'
                      : 'Who is joining the kitchen?'}
                </h2>
                <p>
                  Profiles personalize units, history, planning, and Nutrition. Each profile has its
                  own sign-in and a quick-switch PIN.
                </p>
              </div>
            </div>
            <section className="onboarding-profile-identity" aria-label="Profile identity">
              <div className="onboarding-avatar-editor">
                <div className="onboarding-avatar-preview" aria-label="Avatar preview">
                  <span
                    className="onboarding-avatar-initial"
                    style={{ backgroundColor: profile.color }}
                    aria-hidden="true"
                  >
                    {avatarInitial(profile.displayName)}
                  </span>
                  <span>
                    <small>Avatar preview</small>
                    <strong>{profile.displayName.trim() || 'Your name'}</strong>
                    <span>{activeProfileType.label}</span>
                  </span>
                </div>
                <fieldset className="onboarding-color-fieldset">
                  <legend>Avatar color</legend>
                  <div className="color-options" role="radiogroup" aria-label="Avatar color">
                    {profileColors.map((color) => (
                      <button
                        className={
                          profile.color === color ? 'color-swatch selected' : 'color-swatch'
                        }
                        type="button"
                        key={color}
                        style={{ '--swatch': color } as React.CSSProperties}
                        role="radio"
                        aria-checked={profile.color === color}
                        aria-label={`Use ${color} for the avatar`}
                        onClick={() => setProfile({ ...profile, color })}
                      >
                        {profile.color === color ? (
                          <Check size={14} strokeWidth={3} aria-hidden="true" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
              <div className="onboarding-profile-identity-fields">
                <label>
                  <span>Display name</span>
                  <input
                    autoComplete="name"
                    value={profile.displayName}
                    onChange={(event) =>
                      setProfile({ ...profile, displayName: event.target.value })
                    }
                  />
                  <small>This name appears in the profile switcher and household activity.</small>
                </label>
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    value={credentials.email}
                    onChange={(event) =>
                      setCredentials({ ...credentials, email: event.target.value })
                    }
                  />
                  <small>Used for this profile&apos;s full sign-in and account recovery.</small>
                </label>
                <label>
                  <span>Passphrase</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={15}
                    maxLength={128}
                    value={credentials.passphrase}
                    onChange={(event) =>
                      setCredentials({ ...credentials, passphrase: event.target.value })
                    }
                  />
                  <small>Use at least 15 characters. A passphrase protects remote sign-in.</small>
                </label>
                <label>
                  <span>Profile PIN</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    value={credentials.pin}
                    onChange={(event) =>
                      setCredentials({
                        ...credentials,
                        pin: event.target.value.replace(/\D/gu, '').slice(0, 6),
                      })
                    }
                  />
                  <small>Six digits used only when switching profiles on a signed-in device.</small>
                </label>
                <label>
                  <span>Access role</span>
                  <select
                    value={mode === 'initial' && activeProfileIndex === 0 ? 'admin' : role}
                    disabled={mode === 'initial' && activeProfileIndex === 0}
                    onChange={(event) => setRole(event.target.value as AppRole)}
                  >
                    {accessRoleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <small>
                    {mode === 'initial' && activeProfileIndex === 0
                      ? 'The first profile is always an admin.'
                      : accessRoleOptions.find((option) => option.value === role)?.description}
                  </small>
                </label>
                <div className="onboarding-profile-type-field">
                  <span
                    className="onboarding-field-label"
                    id={`profile-type-label-${activeDraft.localId}`}
                  >
                    Profile type
                  </span>
                  <RichProfileTypeSelect
                    id={`profile-type-${activeDraft.localId}`}
                    labelId={`profile-type-label-${activeDraft.localId}`}
                    describedBy={`profile-type-description-${activeDraft.localId}`}
                    value={nutrition.profileType}
                    onChange={(profileType) => setNutrition({ ...nutrition, profileType })}
                  />
                </div>
                <div
                  className="onboarding-profile-type-description"
                  id={`profile-type-description-${activeDraft.localId}`}
                  aria-live="polite"
                >
                  <small>
                    <ShieldCheck size={14} aria-hidden="true" /> {activeProfileType.access}
                  </small>
                </div>
                <p className="onboarding-profile-type-note">
                  Access role controls permissions. Profile type only changes planning and Nutrition
                  context. A PIN can switch to an equal or lower role; moving up requires a full
                  sign-in.
                </p>
              </div>
            </section>
            <div className="field-grid two-columns">
              <label>
                <span>Units</span>
                <select
                  value={profile.units}
                  onChange={(event) => {
                    const units = event.target.value as ProfileInput['units'];
                    updateActiveDraft((draft) => ({
                      ...draft,
                      profile: { ...draft.profile, units },
                      heightUnit: units,
                      heightPrimary: '',
                      heightSecondary: '',
                      weightUnit: units,
                      weightPrimary: '',
                      weightSecondary: '',
                    }));
                  }}
                >
                  <option value="imperial">US customary</option>
                  <option value="metric">Metric</option>
                </select>
              </label>
              <label>
                <span>Temperature</span>
                <select
                  value={profile.temperatureUnit}
                  onChange={(event) =>
                    setProfile({
                      ...profile,
                      temperatureUnit: event.target.value as ProfileInput['temperatureUnit'],
                    })
                  }
                >
                  <option value="F">Fahrenheit</option>
                  <option value="C">Celsius</option>
                </select>
              </label>
            </div>
          </>
        ) : null}

        {currentStep === 'nutrition' ? (
          <>
            <div className="onboarding-heading">
              <ShieldCheck size={25} aria-hidden="true" />
              <div>
                <h2>Setup your Nutrition profile</h2>
                <p>Everything here is optional unless you ask the app to estimate targets.</p>
              </div>
            </div>
            <section className="onboarding-nutrition-section" aria-labelledby="body-basics-title">
              <div className="onboarding-section-heading">
                <h3 id="body-basics-title">Body basics</h3>
                <p>Used only for your profile and only when a Nutrition feature needs them.</p>
              </div>
              <div className="onboarding-measurement-grid">
                <label className="onboarding-date-field">
                  <span>Birthday</span>
                  <input
                    type="date"
                    value={nutrition.dateOfBirth}
                    onChange={(event) =>
                      setNutrition({ ...nutrition, dateOfBirth: event.target.value })
                    }
                  />
                  <small>
                    Used to calculate age for optional estimates. It is not shown publicly.
                  </small>
                </label>
                <fieldset className="onboarding-measurement-fieldset">
                  <legend>Height</legend>
                  <div className="measurement-unit-toggle" aria-label="Height unit">
                    <button
                      type="button"
                      aria-pressed={heightUnit === 'imperial'}
                      onClick={() => setHeightUnit('imperial')}
                    >
                      ft
                    </button>
                    <button
                      type="button"
                      aria-pressed={heightUnit === 'metric'}
                      onClick={() => setHeightUnit('metric')}
                    >
                      cm
                    </button>
                  </div>
                  <div className="measurement-segments">
                    <label>
                      <input
                        aria-label={
                          heightUnit === 'imperial' ? 'Height feet' : 'Height centimeters'
                        }
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max={heightUnit === 'metric' ? 300 : 9}
                        step={heightUnit === 'metric' ? '0.1' : '1'}
                        value={heightPrimary}
                        onChange={(event) => setHeightSegment('primary', event.target.value)}
                      />
                      <span>{heightUnit === 'imperial' ? 'ft' : 'cm'}</span>
                    </label>
                    {heightUnit === 'imperial' ? (
                      <label>
                        <input
                          aria-label="Height inches"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max="11.9"
                          step="0.1"
                          value={heightSecondary}
                          onChange={(event) => setHeightSegment('secondary', event.target.value)}
                        />
                        <span>in</span>
                      </label>
                    ) : null}
                  </div>
                  <small>Switch units at any time; the entered value is converted for you.</small>
                </fieldset>
                <fieldset className="onboarding-measurement-fieldset">
                  <legend>Current weight</legend>
                  <div className="measurement-unit-toggle" aria-label="Weight unit">
                    <button
                      type="button"
                      aria-pressed={weightUnit === 'imperial'}
                      onClick={() => setWeightUnit('imperial')}
                    >
                      lb
                    </button>
                    <button
                      type="button"
                      aria-pressed={weightUnit === 'metric'}
                      onClick={() => setWeightUnit('metric')}
                    >
                      kg
                    </button>
                  </div>
                  <div className="measurement-segments">
                    <label>
                      <input
                        aria-label={
                          weightUnit === 'imperial' ? 'Weight pounds' : 'Weight kilograms'
                        }
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max={weightUnit === 'imperial' ? 2_200 : 1_000}
                        step="1"
                        value={weightPrimary}
                        onChange={(event) => setWeightSegment('primary', event.target.value)}
                      />
                      <span>{weightUnit === 'imperial' ? 'lb' : 'kg'}</span>
                    </label>
                    <label>
                      <input
                        aria-label={weightUnit === 'imperial' ? 'Weight ounces' : 'Weight grams'}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max={weightUnit === 'imperial' ? 15.9 : 999}
                        step={weightUnit === 'imperial' ? '0.1' : '1'}
                        value={weightSecondary}
                        onChange={(event) => setWeightSegment('secondary', event.target.value)}
                      />
                      <span>{weightUnit === 'imperial' ? 'oz' : 'g'}</span>
                    </label>
                  </div>
                  <small>
                    The smaller segment is optional and helps record a more precise value.
                  </small>
                </fieldset>
              </div>
            </section>
            <section
              className="onboarding-nutrition-section"
              aria-labelledby="planning-context-title"
            >
              <div className="onboarding-section-heading">
                <h3 id="planning-context-title">Planning context</h3>
                <p>Select the description that best fits. You can revise these later.</p>
              </div>
              <RichChoiceField
                legend="Activity level"
                helper="Only used when you explicitly enable estimated Nutrition targets."
                name={`activity-level-${activeDraft.localId}`}
                value={nutrition.activityLevel ?? ''}
                options={activityOptions}
                onChange={(value) =>
                  setNutrition({
                    ...nutrition,
                    activityLevel: (value || null) as OnboardingNutritionInput['activityLevel'],
                  })
                }
              />
              <RichChoiceField
                legend="Nutrition goal"
                helper="This saves a body-weight direction. Daily calorie and nutrient goals are a separate, optional step."
                name={`nutrition-goal-${activeDraft.localId}`}
                value={nutrition.nutritionGoalType}
                options={nutritionGoalOptions}
                onChange={(value) =>
                  setNutrition({
                    ...nutrition,
                    nutritionGoalType: value as OnboardingNutritionInput['nutritionGoalType'],
                  })
                }
              />
              {isWeightChangeGoal ? (
                <section className="onboarding-weight-target" aria-labelledby="weight-target-title">
                  <div>
                    <h4 id="weight-target-title">
                      Choose a workable {nutrition.nutritionGoalType === 'loss' ? 'loss' : 'gain'}{' '}
                      target
                    </h4>
                    <p>
                      Start with a target weight and a pace you can revisit. This is a planning
                      estimate, not medical advice or a calorie prescription.
                    </p>
                  </div>
                  <div className="onboarding-weight-target-grid">
                    <label>
                      <span>Target weight ({weightUnit === 'imperial' ? 'lb' : 'kg'})</span>
                      <input
                        aria-label="Target weight"
                        type="number"
                        inputMode="decimal"
                        min="0.1"
                        max={weightUnit === 'imperial' ? 2_200 : 1_000}
                        step="0.1"
                        value={targetWeight}
                        onChange={(event) => setTargetWeight(event.target.value)}
                      />
                    </label>
                    <fieldset>
                      <legend>Planning pace</legend>
                      <div className="onboarding-weight-pace-options">
                        {(
                          Object.entries(weightGoalPaces) as Array<
                            [WeightGoalPace, (typeof weightGoalPaces)[WeightGoalPace]]
                          >
                        ).map(([pace, option]) => (
                          <label key={pace}>
                            <input
                              type="radio"
                              name={`weight-goal-pace-${activeDraft.localId}`}
                              checked={weightGoalPace === pace}
                              onChange={() => setWeightGoalPace(pace)}
                            />
                            <span>
                              <strong>{option.label}</strong>
                              <small>{option.description}</small>
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <label>
                      <span>Target date</span>
                      <input
                        type="date"
                        value={nutrition.targetDate}
                        onChange={(event) =>
                          setNutrition({ ...nutrition, targetDate: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  {targetWeightDirectionMismatch ? (
                    <p className="onboarding-weight-target-warning" role="status">
                      {nutrition.nutritionGoalType === 'loss'
                        ? 'For a loss goal, choose a target below the current weight.'
                        : 'For a gain goal, choose a target above the current weight.'}
                    </p>
                  ) : targetDateIsEarlierThanSuggested ? (
                    <p className="onboarding-weight-target-warning" role="status">
                      That date is faster than the selected pace. Choose the suggested date or a
                      later one for a more gradual plan.
                    </p>
                  ) : weightTargetTimelineEstimate ? (
                    <div className="onboarding-weight-target-estimate" role="status">
                      <span>
                        At this pace, the{' '}
                        {Math.round(weightTargetTimelineEstimate.changeKilograms * 10) / 10} kg
                        change is roughly {weightTargetTimelineEstimate.weeks} weeks.
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setNutrition({
                            ...nutrition,
                            targetDate: weightTargetTimelineEstimate.targetDate,
                          })
                        }
                      >
                        Use suggested date
                      </button>
                    </div>
                  ) : (
                    <p className="onboarding-weight-target-hint">
                      Add a current and target weight to see a suggested timeframe.
                    </p>
                  )}
                </section>
              ) : null}
              <RichChoiceField
                legend="Formula category"
                helper="Reference formulas use one of two categories. Choose the category you want used for estimates; it does not define your identity."
                name={`formula-category-${activeDraft.localId}`}
                value={nutrition.referenceSexCategory ?? ''}
                options={formulaCategoryOptions}
                onChange={(value) =>
                  setNutrition({
                    ...nutrition,
                    referenceSexCategory: (value ||
                      null) as OnboardingNutritionInput['referenceSexCategory'],
                  })
                }
              />
            </section>
            <section className="onboarding-nutrition-section" aria-labelledby="food-context-title">
              <div className="onboarding-section-heading">
                <h3 id="food-context-title">Food preferences</h3>
                <p>Add common values from the suggestions or type anything specific to you.</p>
              </div>
              <div className="onboarding-food-context-grid">
                <MultiValueCombobox
                  label="Dietary preferences"
                  helper="Add eating styles you prefer. Press Enter or comma after each item."
                  placeholder="Try Vegetarian"
                  options={dietaryPreferenceOptions}
                  value={dietaryPreferences}
                  onChange={setDietaryPreferences}
                />
                <MultiValueCombobox
                  label="Food allergies"
                  helper="Add known allergies for planning context; always verify ingredients yourself."
                  placeholder="Try Peanuts"
                  options={foodAllergyOptions}
                  value={foodAllergies}
                  onChange={setFoodAllergies}
                />
                <MultiValueCombobox
                  label="Foods to exclude"
                  helper="Add ingredients or foods you want recipes and plans to avoid."
                  placeholder="Try Mushrooms"
                  options={dietaryExclusionOptions}
                  value={dietaryExclusions}
                  onChange={setDietaryExclusions}
                />
              </div>
            </section>
            <div className="onboarding-toggles">
              <OnboardingSwitch
                checked={nutrition.weightTrackingEnabled}
                title="Enable weight tracking"
                description="Allow this profile to record weight measurements over time."
                onChange={(checked) =>
                  setNutrition({ ...nutrition, weightTrackingEnabled: checked })
                }
              />
              <OnboardingSwitch
                checked={nutrition.estimatedTargetsEnabled}
                title="Estimate Nutrition targets"
                description="Uses birthday, body measurements, formula category, and activity level."
                onChange={(checked) =>
                  setNutrition({
                    ...nutrition,
                    estimatedTargetsEnabled: checked,
                    estimatedTargetConsent: checked ? nutrition.estimatedTargetConsent : false,
                  })
                }
              />
              {nutrition.estimatedTargetsEnabled ? (
                <OnboardingSwitch
                  checked={nutrition.estimatedTargetConsent}
                  title="I consent to this calculation"
                  description="Estimates are informational and can be changed or disabled later."
                  onChange={(checked) =>
                    setNutrition({ ...nutrition, estimatedTargetConsent: checked })
                  }
                />
              ) : null}
            </div>
          </>
        ) : null}

        {currentStep === 'goals' ? (
          <>
            <div className="onboarding-heading">
              <Sparkles size={25} aria-hidden="true" />
              <div>
                <h2>What should the app help with?</h2>
                <p>
                  Take a moment to think about what would genuinely make food and mealtimes feel
                  better. There are no right answers, and everything can be changed later.
                </p>
              </div>
            </div>
            <div className="onboarding-goal-reflection">
              <section
                className="onboarding-goal-section onboarding-goal-focus-section"
                aria-labelledby="goal-focus-title"
              >
                <div className="onboarding-goal-question">
                  <span aria-hidden="true">1</span>
                  <div>
                    <h3 id="goal-focus-title">What would make the biggest difference?</h3>
                    <p>Choose the outcomes that feel most useful right now.</p>
                  </div>
                </div>
                <div className="onboarding-goal-options">
                  {profileGoalFocusOptions.map((option) => {
                    const selected = goalContext.focusAreas.includes(option.value);
                    const atLimit = goalContext.focusAreas.length >= 8;
                    return (
                      <button
                        className={
                          selected ? 'onboarding-goal-option selected' : 'onboarding-goal-option'
                        }
                        type="button"
                        role="checkbox"
                        aria-checked={selected}
                        disabled={!selected && atLimit}
                        key={option.value}
                        onClick={() => toggleGoalFocus(option.value)}
                      >
                        <span className="onboarding-goal-option-icon">
                          <GoalFocusIcon focus={option.value} />
                        </span>
                        <span>
                          <strong>{option.label}</strong>
                          <small>{option.description}</small>
                        </span>
                        <span className="onboarding-goal-option-check" aria-hidden="true">
                          {selected ? <Check size={14} strokeWidth={3} /> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="onboarding-goal-selection-note" aria-live="polite">
                  {goalContext.focusAreas.length
                    ? `${goalContext.focusAreas.length} selected`
                    : 'Choose any that resonate with you'}
                </p>
              </section>

              <div className="onboarding-goal-writing-grid">
                <label className="onboarding-goal-section">
                  <span className="onboarding-goal-question">
                    <span aria-hidden="true">2</span>
                    <span>
                      <strong>Why does this matter to you right now?</strong>
                      <small>
                        A little context helps the app understand the reason behind the goal.
                      </small>
                    </span>
                  </span>
                  <textarea
                    rows={4}
                    maxLength={800}
                    value={goalContext.motivation}
                    placeholder="Maybe you want more energy, less stress around food, or to feel more confident cooking for yourself."
                    onChange={(event) => setGoalContext({ motivation: event.target.value })}
                  />
                  <small className="onboarding-goal-count">
                    {goalContext.motivation.length} / 800
                  </small>
                </label>

                <label className="onboarding-goal-section">
                  <span className="onboarding-goal-question">
                    <span aria-hidden="true">3</span>
                    <span>
                      <strong>What tends to get in the way?</strong>
                      <small>Name the friction, not a personal failing.</small>
                    </span>
                  </span>
                  <textarea
                    rows={4}
                    maxLength={800}
                    value={goalContext.challenges}
                    placeholder="Busy evenings, decision fatigue, a tight budget, unused groceries, or not knowing where to begin."
                    onChange={(event) => setGoalContext({ challenges: event.target.value })}
                  />
                  <small className="onboarding-goal-count">
                    {goalContext.challenges.length} / 800
                  </small>
                </label>
              </div>

              <label className="onboarding-goal-section onboarding-goal-success">
                <span className="onboarding-goal-question">
                  <span aria-hidden="true">4</span>
                  <span>
                    <strong>Imagine this is working well. What feels different?</strong>
                    <small>Describe the everyday change you would notice—not just a number.</small>
                  </span>
                </span>
                <textarea
                  rows={4}
                  maxLength={800}
                  value={goalContext.successVision}
                  placeholder="For example: dinner feels calmer, grocery trips are quicker, I waste less, and I have steady energy through the afternoon."
                  onChange={(event) => setGoalContext({ successVision: event.target.value })}
                />
                <small className="onboarding-goal-count">
                  {goalContext.successVision.length} / 800
                </small>
              </label>

              <label className="onboarding-goal-section onboarding-goals">
                <span className="onboarding-goal-question">
                  <span aria-hidden="true">5</span>
                  <span>
                    <strong>Anything else you want the app to remember?</strong>
                    <small>
                      Add a personal goal, food ritual, or detail that did not fit above.
                    </small>
                  </span>
                </span>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={profile.mainGoals ?? ''}
                  placeholder="I would love to learn to bake bread, keep Sunday dinners special, or try one new recipe each week."
                  onChange={(event) => setProfile({ ...profile, mainGoals: event.target.value })}
                />
                <small className="onboarding-goal-count">
                  {(profile.mainGoals ?? '').length} / 2000
                </small>
              </label>

              <p className="onboarding-goal-privacy-note">
                <ShieldCheck size={16} aria-hidden="true" />
                These answers personalize this household profile; profiles are not separate private
                accounts. Sharing them with AI is a separate, optional setting and is off by
                default.
              </p>
            </div>
          </>
        ) : null}

        {currentStep === 'recipe' ? (
          <>
            <div className="onboarding-heading">
              <BookOpen size={25} aria-hidden="true" />
              <div>
                <h2>Add your first recipe.</h2>
                <p>
                  Begin with a polished example or continue into the recipe flow that suits you.
                </p>
              </div>
            </div>
            <div
              className="onboarding-recipe-options"
              role="radiogroup"
              aria-label="Choose how to create your first recipe"
            >
              {firstRecipeOptions.map((option) => {
                const Icon = option.icon;
                const selected = firstRecipeChoice === option.value;
                return (
                  <button
                    className={`onboarding-recipe-option${selected ? ' selected' : ''}`}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    key={option.value}
                    onClick={() => setFirstRecipeChoice(option.value)}
                  >
                    <span className="onboarding-recipe-option-icon" aria-hidden="true">
                      <Icon size={20} />
                    </span>
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </span>
                    <span className="onboarding-recipe-radio" aria-hidden="true">
                      {selected ? <Check size={14} /> : null}
                    </span>
                  </button>
                );
              })}
            </div>

            {firstRecipeChoice === 'example' ? (
              <article className="onboarding-example-recipe">
                <div className="onboarding-example-image">
                  <Image
                    src={SCOTTISH_STOVIES_IMAGE_PATH}
                    alt={SCOTTISH_STOVIES_IMAGE_ALT}
                    fill
                    sizes="(max-width: 700px) 100vw, 360px"
                    priority
                  />
                </div>
                <div className="onboarding-example-copy">
                  <p className="eyebrow">BÒRD STARTER RECIPE</p>
                  <h3>{SCOTTISH_STOVIES_RECIPE.title}</h3>
                  <p>{SCOTTISH_STOVIES_RECIPE.summary}</p>
                  <dl>
                    <div>
                      <dt>Serves</dt>
                      <dd>6</dd>
                    </div>
                    <div>
                      <dt>Time</dt>
                      <dd>1 hr 25 min</dd>
                    </div>
                    <div>
                      <dt>Estimate</dt>
                      <dd>320 kcal</dd>
                    </div>
                  </dl>
                  <p className="onboarding-example-note">
                    Includes measured ingredients, equipment, eight detailed steps, source notes,
                    and estimated nutrition. You can edit everything later.
                  </p>
                </div>
              </article>
            ) : (
              <>
                {firstRecipeChoice === 'import' ? (
                  <fieldset className="onboarding-import-methods">
                    <legend>What are you importing?</legend>
                    <div role="radiogroup" aria-label="Recipe import method">
                      {[
                        { value: 'url', label: 'From URL' },
                        { value: 'text', label: 'Paste recipe' },
                        { value: 'json', label: 'Paste JSON-LD' },
                      ].map((option) => (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={firstRecipeImportMode === option.value}
                          className={firstRecipeImportMode === option.value ? 'selected' : ''}
                          key={option.value}
                          onClick={() =>
                            setFirstRecipeImportMode(option.value as 'url' | 'text' | 'json')
                          }
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : null}
                <div className="setup-note onboarding-recipe-follow-up" role="note">
                  <span aria-hidden="true">✦</span>
                  <p>
                    <strong>Your kitchen will be created first.</strong> Then Bòrd will open the
                    selected recipe flow with your new profile active.
                  </p>
                </div>
              </>
            )}
          </>
        ) : null}

        {currentStep === 'review' ? (
          <>
            <div className="onboarding-heading">
              <Check size={25} aria-hidden="true" />
              <div>
                <h2>Ready to begin.</h2>
                <p>Review the essentials. Every answer remains editable in Settings.</p>
              </div>
            </div>
            <section
              className="onboarding-profile-roster"
              aria-labelledby="onboarding-profiles-title"
            >
              <div className="onboarding-profile-roster-heading">
                <h3 id="onboarding-profiles-title">Profiles</h3>
                <span>{profileDrafts.length} ready</span>
              </div>
              <div className="onboarding-profile-review-list">
                {profileDrafts.map((draft, index) => {
                  const profileType = profileTypeOptions.find(
                    (option) => option.value === draft.nutrition.profileType,
                  );
                  return (
                    <article className="onboarding-profile-review-card" key={draft.localId}>
                      <span
                        className="onboarding-avatar-initial compact"
                        style={{ backgroundColor: draft.profile.color }}
                        aria-hidden="true"
                      >
                        {avatarInitial(draft.profile.displayName)}
                      </span>
                      <span className="onboarding-profile-review-copy">
                        <strong>{draft.profile.displayName}</strong>
                        <span>
                          {profileType?.label ?? 'Adult'} ·{' '}
                          {draft.profile.units === 'imperial' ? 'US customary' : 'Metric'} ·{' '}
                          {draft.profile.temperatureUnit === 'F' ? 'Fahrenheit' : 'Celsius'}
                        </span>
                        <small>
                          {summarizeProfileGoals(
                            draft.profile.goalContext,
                            draft.profile.mainGoals,
                          )}
                        </small>
                      </span>
                      <span className="onboarding-profile-review-actions">
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => editProfile(index)}
                          aria-label={`Edit ${draft.profile.displayName}`}
                        >
                          <Pencil size={14} aria-hidden="true" /> Edit
                        </button>
                        {index > 0 ? (
                          <button
                            className="text-button danger-text-button"
                            type="button"
                            onClick={() => removeAdditionalProfile(index)}
                            aria-label={`Remove ${draft.profile.displayName}`}
                          >
                            <Trash2 size={14} aria-hidden="true" /> Remove
                          </button>
                        ) : null}
                      </span>
                    </article>
                  );
                })}
              </div>
              {mode === 'initial' && profileDrafts.length < maximumSetupProfiles ? (
                <button className="secondary-button" type="button" onClick={addAnotherProfile}>
                  <Plus size={17} aria-hidden="true" /> Add another profile
                </button>
              ) : null}
            </section>
            <dl className="onboarding-review">
              {mode === 'initial' ? (
                <div>
                  <dt>Kitchen</dt>
                  <dd>{kitchenName}</dd>
                </div>
              ) : null}
              <div>
                <dt>Profiles</dt>
                <dd>{profileDrafts.length}</dd>
              </div>
              <div>
                <dt>Nutrition goals</dt>
                <dd>
                  {
                    profileDrafts.filter((draft) => draft.nutrition.nutritionGoalType !== 'none')
                      .length
                  }{' '}
                  configured
                </dd>
              </div>
              <div>
                <dt>Dietary notes</dt>
                <dd>
                  {
                    profileDrafts.filter((draft) => {
                      const details = canonicalNutritionForDraft(draft);
                      return (
                        details.dietaryPreferences.length +
                          details.foodAllergies.length +
                          details.dietaryExclusions.length >
                        0
                      );
                    }).length
                  }{' '}
                  configured
                </dd>
              </div>
              <div>
                <dt>Personal goals</dt>
                <dd>
                  {
                    profileDrafts.filter((draft) =>
                      hasProfileGoalContext(draft.profile.goalContext, draft.profile.mainGoals),
                    ).length
                  }{' '}
                  configured
                </dd>
              </div>
              {mode === 'initial' ? (
                <div>
                  <dt>First recipe</dt>
                  <dd>
                    {firstRecipeOptions.find((option) => option.value === firstRecipeChoice)?.label}
                  </dd>
                </div>
              ) : null}
            </dl>
            <div className="setup-note" role="note">
              <span aria-hidden="true">✦</span>
              <p>
                <strong>Trusted household reminder.</strong> Profiles personalize the app but do not
                restrict access. Keep this installation on a trusted network.
              </p>
            </div>
          </>
        ) : null}
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <footer className="onboarding-actions">
        {stepIndex > 0 ? (
          <button
            className="text-button"
            type="button"
            disabled={submitting}
            onClick={() => {
              if (currentStep === 'profile' && profileReviewMode) {
                returnToReview();
              } else {
                setError(null);
                setStepIndex((current) => current - 1);
              }
            }}
          >
            <ArrowLeft size={16} />
            {currentStep === 'profile' && profileReviewMode ? 'Back to review' : 'Back'}
          </button>
        ) : onCancel ? (
          <button className="text-button" type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : (
          <span />
        )}
        {currentStep === 'review' ? (
          <button
            className="primary-button"
            type="button"
            disabled={submitting}
            onClick={() => void submit()}
          >
            {submitting ? (
              <InlineSkeleton label="Completing onboarding" width="1rem" />
            ) : (
              <Check size={17} />
            )}
            {submitting
              ? 'Saving…'
              : mode === 'initial'
                ? firstRecipeChoice === 'example'
                  ? 'Add Stovies & open recipe'
                  : 'Create kitchen & continue'
                : 'Create profile'}
          </button>
        ) : (
          <button className="primary-button" type="button" onClick={next}>
            Continue <ChevronRight size={17} />
          </button>
        )}
      </footer>
    </section>
  );
}
