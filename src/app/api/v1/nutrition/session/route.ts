import { NextResponse } from 'next/server';
import {
  rejectUntrustedNutritionMutation,
  requireNutritionPrincipal,
} from '@/app/api/v1/nutrition/_shared';

export async function GET(request: Request) {
  const auth = await requireNutritionPrincipal(request);
  return (
    auth.response ??
    NextResponse.json(
      {
        actor: {
          householdProfileId: auth.principal!.householdProfileId,
          nutritionProfileId: auth.principal!.nutritionProfileId,
          viewedHouseholdProfileId: auth.principal!.viewedHouseholdProfileId,
          viewedNutritionProfileId: auth.principal!.viewedNutritionProfileId,
        },
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  );
}

export async function POST(request: Request) {
  const rejected = rejectUntrustedNutritionMutation(request);
  if (rejected) return rejected;
  return NextResponse.json(
    {
      error: {
        code: 'nutrition_session_retired',
        message: 'Switch the active household profile in the app header.',
      },
    },
    { status: 410 },
  );
}

export async function DELETE(request: Request) {
  const rejected = rejectUntrustedNutritionMutation(request);
  if (rejected) return rejected;
  return NextResponse.json(
    {
      error: {
        code: 'nutrition_session_retired',
        message: 'Nutrition has no separate session to lock.',
      },
    },
    { status: 410 },
  );
}
