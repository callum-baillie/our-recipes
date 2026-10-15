import {
  completedAgeOn,
  estimateAdultEnergy,
  type AdultPalCategory,
} from './nutrition-energy-estimate';

export const onboardingPaces = {
  light: { label: 'Light', kgPerWeek: 0.25, description: 'A smaller change to your routine.' },
  moderate: {
    label: 'Moderate',
    kgPerWeek: 0.5,
    description: 'A steady pace with regular adjustments.',
  },
  intense: {
    label: 'Intense',
    kgPerWeek: 0.75,
    description: 'More demanding. Consider support from a qualified professional.',
  },
} as const;
export type OnboardingPace = keyof typeof onboardingPaces;

export function nutritionOnboardingGuidance(
  input: {
    dateOfBirth: string;
    heightCentimeters: number | null;
    currentWeightKilograms: number | null;
    referenceSexCategory: 'female' | 'male' | null;
    activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active' | null;
    profileType: 'adult' | 'dependent';
    lifeStage?: 'pregnant' | 'breastfeeding' | null;
  },
  today: string,
) {
  let age: number | null = null;
  try {
    const parsed = new Date(`${input.dateOfBirth}T00:00:00Z`);
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(input.dateOfBirth) &&
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === input.dateOfBirth &&
      input.dateOfBirth <= today
    )
      age = completedAgeOn(input.dateOfBirth, today);
  } catch {
    /* incomplete input */
  }
  const height = input.heightCentimeters;
  const weight = input.currentWeightKilograms;
  const adult = input.profileType === 'adult' && age !== null && age >= 20 && age <= 120;
  const eligible =
    adult &&
    !input.lifeStage &&
    height !== null &&
    height >= 100 &&
    height <= 250 &&
    weight !== null &&
    weight >= 30 &&
    weight <= 500;
  const bmi = eligible ? weight! / (height! / 100) ** 2 : null;
  const range = eligible
    ? { min: 18.5 * (height! / 100) ** 2, max: 24.9 * (height! / 100) ** 2 }
    : null;
  let maintenance: number | null = null;
  const pal: Record<NonNullable<typeof input.activityLevel>, AdultPalCategory> = {
    sedentary: 'inactive',
    light: 'low_active',
    moderate: 'active',
    active: 'active',
    very_active: 'very_active',
  };
  if (eligible && input.referenceSexCategory && input.activityLevel) {
    try {
      maintenance = estimateAdultEnergy({
        dateOfBirth: input.dateOfBirth,
        effectiveOn: today,
        heightCentimeters: height!,
        currentWeightKilograms: weight!,
        referenceSexCategory: input.referenceSexCategory,
        palCategory: pal[input.activityLevel],
      }).roundedKcal;
    } catch {
      /* no estimate for unsupported inputs */
    }
  }
  return {
    age,
    bmi,
    range,
    maintenance,
    firstMilestone: bmi !== null && bmi >= 25 ? weight! * 0.95 : null,
    canSuggestLoss: bmi !== null && bmi >= 18.5,
  };
}

export function onboardingTimeline(
  current: number | null,
  target: number | null,
  pace: OnboardingPace | null,
  goal: string,
  today: string,
) {
  if (!current || !target || !pace || !['loss', 'gain'].includes(goal)) return null;
  if ((goal === 'loss' && target >= current) || (goal === 'gain' && target <= current)) return null;
  const rate = Math.min(
    onboardingPaces[pace].kgPerWeek,
    current * 0.01,
    goal === 'gain' ? 0.5 : 0.75,
  );
  const weeks = Math.ceil(Math.abs(current - target) / rate);
  if (weeks > 520) return null;
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return { weeks, date: date.toISOString().slice(0, 10), rate };
}
