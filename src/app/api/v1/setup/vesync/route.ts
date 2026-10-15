import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { getHouseholdState } from '@/lib/services/household-service';
import { requireAdminSession, RequestAuthError } from '@/lib/services/auth-service';
import { vesyncCredentialsSchema, VeSyncScaleError } from '@/lib/providers/vesync-scale';
import {
  SCALE_ONBOARDING_COOKIE,
  stageScaleConnection,
  previewScaleConnection,
  selectScaleUser,
  discardScaleConnection,
} from '@/lib/services/nutrition-scale-service';
export const runtime = 'nodejs';
const schema = z.discriminatedUnion('action', [
  vesyncCredentialsSchema.extend({ action: z.literal('connect') }),
  z
    .object({
      action: z.literal('preview'),
      connectionId: z.string().uuid(),
      config: z.string().min(1).max(200),
    })
    .strict(),
  z
    .object({
      action: z.literal('select'),
      connectionId: z.string().uuid(),
      userId: z.string().min(1).max(100),
    })
    .strict(),
  z.object({ action: z.literal('disconnect'), connectionId: z.string().uuid() }).strict(),
]);
export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'Use the app to connect your scale.');
  try {
    const owner = getHouseholdState().household
      ? await requireAdminSession(request, { fresh: false })
      : null;
    const input = schema.safeParse(await request.json().catch(() => null));
    if (!input.success)
      return jsonError(400, 'invalid_scale_request', 'Check the connection details.');
    const jar = await cookies();
    const existing = jar.get(SCALE_ONBOARDING_COOKIE)?.value;
    const binding =
      existing && /^[a-f0-9]{64}$/u.test(existing) ? existing : randomBytes(32).toString('hex');
    const data = input.data;
    let result: unknown;
    if (data.action === 'connect') {
      const { action: _action, ...credentials } = data;
      void _action;
      result = await stageScaleConnection(credentials, binding, owner?.userId);
    } else if (data.action === 'preview')
      result = await previewScaleConnection(data.connectionId, binding, data.config);
    else if (data.action === 'select')
      result = await selectScaleUser(data.connectionId, binding, data.userId);
    else {
      discardScaleConnection(data.connectionId, binding);
      result = { disconnected: true };
    }
    const response = NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(SCALE_ONBOARDING_COOKIE, binding, {
      httpOnly: true,
      sameSite: 'strict',
      secure: new URL(request.url).protocol === 'https:',
      path: '/',
      maxAge: 1800,
    });
    return response;
  } catch (error) {
    if (error instanceof RequestAuthError)
      return jsonError(error.status, error.code, error.message);
    if (error instanceof VeSyncScaleError)
      return jsonError(error.status, 'vesync_unavailable', error.message);
    return jsonError(
      502,
      'vesync_unavailable',
      'VeSync is unavailable. Try again or enter your measurements manually.',
    );
  }
}
