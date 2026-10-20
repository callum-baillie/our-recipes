import type { RecoveryStorage, ScannerActor } from './scanner-recovery';
export type ChatOperationReference = {
  version: 1;
  instanceUrl: string;
  actor: ScannerActor;
  threadId: string;
  operationId: string;
  createdAt: string;
};
/** Only an authorized server reference is durable. Prompt text, files, images and credentials are excluded. */
export function chatRecovery(
  storage: RecoveryStorage,
  key: string,
  instanceUrl: string,
  userId: string,
) {
  const parse = (raw: string) => {
    if (raw.length > 1800) throw new Error('The saved conversation recovery record is invalid.');
    const value = JSON.parse(raw) as ChatOperationReference;
    if (
      value.version !== 1 ||
      value.instanceUrl !== instanceUrl ||
      value.actor?.userId !== userId ||
      !value.actor.profileId ||
      !value.threadId ||
      !value.operationId ||
      !value.createdAt ||
      Object.keys(value).some(
        (field) =>
          !['version', 'instanceUrl', 'actor', 'threadId', 'operationId', 'createdAt'].includes(
            field,
          ),
      ) ||
      Object.keys(value.actor).some((field) => !['userId', 'profileId'].includes(field))
    )
      throw new Error('This recovery reference does not belong to the connected account.');
    return value;
  };
  const read = async () => {
    const value = await storage.getItem(key);
    return value ? parse(value) : null;
  };
  return {
    read,
    async write(value: ChatOperationReference) {
      const raw = JSON.stringify(value);
      parse(raw);
      const existing = await read();
      if (existing && JSON.stringify(existing) !== raw)
        throw new Error(
          'Review the previous conversation outcome before starting another request.',
        );
      await storage.setItem(key, raw);
      if (JSON.stringify(await read()) !== raw)
        throw new Error('Conversation recovery could not be stored securely.');
    },
    async acknowledge(operationId: string) {
      const saved = await read();
      if (saved?.operationId === operationId) await storage.removeItem(key);
    },
  };
}

export function matchesChatOperation(
  reference: ChatOperationReference,
  input: { instanceUrl: string; actor: ScannerActor; threadId: string; operationId: string },
) {
  return (
    reference.instanceUrl === input.instanceUrl &&
    reference.actor.userId === input.actor.userId &&
    reference.actor.profileId === input.actor.profileId &&
    reference.threadId === input.threadId &&
    reference.operationId === input.operationId
  );
}
