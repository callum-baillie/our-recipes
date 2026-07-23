import { NextResponse } from 'next/server';
import { rejectUntrustedNutritionMutation } from '@/app/api/v1/nutrition/_shared';

export async function POST(request: Request) {
  const rejected = rejectUntrustedNutritionMutation(request);
  if (rejected) return rejected;
  return NextResponse.json(
    {
      error: {
        code: 'nutrition_identity_retired',
        message: 'Nutrition now uses the active household profile.',
      },
    },
    { status: 410 },
  );
}
