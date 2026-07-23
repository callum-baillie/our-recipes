import { NextResponse } from 'next/server';
import { rejectUntrustedNutritionMutation } from '@/app/api/v1/nutrition/_shared';

export async function GET() {
  return retired();
}

export async function POST(request: Request) {
  const rejected = rejectUntrustedNutritionMutation(request);
  if (rejected) return rejected;
  return retired();
}

function retired() {
  return NextResponse.json(
    {
      error: {
        code: 'nutrition_permissions_retired',
        message: 'Nutrition is shared through household profiles, not separate permission grants.',
      },
    },
    { status: 410 },
  );
}
