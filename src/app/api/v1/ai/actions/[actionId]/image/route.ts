import { personalAiPrincipal } from '@/lib/services/ai-personal-request';
import { DecisionError } from '@/lib/providers/decisions-provider';
import { decisionErrorResponse } from '@/lib/services/decision-request-service';

import { jsonError } from '@/lib/http';
import { AiActionForbiddenError, AiActionNotFoundError } from '@/lib/services/ai-action-service';
import { getAiActionPreviewImageFile } from '@/lib/services/ai-action-preview-image-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ actionId: string }> }) {
  try {
    const { linkedProfileId: profileId } = await personalAiPrincipal(request, false);
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
    if (error instanceof DecisionError) return decisionErrorResponse(error);
    throw error;
  }
}
