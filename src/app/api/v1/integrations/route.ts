import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { vesyncCredentialsSchema, VeSyncScaleError } from '@/lib/providers/vesync-scale';
import { syncIntervalSchema } from '@/lib/domain/integration-settings';
import {
  integrationState,
  addIntegration,
  previewIntegration,
  assignIntegration,
  updateIntegration,
  removeIntegration,
  removeAssignment,
  syncIntegration,
} from '@/lib/services/integration-service';
export const runtime = 'nodejs';
const id = z.string().uuid();
const label = z.string().trim().min(1).max(80);
const schema = z.discriminatedUnion('action', [
  vesyncCredentialsSchema.extend({ action: z.literal('connect'), label }),
  z.object({ action: z.literal('preview'), id, config: z.string().min(1).max(200) }).strict(),
  z
    .object({
      action: z.literal('assign'),
      id,
      config: z.string().min(1).max(200),
      scaleUserId: z.string().min(1).max(100),
      profileId: id,
    })
    .strict(),
  z
    .object({ action: z.literal('settings'), id, label, syncIntervalMinutes: syncIntervalSchema })
    .strict(),
  z.object({ action: z.literal('remove'), id }).strict(),
  z.object({ action: z.literal('unassign'), id }).strict(),
  z.object({ action: z.literal('sync'), id }).strict(),
]);
function errorResponse(error: unknown) {
  if (error instanceof VeSyncScaleError)
    return jsonError(error.status, 'integration_error', error.message);
  return jsonError(500, 'integration_error', 'Unable to update integrations. Please try again.');
}
export async function GET(request: Request) {
  try {
    const principal = await getAuthenticatedSessionPrincipal(request);
    if (!principal)
      return jsonError(401, 'authentication_required', 'Sign in to manage integrations.');
    return NextResponse.json(integrationState(principal), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'Use a trusted app origin to manage integrations.');
  try {
    const principal = await getAuthenticatedSessionPrincipal(request);
    if (!principal)
      return jsonError(401, 'authentication_required', 'Sign in to manage integrations.');
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return jsonError(
        400,
        'invalid_integration_request',
        'Check the connection details and settings.',
      );
    const input = parsed.data;
    let result: unknown = {};
    switch (input.action) {
      case 'connect': {
        const { action: _action, label: accountLabel, ...credentials } = input;
        void _action;
        result = await addIntegration(principal, credentials, accountLabel);
        break;
      }
      case 'preview':
        result = { readings: await previewIntegration(principal, input.id, input.config) };
        break;
      case 'assign':
        result = await assignIntegration(
          principal,
          input.id,
          input.config,
          input.scaleUserId,
          input.profileId,
        );
        break;
      case 'settings':
        updateIntegration(principal, input.id, input.label, input.syncIntervalMinutes);
        break;
      case 'remove':
        removeIntegration(principal, input.id);
        break;
      case 'unassign':
        removeAssignment(principal, input.id);
        break;
      case 'sync':
        result = await syncIntegration(input.id, principal);
        break;
    }
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
