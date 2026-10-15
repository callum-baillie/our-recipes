import { withApiRequestId, authorizeCoreApi } from '@/lib/api-auth';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { nutritionApiError, readJson } from '@/app/api/v1/nutrition/_shared';
import { recipeCalculationRequestSchema } from '@/lib/domain/nutrition-recipe-calculation';
import {
  calculateRecipeNutrition,
  getRecipeCalculationHistory,
  summarizeRecipeCalculation,
} from '@/lib/services/nutrition-recipe-calculation-service';

type Context = { params: Promise<{ recipeId: string }> };

export async function GET(_request: Request, context: Context) {
  const access = await authorizeCoreApi(_request);
  if (access.response) return access.response;

  try {
    const recipeId = z
      .string()
      .uuid()
      .parse((await context.params).recipeId);
    return withApiRequestId(
      NextResponse.json({ calculations: getRecipeCalculationHistory(recipeId) }),
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
    const recipeId = z
      .string()
      .uuid()
      .parse((await context.params).recipeId);
    const input = recipeCalculationRequestSchema.parse(await readJson(request));
    return withApiRequestId(
      NextResponse.json(
        { calculation: summarizeRecipeCalculation(calculateRecipeNutrition(recipeId, input)) },
        { status: 201 },
      ),
      access.requestId,
    );
  } catch (error) {
    return withApiRequestId(nutritionApiError(error), access.requestId);
  }
}
