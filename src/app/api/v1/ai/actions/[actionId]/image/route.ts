import { cookies } from 'next/headers';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { jsonError } from '@/lib/http';
import { AiActionForbiddenError, AiActionNotFoundError } from '@/lib/services/ai-action-service';
import { getAiActionPreviewImageFile } from '@/lib/services/ai-action-preview-image-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ actionId: string }> }) {
  const profileId = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value).profileId;
  if (!profileId)
    return jsonError(409, 'profile_selection_required', 'Choose a household profile first.');
  try {
    const file = await getAiActionPreviewImageFile((await context.params).actionId, profileId);
    if (!file)
      return jsonError(404, 'preview_image_not_found', 'That preview image is unavailable.');
    return new Response(new Uint8Array(file.data), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof AiActionNotFoundError)
      return jsonError(404, 'action_not_found', error.message);
    if (error instanceof AiActionForbiddenError)
      return jsonError(403, 'action_forbidden', error.message);
    throw error;
  }
}
