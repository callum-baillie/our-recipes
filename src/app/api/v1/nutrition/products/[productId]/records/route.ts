import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  nutritionApiError,
  readJson,
  rejectUntrustedNutritionMutation,
  requireNutritionPrincipal,
} from '@/app/api/v1/nutrition/_shared';
import { manualFoodNutritionRecordSchema } from '@/lib/domain/nutrition-recipe-calculation';
import {
  appendManualProductNutritionRecord,
  listProductNutritionRecordHistory,
} from '@/lib/services/nutrition-recipe-calculation-service';

type Context = { params: Promise<{ productId: string }> };

export async function GET(_request: Request, context: Context) {
  const auth = await requireNutritionPrincipal();
  if (auth.response) return auth.response;
  try {
    const productId = z
      .string()
      .uuid()
      .parse((await context.params).productId);
    return NextResponse.json({ records: listProductNutritionRecordHistory(productId) });
  } catch (error) {
    return nutritionApiError(error);
  }
}

export async function POST(request: Request, context: Context) {
  const rejected = rejectUntrustedNutritionMutation(request);
  if (rejected) return rejected;
  const auth = await requireNutritionPrincipal();
  if (auth.response) return auth.response;
  try {
    const productId = z
      .string()
      .uuid()
      .parse((await context.params).productId);
    const input = manualFoodNutritionRecordSchema.parse(await readJson(request));
    return NextResponse.json(
      { record: appendManualProductNutritionRecord(productId, input) },
      { status: 201 },
    );
  } catch (error) {
    return nutritionApiError(error);
  }
}
