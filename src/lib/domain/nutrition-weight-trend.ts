import type { NutritionWeightTrendWorkspace } from '@/lib/services/nutrition-weight-trend-service';

const POUNDS_PER_KILOGRAM = 2.2046226218;

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function displayWeight(kilograms: number, measurementSystem: 'metric' | 'imperial') {
  return round(measurementSystem === 'imperial' ? kilograms * POUNDS_PER_KILOGRAM : kilograms, 1);
}

export function buildNutritionWeightTrend(workspace: NutritionWeightTrendWorkspace) {
  const unit = workspace.measurementSystem === 'imperial' ? ('lb' as const) : ('kg' as const);
  const base = {
    profileLabel: workspace.profileLabel,
    startDate: workspace.startDate,
    endDate: workspace.endDate,
    days: workspace.days,
    unit,
  };
  if (workspace.status === 'disabled') {
    return {
      ...base,
      status: 'disabled' as const,
      observations: [],
      rollingAverages: [],
      target: null,
      axis: null,
    };
  }

  const visibleDates = Array.from({ length: workspace.days }, (_, index) =>
    addDays(workspace.startDate, index),
  );
  const visibleDateSet = new Set(visibleDates);
  const latestByDate = new Map<string, (typeof workspace.measurements)[number]>();
  for (const measurement of workspace.measurements) {
    const current = latestByDate.get(measurement.localDate);
    if (!current || measurement.measuredAt > current.measuredAt) {
      latestByDate.set(measurement.localDate, measurement);
    }
  }
  const visibleMeasurements = workspace.measurements.filter((measurement) =>
    visibleDateSet.has(measurement.localDate),
  );
  const rollingAverages = visibleDates.map((date) => {
    const present = Array.from({ length: 7 }, (_, offset) =>
      latestByDate.get(addDays(date, offset - 6)),
    ).filter((measurement): measurement is NonNullable<typeof measurement> => Boolean(measurement));
    const kilograms =
      present.length === 0
        ? null
        : present.reduce((sum, measurement) => sum + measurement.weightKilograms, 0) /
          present.length;
    return {
      date,
      contributingDays: present.length,
      weightKilograms: kilograms === null ? null : round(kilograms),
      displayWeight:
        kilograms === null ? null : displayWeight(kilograms, workspace.measurementSystem),
    };
  });

  if (visibleMeasurements.length === 0) {
    return {
      ...base,
      status: 'empty' as const,
      observations: [],
      rollingAverages,
      target:
        workspace.targetWeightKilograms === null
          ? null
          : {
              weightKilograms: round(workspace.targetWeightKilograms),
              displayWeight: displayWeight(
                workspace.targetWeightKilograms,
                workspace.measurementSystem,
              ),
            },
      axis: null,
    };
  }

  const axisValuesKilograms = [
    ...visibleMeasurements.map((measurement) => measurement.weightKilograms),
    ...rollingAverages.flatMap((average) =>
      average.weightKilograms === null ? [] : [average.weightKilograms],
    ),
    ...(workspace.targetWeightKilograms === null ? [] : [workspace.targetWeightKilograms]),
  ];
  const rawMinimum = Math.min(...axisValuesKilograms);
  const rawMaximum = Math.max(...axisValuesKilograms);
  const midpoint = (rawMinimum + rawMaximum) / 2;
  const minimumSpan = Math.max(5, midpoint * 0.1);
  const span = Math.max(rawMaximum - rawMinimum, minimumSpan);
  let axisMinimumKilograms = midpoint - span / 2;
  let axisMaximumKilograms = midpoint + span / 2;
  if (axisMinimumKilograms < 0) {
    axisMaximumKilograms -= axisMinimumKilograms;
    axisMinimumKilograms = 0;
  }
  const visualPercent = (kilograms: number) =>
    round(
      ((kilograms - axisMinimumKilograms) / (axisMaximumKilograms - axisMinimumKilograms)) * 100,
      2,
    );

  return {
    ...base,
    status: 'ready' as const,
    observations: visibleMeasurements.map((measurement) => ({
      ...measurement,
      weightKilograms: round(measurement.weightKilograms),
      displayWeight: displayWeight(measurement.weightKilograms, workspace.measurementSystem),
      visualPercent: visualPercent(measurement.weightKilograms),
    })),
    rollingAverages: rollingAverages.map((average) => ({
      ...average,
      visualPercent:
        average.weightKilograms === null ? null : visualPercent(average.weightKilograms),
    })),
    target:
      workspace.targetWeightKilograms === null
        ? null
        : {
            weightKilograms: round(workspace.targetWeightKilograms),
            displayWeight: displayWeight(
              workspace.targetWeightKilograms,
              workspace.measurementSystem,
            ),
            visualPercent: visualPercent(workspace.targetWeightKilograms),
          },
    axis: {
      minimumKilograms: round(axisMinimumKilograms),
      maximumKilograms: round(axisMaximumKilograms),
      minimumDisplay: displayWeight(axisMinimumKilograms, workspace.measurementSystem),
      maximumDisplay: displayWeight(axisMaximumKilograms, workspace.measurementSystem),
    },
  };
}

export type NutritionWeightTrend = ReturnType<typeof buildNutritionWeightTrend>;
