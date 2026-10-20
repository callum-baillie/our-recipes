import 'server-only';
import { getAuthenticatedSessionPrincipal } from './auth-service';
import { canAccountUseAi } from './ai-access-service';
import { hasTrustedMutationOrigin } from '@/lib/http';
import { DecisionError } from '@/lib/providers/decisions-provider';
/** Account-owned conversations and drafts never use a cookie as independent authority. */
export async function personalAiPrincipal(request: Request, requireEnabled = true) {
  if (!['GET', 'HEAD'].includes(request.method) && !hasTrustedMutationOrigin(request))
    throw new DecisionError('Use a trusted app origin.', 403);
  const p = await getAuthenticatedSessionPrincipal(request);
  if (!p) throw new DecisionError('Sign in to open your AI workspace.', 401);
  if (p.profileId !== p.linkedProfileId)
    throw new DecisionError('Switch to your own profile to use your private AI workspace.', 403);
  if (requireEnabled && !canAccountUseAi(p.userId))
    throw new DecisionError('AI is disabled for this account.', 403);
  return p;
}
