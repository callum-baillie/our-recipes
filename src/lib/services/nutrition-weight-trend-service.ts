import 'server-only';

import { z } from 'zod';

import { ensureDatabase, getSqliteDatabase } from '@/lib/db/client';
import { nutritionLocalDateKey } from '@/lib/domain/nutrition-view';
import { getNutritionMeasurementAccessContext } from '@/lib/services/nutrition-profile-service';

const inputSchema = z.object({
  endDate: z.string().date(),
  days: z.union([z.literal(7), z.literal(14), z.literal(30)]),
});

type MeasurementRow = {
  id: string;
  measured_at: number;
  weight_kilograms: number;
  source_type: string;
  approximate: number;
};

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function getNutritionWeightTrendWorkspace(
  profileId: string,
  requesterPrincipalId: string,
  rawInput: unknown,
) {
  const input = inputSchema.parse(rawInput);
  ensureDatabase();
  const access = getNutritionMeasurementAccessContext(profileId, requesterPrincipalId);
  const startDate = addDays(input.endDate, 1 - input.days);
  const common = {
    profileLabel: access.profile.displayName,
    timeZone: access.profile.dailyResetTimezone,
    measurementSystem: access.profile.measurementSystem,
    startDate,
    endDate: input.endDate,
    days: input.days,
    targetWeightKilograms: access.profile.targetWeightKilograms,
  };

  if (!access.profile.weightTrackingEnabled) {
    return { ...common, status: 'disabled' as const, measurements: [] };
  }

  const leadStartDate = addDays(startDate, -6);
  const exactDates = new Set(
    Array.from({ length: input.days + 6 }, (_, index) => addDays(leadStartDate, index)),
  );
  const envelopeStart = Math.floor(
    (Date.parse(`${leadStartDate}T00:00:00Z`) - 36 * 60 * 60 * 1_000) / 1_000,
  );
  const envelopeEnd = Math.floor(
    (Date.parse(`${input.endDate}T23:59:59Z`) + 36 * 60 * 60 * 1_000) / 1_000,
  );
  const rows = getSqliteDatabase()
    .prepare(
      `SELECT id,measured_at,weight_kilograms,source_type,approximate
       FROM nutrition_body_measurements
       WHERE nutrition_profile_id=? AND measured_at BETWEEN ? AND ?
       ORDER BY measured_at,id`,
    )
    .all(profileId, envelopeStart, envelopeEnd) as MeasurementRow[];

  return {
    ...common,
    status: 'enabled' as const,
    measurements: rows.flatMap((row) => {
      const measuredAt = new Date(row.measured_at * 1_000);
      const localDate = nutritionLocalDateKey(measuredAt, access.profile.dailyResetTimezone);
      return exactDates.has(localDate)
        ? [
            {
              id: row.id,
              measuredAt: measuredAt.toISOString(),
              localDate,
              weightKilograms: row.weight_kilograms,
              sourceType: row.source_type,
              approximate: Boolean(row.approximate),
            },
          ]
        : [];
    }),
  };
}

export type NutritionWeightTrendWorkspace = ReturnType<typeof getNutritionWeightTrendWorkspace>;
