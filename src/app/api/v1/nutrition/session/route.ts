import { NextResponse } from 'next/server';
import {
  rejectUntrustedNutritionMutation,
  requireNutritionPrincipal,
} from '@/app/api/v1/nutrition/_shared';

export async function GET() {
  const auth = await requireNutritionPrincipal();
  return (
    auth.response ??
    NextResponse.json({
      actor: {
        householdProfileId: auth.principal!.householdProfileId,
        nutritionProfileId: auth.principal!.nutritionProfileId,
      },
    })
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
