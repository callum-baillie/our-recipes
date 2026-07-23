import { NextResponse } from 'next/server';

import { rejectUntrustedNutritionMutation } from '@/app/api/v1/nutrition/_shared';

export async function DELETE(request: Request, context?: unknown) {
  void context;
  const rejected = rejectUntrustedNutritionMutation(request);
  if (rejected) return rejected;
  return NextResponse.json(
    {
      error: {
        code: 'nutrition_profile_deletion_retired',
        message: 'Nutrition data follows the household profile lifecycle.',
      },
    },
    { status: 410 },
  );
}
