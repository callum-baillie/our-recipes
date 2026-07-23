import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  nutritionApiError,
  readJson,
  rejectUntrustedNutritionMutation,
  requireNutritionPrincipal,
} from '@/app/api/v1/nutrition/_shared';
import { recipeCalculationRequestSchema } from '@/lib/domain/nutrition-recipe-calculation';
import {
  calculateRecipeNutrition,
  getRecipeCalculationHistory,
  summarizeRecipeCalculation,
} from '@/lib/services/nutrition-recipe-calculation-service';

type Context = { params: Promise<{ recipeId: string }> };

export async function GET(_request: Request, context: Context) {
  const auth = await requireNutritionPrincipal();
  if (auth.response) return auth.response;
  try {
    const recipeId = z
      .string()
      .uuid()
      .parse((await context.params).recipeId);
    return NextResponse.json({ calculations: getRecipeCalculationHistory(recipeId) });
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
    const recipeId = z
      .string()
      .uuid()
      .parse((await context.params).recipeId);
    const input = recipeCalculationRequestSchema.parse(await readJson(request));
    return NextResponse.json(
      { calculation: summarizeRecipeCalculation(calculateRecipeNutrition(recipeId, input)) },
      { status: 201 },
    );
  } catch (error) {
    return nutritionApiError(error);
  }
}
