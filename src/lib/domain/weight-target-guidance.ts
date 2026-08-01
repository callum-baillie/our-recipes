export type WeightGoalPace = 'gradual' | 'steady';

export const weightGoalPaces: Record<
  WeightGoalPace,
  { label: string; kilogramsPerWeek: number; description: string }
> = {
  gradual: {
    label: 'Gradual',
    kilogramsPerWeek: 0.25,
    description: 'About 0.25 kg (0.5 lb) per week.',
  },
  steady: {
    label: 'Steady',
    kilogramsPerWeek: 0.5,
    description: 'About 0.5 kg (1 lb) per week.',
  },
};

function addWeeks(isoDate: string, weeks: number) {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return date.toISOString().slice(0, 10);
}

export function weightTargetTimeline(input: {
  goalType: 'gain' | 'loss';
  currentWeightKilograms: number | null;
  targetWeightKilograms: number | null;
  pace: WeightGoalPace;
  startsOn: string;
}) {
  const { currentWeightKilograms, goalType, pace, startsOn, targetWeightKilograms } = input;
  if (
    currentWeightKilograms === null ||
    targetWeightKilograms === null ||
    currentWeightKilograms <= 0 ||
    targetWeightKilograms <= 0
  )
    return null;
  const changeKilograms = targetWeightKilograms - currentWeightKilograms;
  if (
    (goalType === 'loss' && changeKilograms >= 0) ||
    (goalType === 'gain' && changeKilograms <= 0)
  )
    return null;
  const weeks = Math.max(
    1,
    Math.ceil(Math.abs(changeKilograms) / weightGoalPaces[pace].kilogramsPerWeek),
  );
  const targetDate = addWeeks(startsOn, weeks);
  return targetDate ? { weeks, targetDate, changeKilograms: Math.abs(changeKilograms) } : null;
}
