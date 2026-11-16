import 'server-only';
import { randomUUID } from 'node:crypto';
import type { AiChatProblem } from '@/lib/domain/ai-recovery';
import { AiExecutionLimitError } from './ai-execution-service';
import { AiChatRateLimitError } from './ai-chat-service';
import { AiConsentRequiredError, requestAiRecovery, limitBounds } from './ai-recovery-service';
import { getEffectiveAiPolicy } from './ai-access-service';
import type { RequestPrincipal } from './auth-service';

/** Safe copyable diagnostics: no prompts, tool arguments, provider body, paths or credentials. */
export function aiChatProblem(
  error: unknown,
  input?: { principal: RequestPrincipal; threadId: string },
): AiChatProblem {
  const reference = randomUUID();
  let code = 'chat_failed',
    title = 'The assistant could not finish',
    message = 'Your conversation is saved. Review any drafts before sending a new request.';
  let setting: keyof typeof limitBounds | undefined;
  const allowanceError =
    error instanceof AiExecutionLimitError || error instanceof AiChatRateLimitError;
  if (allowanceError) {
    code = error instanceof AiChatRateLimitError ? 'chat_turn_limit' : 'account_request_limit';
    title = 'The request limit was reached';
    message =
      error instanceof AiChatRateLimitError
        ? error.message
        : 'This account has used its AI allowance for the last ten minutes. Tool-assisted replies can use several requests. Wait for the window to clear, or ask an administrator to approve a higher limit.';
    setting = 'generationsPerTenMinutes';
  } else if (error instanceof AiConsentRequiredError) {
    code = 'sharing_approval_required';
    title = 'Permission is needed';
    message = error.message;
  } else if ((error as { code?: unknown })?.code === 'approval_invalid') {
    code = 'approval_invalid';
    title = 'This approval needs review';
    message =
      error instanceof Error ? error.message : 'Refresh the approval request before continuing.';
  } else if ((error as { code?: unknown })?.code === 'output_limit') {
    code = 'response_limit';
    title = 'The draft was too large';
    message =
      'The AI reached the response-size limit before finishing. Try fewer meals, or ask an administrator to raise the limit.';
    setting = 'maxOutputTokens';
  } else if ((error as { code?: unknown })?.code === 'tool_limit') {
    code = 'tool_round_limit';
    title = 'This reply needs more steps';
    message =
      'The assistant reached its tool-step limit. Try a smaller task or ask an administrator for more steps.';
    setting = 'toolRoundLimit';
  } else if (
    error instanceof Error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  ) {
    code = error.name === 'TimeoutError' ? 'response_timeout' : 'response_stopped';
    title = code === 'response_timeout' ? 'The reply took too long' : 'The reply stopped';
    message =
      'Review any drafts or background tasks before trying again. The previous request will not be automatically replayed.';
    if (code === 'response_timeout') setting = 'requestTimeoutSeconds';
  } else if (error instanceof Error) {
    // Explicit public error classes mark safe messages; minified names are not used as authority.
    if ('publicMessage' in error && typeof error.publicMessage === 'string')
      message = error.publicMessage;
  }
  const recoveryRequests = error instanceof AiConsentRequiredError ? error.requests : [];
  if (setting && input) {
    const current = getEffectiveAiPolicy(input.principal.profileId)[setting];
    const value = Math.min(
      limitBounds[setting].max,
      Math.max(
        current + (setting === 'generationsPerTenMinutes' ? 16 : 1),
        Math.ceil(current * 2),
        allowanceError ? (error.used ?? current) + 16 : 0,
      ),
    );
    if (value > current && (!allowanceError || value > (error.used ?? 0))) {
      try {
        recoveryRequests.push(
          requestAiRecovery(input.principal, input.threadId, {
            kind: 'limit',
            setting,
            value,
            reason: message,
          }),
        );
      } catch {
        /* Read-only context, removed account or stale conversation: keep the safe explanation. */
      }
    } else
      message +=
        ' This setting is already at its supported maximum; split the task into smaller parts.';
  }
  const policy = input ? getEffectiveAiPolicy(input.principal.profileId) : null;
  const settings = policy
    ? `\nConfigured limits: ${policy.generationsPerTenMinutes} requests/10 minutes; ${policy.maxOutputTokens} output tokens; ${policy.requestTimeoutSeconds}s; ${policy.toolRoundLimit} tool rounds.`
    : '';
  const usage =
    allowanceError && error.used !== undefined
      ? `\n${error instanceof AiChatRateLimitError ? 'Assistant replies started' : 'Provider requests already used'} in this window: ${error.used}/${error.limit ?? policy?.generationsPerTenMinutes}.`
      : '';
  const details = `Bòrd AI error\nCode: ${code}\nReference: ${reference}\nTime: ${new Date().toISOString()}\n${message}${settings}${usage}`;
  console.warn('Bord chat recovery problem', { reference, code });
  return { code, title, message, reference, details, recoveryRequests };
}
