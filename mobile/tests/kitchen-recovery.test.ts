import { expect, it } from 'vitest';
import {
  kitchenCommandRecovery,
  parseKitchenDraft,
  type KitchenDraftScope,
  type KitchenPendingCommand,
} from '../../shared/mobile-domain/kitchen-recovery';
import type { RecoveryStorage } from '../../shared/mobile-domain/scanner-recovery';
const scope: KitchenDraftScope = {
  instanceUrl: 'https://bord.example',
  userId: 'account',
  profileId: '73caeb13-c408-4326-b757-a4553b8f02e7',
  kitchenId: '27d11384-0713-463c-a50a-9dd6e800cd07',
};
const operationId = '0f25e195-c8c9-4a35-ab1c-72169143d2a3';
const body = {
  kind: 'add',
  operationId,
  expectedRevision: 3,
  count: 2,
  item: { typeKey: 'saucepan', name: '鍋🍲'.repeat(40), model: '器'.repeat(100) },
};
const command: KitchenPendingCommand = {
  version: 1,
  scope,
  operationId,
  body: JSON.stringify(body),
  createdAt: '2026-10-22T12:00:00Z',
};
function memory() {
  const values = new Map<string, string>();
  const storage: RecoveryStorage = {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
  };
  return { storage, values };
}
it('K28 restores the exact reviewed command after restart, with bounded Unicode-safe encrypted chunks', async () => {
  const { storage, values } = memory();
  await kitchenCommandRecovery(storage, 'kitchen', scope).write(command);
  for (const [key, value] of values)
    if (key !== 'kitchen')
      expect(new TextEncoder().encode(value).byteLength).toBeLessThanOrEqual(1000);
  expect(await kitchenCommandRecovery(storage, 'kitchen', scope).read()).toEqual(command);
  await expect(
    kitchenCommandRecovery(storage, 'kitchen', scope).write({
      ...command,
      body: JSON.stringify({ ...body, count: 3 }),
    }),
  ).rejects.toThrow(/previous kitchen change/);
  await expect(
    kitchenCommandRecovery(storage, 'kitchen', scope).discardUnreadableAfterReview(),
  ).rejects.toThrow(/acknowledged recovery/);
  await kitchenCommandRecovery(storage, 'kitchen', scope).acknowledge(operationId);
  expect(await kitchenCommandRecovery(storage, 'kitchen', scope).read()).toBeNull();
  expect(values.size).toBe(0);
});
it('K28 refuses another actor, profile, kitchen or instance and never attaches new revisions to a stale draft', async () => {
  const { storage } = memory();
  await kitchenCommandRecovery(storage, 'key', scope).write(command);
  for (const field of ['instanceUrl', 'userId', 'profileId', 'kitchenId'] as const)
    await expect(
      kitchenCommandRecovery(storage, 'key', { ...scope, [field]: 'another' }).read(),
    ).rejects.toThrow(/another account/);
  const draft = {
    version: 1,
    scope,
    item: body.item,
    itemId: null,
    itemRevision: null,
    kitchenRevision: 3,
    count: '2',
  };
  expect(parseKitchenDraft(JSON.stringify(draft), scope).kitchenRevision).toBe(3);
  expect(() =>
    parseKitchenDraft(JSON.stringify(draft), { ...scope, profileId: 'another' }),
  ).toThrow(/another account/);
  expect(() =>
    parseKitchenDraft(
      JSON.stringify({ ...draft, item: { ...body.item, credentials: 'excluded' } }),
      scope,
    ),
  ).toThrow(/equipment fields/);
});
it('K28 a failed write-ahead record prevents HTTP and unreadable recovery needs explicit local acknowledgement', async () => {
  const { storage, values } = memory();
  let http = 0;
  storage.setItem = async (key, value) => {
    if (key === 'key') throw new Error('device storage unavailable');
    values.set(key, value);
  };
  await expect(
    (async () => {
      await kitchenCommandRecovery(storage, 'key', scope).write(command);
      http++;
    })(),
  ).rejects.toThrow(/storage unavailable/);
  expect(http).toBe(0);
  values.set('key', '1');
  values.delete('key.0');
  const journal = kitchenCommandRecovery(storage, 'key', scope);
  await expect(journal.read()).rejects.toThrow(/incomplete/);
  await journal.discardUnreadableAfterReview();
  expect(await journal.read()).toBeNull();
  expect(values.size).toBe(0);
});
