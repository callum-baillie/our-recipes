import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { parseCompositionEstimate } from '@/lib/domain/qn-body-composition';
import { NextResponse } from 'next/server';
import { and, eq, desc, isNotNull } from 'drizzle-orm';
import { getDatabase } from '@/lib/db/client';
import { nutritionScaleConnections, nutritionBodyMeasurements } from '@/lib/db/schema';
import {
  authorizeNutritionProfileAction,
  recordBodyMeasurement,
} from '@/lib/services/nutrition-profile-service';
import { latestLinkedScaleReading } from '@/lib/services/nutrition-scale-service';
import { VeSyncScaleError } from '@/lib/providers/vesync-scale';
import { jsonError } from '@/lib/http';
import {
  nutritionApiError,
  parseNutritionProfileId,
  rejectUntrustedNutritionMutation,
  requireNutritionPrincipal,
} from '../../../_shared';
export const runtime = 'nodejs';
type Context = { params: Promise<{ profileId: string }> };
async function access(request: Request, context: Context) {
  const session = await getAuthenticatedSessionPrincipal(request);
  if (!session)
    return {
      response: jsonError(401, 'authentication_required', 'Sign in to manage your scale.'),
    } as const;
  const auth = await requireNutritionPrincipal();
  if (auth.response) return { response: auth.response } as const;
  const id = parseNutritionProfileId((await context.params).profileId);
  const profile = authorizeNutritionProfileAction(id, auth.principal.id, 'manage_profile');
  if (
    profile.linkedHouseholdProfileId !== session.linkedProfileId &&
    !(session.role === 'admin' && session.profileId === session.linkedProfileId)
  )
    return {
      response: jsonError(
        403,
        'integration_forbidden',
        'Sign in with the account that owns this profile.',
      ),
    } as const;
  return { id, profile, auth } as const;
}
export async function GET(request: Request, context: Context) {
  try {
    const result = await access(request, context);
    if (result.response) return result.response;
    const connection = getDatabase()
      .select({ id: nutritionScaleConnections.id })
      .from(nutritionScaleConnections)
      .where(eq(nutritionScaleConnections.nutritionProfileId, result.id))
      .get();
    const latest = getDatabase()
      .select()
      .from(nutritionBodyMeasurements)
      .where(
        and(
          eq(nutritionBodyMeasurements.nutritionProfileId, result.id),
          isNotNull(nutritionBodyMeasurements.bodyCompositionEstimate),
        ),
      )
      .orderBy(desc(nutritionBodyMeasurements.measuredAt))
      .get();
    return NextResponse.json(
      {
        compositionEstimate: parseCompositionEstimate(latest?.bodyCompositionEstimate),
        measuredAt: latest?.measuredAt,
        connected: !!connection,
        provider: 'vesync',
        model: 'ESF24',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return nutritionApiError(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  const rejected = rejectUntrustedNutritionMutation(request);
  if (rejected) return rejected;
  try {
    const result = await access(request, context);
    if (result.response) return result.response;
    getDatabase()
      .delete(nutritionScaleConnections)
      .where(eq(nutritionScaleConnections.nutritionProfileId, result.id))
      .run();
    return NextResponse.json({ connected: false });
  } catch (error) {
    return nutritionApiError(error);
  }
}
export async function POST(request: Request, context: Context) {
  const rejected = rejectUntrustedNutritionMutation(request);
  if (rejected) return rejected;
  try {
    const result = await access(request, context);
    if (result.response) return result.response;
    if (!result.profile.weightTrackingEnabled)
      return jsonError(
        409,
        'weight_tracking_disabled',
        'Enable weight tracking before importing a weigh-in.',
      );
    const original = getDatabase()
      .select()
      .from(nutritionScaleConnections)
      .where(eq(nutritionScaleConnections.nutritionProfileId, result.id))
      .get();
    const reading = await latestLinkedScaleReading(result.id);
    const refreshed = await access(request, context);
    if (refreshed.response) return refreshed.response;
    // Recheck access and connection after the upstream request, which may take time.
    authorizeNutritionProfileAction(result.id, result.auth.principal.id, 'manage_profile');
    const connected = getDatabase()
      .select()
      .from(nutritionScaleConnections)
      .where(eq(nutritionScaleConnections.nutritionProfileId, result.id))
      .get();
    if (
      !connected ||
      connected.id !== original?.id ||
      connected.selectedUser !== original.selectedUser ||
      connected.deviceConfig !== original.deviceConfig ||
      connected.accountId !== original.accountId
    )
      return jsonError(
        409,
        'scale_disconnected',
        'The scale was disconnected before this import finished.',
      );
    const saved = getDatabase().transaction((tx) => {
      const existing = tx
        .select()
        .from(nutritionBodyMeasurements)
        .where(
          and(
            eq(nutritionBodyMeasurements.nutritionProfileId, result.id),
            eq(nutritionBodyMeasurements.measuredAt, new Date(reading.measuredAt)),
            eq(nutritionBodyMeasurements.weightKilograms, reading.weightKilograms),
            eq(nutritionBodyMeasurements.sourceType, 'imported'),
          ),
        )
        .get();
      const estimate = reading.compositionEstimate
        ? JSON.stringify(reading.compositionEstimate)
        : null;
      if (existing) {
        tx.update(nutritionBodyMeasurements)
          .set({ bodyCompositionEstimate: estimate })
          .where(eq(nutritionBodyMeasurements.id, existing.id))
          .run();
        return {
          imported: false,
          measurement: { ...existing, bodyCompositionEstimate: estimate },
          compositionEstimate: reading.compositionEstimate ?? null,
        };
      }
      const measurement = recordBodyMeasurement(result.id, result.auth.actor, {
        measuredAt: reading.measuredAt,
        weightKilograms: reading.weightKilograms,
        sourceType: 'imported',
        advancedMetrics:
          reading.bodyFatPercent !== undefined ? { bodyFatPercent: reading.bodyFatPercent } : {},
        note: 'VeSync ESF24',
      });
      // Keep current profile inputs intentional; sync adds history, not an overwrite.
      tx.update(nutritionBodyMeasurements)
        .set({ bodyCompositionEstimate: estimate })
        .where(eq(nutritionBodyMeasurements.id, measurement.id))
        .run();
      return {
        imported: true,
        measurement: { ...measurement, bodyCompositionEstimate: estimate },
        compositionEstimate: reading.compositionEstimate ?? null,
      };
    });
    return NextResponse.json(saved, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof VeSyncScaleError)
      return jsonError(error.status, 'vesync_unavailable', error.message);
    return nutritionApiError(error);
  }
}
