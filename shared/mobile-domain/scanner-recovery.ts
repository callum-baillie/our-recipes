export type ScannerActor = { userId: string; profileId: string };
export type ScannerOperation = {
  version: 1;
  operationId: string;
  actor: ScannerActor;
  instanceUrl: string;
  createdAt: string;
  path: string;
  body: Record<string, unknown>;
  description: string;
  destination: 'pantry' | 'shopping';
};
export type RecoveryStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
export type ScannerJournal = {
  read(): Promise<ScannerOperation | null>;
  write(operation: ScannerOperation): Promise<void>;
  acknowledge(operationId: string): Promise<void>;
  archiveUnknown(operationId: string): Promise<void>;
  closedUnknown(): Promise<ScannerOperation[]>;
};
/** Legacy local-stock receipts may already have expired before this release. */
export function scannerRecoveryMode(operation: ScannerOperation) {
  return operation.path === '/api/v1/pantry/batches' ? 'inspect_only' : 'exact_retry';
}
export function sameScannerActor(
  operation: ScannerOperation,
  instanceUrl: string,
  actor: ScannerActor,
) {
  return (
    operation.instanceUrl === instanceUrl &&
    operation.actor.userId === actor.userId &&
    operation.actor.profileId === actor.profileId
  );
}
export function parseScannerOperation(
  value: string,
  instanceUrl: string,
  userId: string,
): ScannerOperation {
  if (value.length > 24000)
    throw new Error(
      'The saved confirmation is too large. Review saved records before clearing recovery.',
    );
  const operation = JSON.parse(value) as ScannerOperation;
  if (
    operation.version !== 1 ||
    operation.instanceUrl !== instanceUrl ||
    operation.actor?.userId !== userId ||
    typeof operation.actor.profileId !== 'string' ||
    !operation.operationId ||
    !operation.body ||
    typeof operation.body !== 'object' ||
    !/^\/api\/v1\/(pantry\/(batches|catalog-imports)|shopping-lists\/[^/]+\/catalog-items)$/.test(
      operation.path,
    )
  )
    throw new Error('This saved confirmation does not belong to the connected account.');
  if (
    operation.body.operationId !== undefined &&
    operation.body.operationId !== operation.operationId
  )
    throw new Error('The saved operation identity does not match.');
  return operation;
}
/** Write-ahead record. The manifest commits only after all encrypted chunks are stored. */
export function scannerRecovery(
  storage: RecoveryStorage,
  key: string,
  instanceUrl: string,
  userId: string,
): ScannerJournal {
  const read = async () => {
    const manifest = await storage.getItem(key);
    if (!manifest) return null;
    const count = Number(manifest);
    if (!Number.isInteger(count) || count < 1 || count > 32)
      throw new Error(
        'Saved confirmation recovery is incomplete. Review saved records before another scan.',
      );
    let value = '';
    for (let index = 0; index < count; index++) {
      const chunk = await storage.getItem(`${key}.${index}`);
      if (chunk === null)
        throw new Error(
          'Saved confirmation recovery is incomplete. Review saved records before another scan.',
        );
      value += chunk;
    }
    return parseScannerOperation(value, instanceUrl, userId);
  };
  return {
    read,
    async closedUnknown() {
      const raw = await storage.getItem(`${key}.closed`);
      const ids = raw ? (JSON.parse(raw) as string[]) : [];
      if (!Array.isArray(ids) || ids.length > 50 || ids.some((id) => typeof id !== 'string'))
        throw new Error('Closed confirmation history could not be read.');
      return Promise.all(
        ids.map(async (id) => {
          const operation = await scannerRecovery(
            storage,
            `${key}.closed.${id}`,
            instanceUrl,
            userId,
          ).read();
          if (!operation) throw new Error('Closed confirmation history is incomplete.');
          return operation;
        }),
      );
    },
    async archiveUnknown(operationId: string) {
      const operation = await read();
      if (!operation || operation.operationId !== operationId) return;
      const raw = await storage.getItem(`${key}.closed`);
      const ids = raw ? (JSON.parse(raw) as string[]) : [];
      if (!Array.isArray(ids) || (ids.length >= 50 && !ids.includes(operationId)))
        throw new Error(
          'Closed confirmation history is full. Keep this recovery record until reviewed.',
        );
      await scannerRecovery(storage, `${key}.closed.${operationId}`, instanceUrl, userId).write(
        operation,
      );
      if (!ids.includes(operationId))
        await storage.setItem(`${key}.closed`, JSON.stringify([...ids, operationId]));
      if (!(await storage.getItem(`${key}.closed`))?.includes(operationId))
        throw new Error('The original confirmation could not be retained.');
      // The caller must acknowledge only after the server blocks future execution.
    },
    async write(operation: ScannerOperation) {
      const serialized = JSON.stringify(operation);
      parseScannerOperation(serialized, instanceUrl, userId);
      const existing = await read();
      if (existing) {
        if (JSON.stringify(existing) !== serialized)
          throw new Error('Reconcile the previous confirmation before starting another.');
        return;
      }
      const chunks = serialized.match(/[\s\S]{1,750}/g)!;
      for (const [index, chunk] of chunks.entries())
        await storage.setItem(`${key}.${index}`, chunk);
      await storage.setItem(key, String(chunks.length));
      // Read back before the first HTTP write. A failed local journal cannot create an uncertain remote write.
      if (JSON.stringify(await read()) !== serialized)
        throw new Error('The confirmation could not be saved securely on this device.');
    },
    async acknowledge(operationId: string) {
      const operation = await read();
      if (!operation || operation.operationId !== operationId) return;
      const count = Number(await storage.getItem(key));
      await storage.removeItem(key);
      for (let index = 0; index < count; index++) await storage.removeItem(`${key}.${index}`);
    },
  };
}
