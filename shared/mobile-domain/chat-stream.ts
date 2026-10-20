export type ChatStreamEvent = {
  type: string;
  sequence?: number;
  delta?: string;
  content?: string;
  message?: string;
  messageId?: string;
};
export type ChatStreamState = {
  sequence: number;
  text: string;
  completed: boolean;
  messageId: string | null;
  status: string;
};
export const initialChatStream: ChatStreamState = {
  sequence: 0,
  text: '',
  completed: false,
  messageId: null,
  status: 'Preparing a response…',
};

/** Apply real events only. Duplicate events are ignored; a missing sequence requires reconciliation. */
export function reduceChatStream(
  previous: ChatStreamState,
  event: ChatStreamEvent,
): ChatStreamState {
  if (!event || typeof event.type !== 'string')
    throw new Error('The server sent an invalid response event.');
  if (event.sequence !== undefined) {
    if (!Number.isInteger(event.sequence) || event.sequence < 1)
      throw new Error('The response sequence is invalid.');
    if (event.sequence <= previous.sequence) return previous;
    if (event.sequence !== previous.sequence + 1)
      throw new Error('Part of the response was lost. Reload the saved conversation.');
  }
  if (previous.completed) return previous;
  if (event.type === 'error') throw new Error(event.message ?? 'The response could not finish.');
  const next = { ...previous, sequence: event.sequence ?? previous.sequence };
  if (event.type === 'text_reset') next.text = '';
  if (event.type === 'text') next.text += event.delta ?? '';
  if (event.type === 'status') next.status = event.message ?? 'Preparing a response…';
  if (event.type === 'done') {
    next.completed = true;
    next.text = event.content ?? next.text;
    next.messageId = event.messageId ?? null;
    next.status = '';
  }
  if (next.text.length > 2_000_000)
    throw new Error('The response is too large. Reload the saved conversation.');
  return next;
}

/** Server-owned running turns survive app restarts; age is never evidence of completion. */
export function reviewedTurnOutcome(
  turns: { id: string; status: string }[] | undefined,
  operationId?: string,
) {
  const known = operationId ? turns?.find((turn) => turn.id === operationId) : undefined;
  const terminal =
    known && ['completed', 'failed', 'cancelled'].includes(known.status) ? known.status : null;
  const running = !!turns?.some((turn) => turn.status === 'running');
  return { terminal, blocked: running || (!!operationId && !terminal) };
}
