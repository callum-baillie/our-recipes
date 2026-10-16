import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { getTaskSettings, saveTaskSettings } from '@/lib/services/task-settings-service';
import { taskSettingsSchema } from '@/lib/domain/task-settings';
import { hasTrustedMutationOrigin, jsonError } from '@/lib/http';
import { listProfiles } from '@/lib/services/household-service';
export async function GET(request: Request) {
  const principal = await getAuthenticatedSessionPrincipal(request);
  if (!principal) return jsonError(401, 'sign_in_required', 'Sign in to manage your automation.');
  return NextResponse.json(getTaskSettings(principal.linkedProfileId), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
export async function PATCH(request: Request) {
  const principal = await getAuthenticatedSessionPrincipal(request);
  if (!principal) return jsonError(401, 'sign_in_required', 'Sign in to manage your automation.');
  if (!hasTrustedMutationOrigin(request))
    return jsonError(403, 'untrusted_origin', 'Use a trusted app origin.');
  if (principal.role === 'child' || principal.accountRole === 'child')
    return jsonError(403, 'forbidden', 'Only adult accounts can schedule tasks.');
  const parsed = z
    .object({ settings: taskSettingsSchema, expectedVersion: z.number().int().min(0) })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return jsonError(
      400,
      'invalid_task_settings',
      parsed.error.issues[0]?.message ?? 'Check automation settings.',
    );
  const available = new Set(listProfiles().map((profile) => profile.id));
  if (parsed.data.settings.selectedProfileIds?.some((id) => !available.has(id)))
    return jsonError(400, 'invalid_profiles', 'Choose existing household members.');
  try {
    return NextResponse.json(
      saveTaskSettings(principal, parsed.data.settings, parsed.data.expectedVersion),
    );
  } catch (error) {
    return jsonError(
      409,
      'task_settings_conflict',
      error instanceof Error ? error.message : 'Reload before saving.',
    );
  }
}
