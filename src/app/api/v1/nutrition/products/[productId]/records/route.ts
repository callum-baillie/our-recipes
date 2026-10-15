import { withApiRequestId, authorizeCoreApi } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { nutritionApiError, readJson } from '@/app/api/v1/nutrition/_shared';
import { manualFoodNutritionRecordSchema } from '@/lib/domain/nutrition-recipe-calculation';
import {
  appendManualProductNutritionRecord,
  listProductNutritionRecordHistory,
} from '@/lib/services/nutrition-recipe-calculation-service';

type Context = { params: Promise<{ productId: string }> };

export async function GET(_request: Request, context: Context) {
  const access = await authorizeCoreApi(_request);
  if (access.response) return access.response;

  try {
    const productId = z
      .string()
      .uuid()
      .parse((await context.params).productId);
    return withApiRequestId(
      NextResponse.json({ records: listProductNutritionRecordHistory(productId) }),
      access.requestId,
    );
  } catch (error) {
    return withApiRequestId(nutritionApiError(error), access.requestId);
  }
}

export async function POST(request: Request, context: Context) {
  const access = await authorizeCoreApi(request);
  if (access.response) return access.response;

  try {
    const productId = z
      .string()
      .uuid()
      .parse((await context.params).productId);
    const input = manualFoodNutritionRecordSchema.parse(await readJson(request));
    return withApiRequestId(
      NextResponse.json(
        { record: appendManualProductNutritionRecord(productId, input) },
        { status: 201 },
      ),
      access.requestId,
    );
  } catch (error) {
    return withApiRequestId(nutritionApiError(error), access.requestId);
  }
}
