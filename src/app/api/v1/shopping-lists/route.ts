import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { shoppingListCreateSchema, shoppingListGenerateSchema } from '@/lib/domain/planning';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import {
  generateShoppingList,
  createManualShoppingList,
  listShoppingLists,
  PlanningNotFoundError,
} from '@/lib/services/planning-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ lists: listShoppingLists() });
}

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId)
    return jsonError(
      409,
      'profile_selection_required',
      'Choose a household profile before generating a list.',
    );
  const raw = await request.json().catch(() => null);
  const manual = shoppingListCreateSchema.safeParse(raw);
  if (manual.success) {
    return NextResponse.json(
      { list: createManualShoppingList(manual.data.name, actor.profileId) },
      { status: 201 },
    );
  }
  const parsed = shoppingListGenerateSchema.safeParse(raw);
  if (!parsed.success)
    return jsonError(400, 'invalid_list', 'Use a list name or valid week range.');
  try {
    return NextResponse.json(
      { list: generateShoppingList(parsed.data.weekStart, parsed.data.weekEnd, actor.profileId) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof PlanningNotFoundError)
      return jsonError(409, 'plan_required', error.message);
    throw error;
  }
}
