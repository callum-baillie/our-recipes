import type { RecoveryStorage } from './scanner-recovery';
export type KitchenDraftScope = {
  instanceUrl: string;
  userId: string;
  profileId: string;
  kitchenId: string;
};
export type KitchenDraft = {
  version: 1;
  scope: KitchenDraftScope;
  item: Record<string, unknown>;
  itemId: string | null;
  itemRevision: number | null;
  kitchenRevision: number;
  count: string;
};
export type KitchenPendingCommand = {
  version: 1;
  scope: KitchenDraftScope;
  operationId: string;
  body: string;
  createdAt: string;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fields = new Set([
  'typeKey',
  'name',
  'make',
  'model',
  'capabilities',
  'measurements',
  'availability',
  'material',
  'induction',
  'ovenSafe',
  'ovenMaxC',
  'lid',
  'parentId',
  'independentZones',
  'independentZonesConfirmed',
  'sharedResourceKeys',
]);
export function sameKitchenDraftScope(a: KitchenDraftScope, b: KitchenDraftScope) {
  return (
    a.instanceUrl === b.instanceUrl &&
    a.userId === b.userId &&
    a.profileId === b.profileId &&
    a.kitchenId === b.kitchenId
  );
}
function scoped(value: { version: number; scope: KitchenDraftScope }, scope: KitchenDraftScope) {
  if (
    !value ||
    typeof value !== 'object' ||
    value.version !== 1 ||
    !value.scope ||
    !sameKitchenDraftScope(value.scope, scope) ||
    Object.keys(value.scope).some(
      (key) => !['instanceUrl', 'userId', 'profileId', 'kitchenId'].includes(key),
    )
  )
    throw new Error(
      'This kitchen draft or command belongs to another account, profile, kitchen or instance.',
    );
}
function item(value: unknown) {
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== 'object' ||
    Object.keys(value).some((key) => !fields.has(key))
  )
    throw new Error('The saved equipment fields are invalid.');
}
export function parseKitchenDraft(raw: string, scope: KitchenDraftScope): KitchenDraft {
  if (raw.length > 24000) throw new Error('The saved kitchen draft is too large.');
  const value = JSON.parse(raw) as KitchenDraft;
  scoped(value, scope);
  if (
    Object.keys(value).some(
      (key) =>
        ![
          'version',
          'scope',
          'item',
          'itemId',
          'itemRevision',
          'kitchenRevision',
          'count',
        ].includes(key),
    )
  )
    throw new Error('Unexpected saved kitchen draft fields.');
  item(value.item);
  if (
    !Number.isInteger(value.kitchenRevision) ||
    value.kitchenRevision < 0 ||
    typeof value.count !== 'string' ||
    value.count.length > 8 ||
    (value.itemId !== null &&
      (!uuid.test(value.itemId) ||
        !Number.isInteger(value.itemRevision) ||
        value.itemRevision! < 1))
  )
    throw new Error('The saved kitchen draft needs a fresh review.');
  return value;
}
export function parseKitchenPending(raw: string, scope: KitchenDraftScope): KitchenPendingCommand {
  if (raw.length > 24000) throw new Error('The saved kitchen command is too large.');
  const value = JSON.parse(raw) as KitchenPendingCommand;
  scoped(value, scope);
  if (
    Object.keys(value).some(
      (key) => !['version', 'scope', 'operationId', 'body', 'createdAt'].includes(key),
    )
  )
    throw new Error('Unexpected saved kitchen command fields.');

  if (
    !uuid.test(value.operationId) ||
    typeof value.body !== 'string' ||
    !Number.isFinite(Date.parse(value.createdAt))
  )
    throw new Error('The saved kitchen command identity is invalid.');
  const body = JSON.parse(value.body);
  if (
    !body ||
    body.operationId !== value.operationId ||
    !Number.isInteger(body.expectedRevision) ||
    body.expectedRevision < 0 ||
    !['add', 'update'].includes(body.kind)
  )
    throw new Error('The saved equipment command does not match its reviewed intent.');
  item(body.item);
  const allowed =
    body.kind === 'add'
      ? ['kind', 'operationId', 'expectedRevision', 'count', 'item']
      : ['kind', 'operationId', 'expectedRevision', 'itemId', 'expectedItemRevision', 'item'];
  if (Object.keys(body).some((key) => !allowed.includes(key)))
    throw new Error('Unexpected saved equipment command fields.');
  if (body.kind === 'add' && (!Number.isInteger(body.count) || body.count < 1 || body.count > 20))
    throw new Error('The saved equipment quantity is invalid.');
  if (
    body.kind === 'update' &&
    (!uuid.test(body.itemId) ||
      !Number.isInteger(body.expectedItemRevision) ||
      body.expectedItemRevision < 1)
  )
    throw new Error('The saved equipment target is invalid.');
  return value;
}
/** Fixed inventory commands only. Persist and read back before HTTP; never automatically replay. */
export function kitchenCommandRecovery(
  storage: RecoveryStorage,
  key: string,
  scope: KitchenDraftScope,
) {
  const read = async () => {
    const manifest = await storage.getItem(key);
    if (manifest === null) return null;
    const count = Number(manifest);
    if (!Number.isInteger(count) || count < 1 || count > 32)
      throw new Error(
        'Kitchen command recovery is incomplete. Review inventory before discarding it.',
      );
    let raw = '';
    for (let i = 0; i < count; i++) {
      const chunk = await storage.getItem(`${key}.${i}`);
      if (chunk === null)
        throw new Error(
          'Kitchen command recovery is incomplete. Review inventory before discarding it.',
        );
      raw += chunk;
    }
    return parseKitchenPending(raw, scope);
  };
  return {
    read,
    async write(command: KitchenPendingCommand) {
      const raw = JSON.stringify(command);
      parseKitchenPending(raw, scope);
      const prior = await read();
      if (prior) {
        if (JSON.stringify(prior) !== raw)
          throw new Error('Recover the previous kitchen change before starting another.');
        return;
      }
      const chunks: string[] = [];
      let chunk = '',
        bytes = 0;
      for (const char of raw) {
        const point = char.codePointAt(0)!;
        const size = point < 128 ? 1 : point < 2048 ? 2 : point < 65536 ? 3 : 4;
        if (bytes + size > 1000) {
          chunks.push(chunk);
          chunk = '';
          bytes = 0;
        }
        chunk += char;
        bytes += size;
      }
      if (chunk) chunks.push(chunk);
      if (chunks.length > 32)
        throw new Error(
          'This kitchen confirmation is too large for secure recovery. Reduce the draft before saving.',
        );
      for (const [i, chunk] of chunks.entries()) await storage.setItem(`${key}.${i}`, chunk);
      await storage.setItem(key, String(chunks.length));
      if (JSON.stringify(await read()) !== raw)
        throw new Error(
          'The kitchen command could not be stored securely. No HTTP write was started.',
        );
    },
    async discardUnreadableAfterReview() {
      try {
        if (await read())
          throw new Error('Use acknowledged recovery for a readable pending command.');
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Use acknowledged')) throw error;
        await storage.removeItem(key);
        for (let i = 0; i < 32; i++) await storage.removeItem(`${key}.${i}`);
      }
    },
    async acknowledge(operationId: string) {
      const command = await read();
      if (!command || command.operationId !== operationId) return;
      const count = Number(await storage.getItem(key));
      await storage.removeItem(key);
      for (let i = 0; i < count; i++) await storage.removeItem(`${key}.${i}`);
    },
  };
}
