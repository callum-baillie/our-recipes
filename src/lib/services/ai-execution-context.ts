import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
export type AiExecutionContext = {
  signal?: AbortSignal;
  assertOwned?: () => void;
  deadlineAt?: number;
  parentTraceId?: string;
  parentJobId?: string;
  turnId?: string;
  requestUnits?: number;
  providerEndpoint?: 'decisions' | 'responses' | 'images';
  submittedConfigurations?: Array<{
    model: string;
    promptVersion: string;
    maxOutputTokens?: number;
    imageQuality?: string;
    imageSize?: string;
  }>;
};
const execution = new AsyncLocalStorage<AiExecutionContext>();
export function withAiExecutionContext<T>(context: AiExecutionContext, work: () => T): T {
  return execution.run({ ...execution.getStore(), ...context }, work);
}
export function assertAiExecutionActive() {
  const context = execution.getStore();
  context?.signal?.throwIfAborted();
  context?.assertOwned?.();
  if (context?.deadlineAt && Date.now() >= context.deadlineAt)
    throw new DOMException('The AI request deadline expired.', 'TimeoutError');
}

export function currentAiExecutionContext() {
  return execution.getStore();
}
