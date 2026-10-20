import { describe, expect, it } from 'vitest';
import {
  chatRecovery,
  matchesChatOperation,
  type ChatOperationReference,
} from '../../shared/mobile-domain/chat-recovery';
import { reviewedTurnOutcome } from '../../shared/mobile-domain/chat-stream';
import type { RecoveryStorage } from '../../shared/mobile-domain/scanner-recovery';

const reference: ChatOperationReference = {
  version: 1,
  instanceUrl: 'https://kitchen.example',
  actor: { userId: 'account', profileId: 'person' },
  threadId: 'thread',
  operationId: 'original',
  createdAt: '2026-10-20T00:00:00Z',
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
describe('native chat restart recovery', () => {
  it('restores only an exact account/instance-bound server reference after restart', async () => {
    const { storage, values } = memory();
    await chatRecovery(storage, 'journal', reference.instanceUrl, 'account').write(reference);
    expect(await chatRecovery(storage, 'journal', reference.instanceUrl, 'account').read()).toEqual(
      reference,
    );
    expect(Object.keys(JSON.parse(values.get('journal')!)).sort()).toEqual([
      'actor',
      'createdAt',
      'instanceUrl',
      'operationId',
      'threadId',
      'version',
    ]);
    await expect(
      chatRecovery(storage, 'journal', reference.instanceUrl, 'other').read(),
    ).rejects.toThrow('account');
    await expect(
      chatRecovery(storage, 'journal', 'https://other.example', 'account').read(),
    ).rejects.toThrow('account');
  });
  it('rejects prompt, image, credential and changed operation data rather than persisting private payloads', async () => {
    const { storage } = memory();
    const journal = chatRecovery(storage, 'journal', reference.instanceUrl, 'account');
    for (const field of ['message', 'images', 'attachments', 'password']) {
      await expect(
        journal.write({ ...reference, [field]: 'private' } as ChatOperationReference),
      ).rejects.toThrow();
    }
    await journal.write(reference);
    await expect(journal.write({ ...reference, operationId: 'new' })).rejects.toThrow('previous');
    await journal.acknowledge('unrelated');
    expect(await journal.read()).toEqual(reference);
    await journal.acknowledge('original');
    expect(await journal.read()).toBeNull();
  });
  it('requires local durable storage before allowing a caller to send', async () => {
    const { storage } = memory();
    const journal = chatRecovery(
      {
        ...storage,
        async setItem() {
          throw new Error('locked storage');
        },
      },
      'journal',
      reference.instanceUrl,
      'account',
    );
    await expect(journal.write(reference)).rejects.toThrow('locked storage');
    expect(await journal.read()).toBeNull();
  });
  it('does not treat an absent/running/unknown operation as completion or permission to resubmit', () => {
    expect(reviewedTurnOutcome([], 'original')).toMatchObject({ blocked: true, terminal: null });
    expect(reviewedTurnOutcome([{ id: 'original', status: 'running' }], 'original')).toMatchObject({
      blocked: true,
      terminal: null,
    });
    expect(
      reviewedTurnOutcome(
        [{ id: 'original', status: 'outcome_unknown', reviewed: false }],
        'original',
      ),
    ).toMatchObject({ blocked: true, terminal: null });
    expect(
      reviewedTurnOutcome([{ id: 'original', status: 'completed' }], 'original'),
    ).toMatchObject({ blocked: false, terminal: 'completed' });
    // Explicit review is distinct from completed: the UI clears only the acknowledged reference.
    expect(
      reviewedTurnOutcome([{ id: 'original', status: 'outcome_unknown', reviewed: true }]),
    ).toMatchObject({ blocked: false, terminal: null });
  });
});

it('a draft from another thread or operation cannot reuse the pending recovery reference', () => {
  const input = {
    instanceUrl: reference.instanceUrl,
    actor: reference.actor,
    threadId: reference.threadId,
    operationId: reference.operationId,
  };
  expect(matchesChatOperation(reference, input)).toBe(true);
  expect(matchesChatOperation(reference, { ...input, operationId: 'new-operation' })).toBe(false);
  expect(matchesChatOperation(reference, { ...input, threadId: 'other-thread' })).toBe(false);
  expect(
    matchesChatOperation(reference, {
      ...input,
      actor: { ...reference.actor, profileId: 'other-person' },
    }),
  ).toBe(false);
});
