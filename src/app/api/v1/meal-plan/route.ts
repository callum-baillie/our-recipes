import { NextResponse } from 'next/server';

import { authorizeApi, requireTrustedSessionMutation, withApiRequestId } from '@/lib/api-auth';
import { idempotentJsonResponse, prepareIdempotentMutation } from '@/lib/api-idempotency';
import { isoDateSchema, mealPlanEntrySchema } from '@/lib/domain/planning';
import { jsonError } from '@/lib/http';
import { listPlannedMeals, PlanningNotFoundError } from '@/lib/services/planning-service';
import { addMealPlanEntryWithNutrition } from '@/lib/services/nutrition-planning-orchestration-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authorization = await authorizeApi(request, 'mealPlans', 'read');
  if (authorization.response) return authorization.response;
  const params = new URL(request.url).searchParams;
  const start = isoDateSchema.safeParse(params.get('start'));
  const end = isoDateSchema.safeParse(params.get('end'));
  if (!start.success || !end.success)
    return jsonError(400, 'invalid_week', 'Use a valid week range.');
  return withApiRequestId(
    NextResponse.json({ meals: listPlannedMeals(start.data, end.data) }),
    authorization.requestId,
  );
}

export async function POST(request: Request) {
  const authorization = await authorizeApi(request, 'mealPlans', 'create');
  if (authorization.response) return authorization.response;
  const originError = requireTrustedSessionMutation(
    request,
    authorization.principal,
    authorization.requestId,
  );
  if (originError) return originError;
  const idempotency = await prepareIdempotentMutation(
    request,
    authorization.principal,
    authorization.requestId,
  );
  if (idempotency.response) return idempotency.response;
  const parsed = mealPlanEntrySchema.safeParse(idempotency.context.body);
  if (!parsed.success)
    return jsonError(400, 'invalid_planned_meal', 'Check the planned meal details.');
  try {
    return idempotentJsonResponse(
      idempotency.context,
      { meal: addMealPlanEntryWithNutrition(parsed.data, authorization.principal.profileId) },
      authorization.requestId,
      201,
    );
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return jsonError(404, 'recipe_not_found', error.message);
    throw error;
  }
}
