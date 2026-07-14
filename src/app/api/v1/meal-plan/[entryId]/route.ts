import { NextResponse } from 'next/server';

import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { PlanningNotFoundError, removeMealPlanEntry } from '@/lib/services/planning-service';

export const runtime = 'nodejs';

export async function DELETE(request: Request, context: { params: Promise<{ entryId: string }> }) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  try {
    removeMealPlanEntry((await context.params).entryId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return jsonError(404, 'planned_meal_not_found', error.message);
    throw error;
  }
}
