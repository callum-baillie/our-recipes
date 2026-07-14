import { NextResponse } from 'next/server';

import { profileInputSchema } from '@/lib/domain/setup';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { addProfile, ConflictError, getHouseholdState } from '@/lib/services/household-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const includeArchived = new URL(request.url).searchParams.get('includeArchived') === 'true';
  return NextResponse.json(getHouseholdState(includeArchived).profiles);
}

export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request)) {
    return jsonError(403, 'untrusted_origin', 'This change must come from a trusted app origin.');
  }
  const parsed = profileInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'invalid_request', 'Check the profile details.');
  try {
    return NextResponse.json(addProfile(parsed.data), { status: 201 });
  } catch (error) {
    if (error instanceof ConflictError) return jsonError(409, 'setup_required', error.message);
    throw error;
  }
}
