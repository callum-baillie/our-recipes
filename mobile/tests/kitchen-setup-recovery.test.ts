import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
const values = vi.hoisted(() => new Map<string, string>());
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => values.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    values.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    values.delete(key);
  },
}));
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'sha256' },
  digestStringAsync: async (_algorithm: string, value: string) =>
    createHash('sha256').update(value).digest('hex'),
}));
import { readKitchenSetupStep, writeKitchenSetupStep } from '../src/data/kitchen-recovery';
const scope = {
  instanceUrl: 'https://kitchen.example.test',
  userId: 'private-account',
  profileId: 'private-profile',
  kitchenId: 'private-kitchen',
};
beforeEach(() => values.clear());
it('resumes optional setup only in the original account/profile/kitchen/instance scope', async () => {
  expect(await readKitchenSetupStep(scope)).toBe(0);
  await writeKitchenSetupStep(scope, 2);
  expect(await readKitchenSetupStep({ ...scope })).toBe(2);
  for (const field of ['instanceUrl', 'userId', 'profileId', 'kitchenId'] as const)
    expect(await readKitchenSetupStep({ ...scope, [field]: 'another-owner' })).toBe(0);
  expect([...values.keys()].join('')).not.toMatch(/private-|example.test/);
  await expect(writeKitchenSetupStep(scope, 4)).rejects.toThrow('Invalid setup step.');
  expect(await readKitchenSetupStep(scope)).toBe(2);
});
