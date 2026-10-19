import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  cached: vi.fn(),
  setting: vi.fn(() => ({ enabled: true, model: 'fixture-model' })),
  key: vi.fn(() => {
    throw new Error('Live provider must not be reached');
  }),
}));
vi.mock('@/lib/services/ai-settings-service', () => ({ getAiWorkloadSetting: mocks.setting }));
vi.mock('@/lib/providers/openai-key', () => ({ getOpenAiApiKey: mocks.key }));
vi.mock('@/lib/services/decision-cache-service', () => ({
  decisionHash: () => 'fixture-hash',
  findDecision: mocks.cached,
  singleDecisionRun: (_: string, run: () => Promise<unknown>) => run(),
  enforceDecisionBudget: vi.fn(),
  storeDecision: vi.fn(),
  ownedDecision: vi.fn(),
  saveDecisionCorrection: vi.fn(),
}));
import { suggestStoreMap } from '@/lib/services/store-map-service';
import type { RequestPrincipal } from '@/lib/services/auth-service';
const principal = { userId: 'fixture-user', profileId: 'fixture-person' } as RequestPrincipal;
const result = {
  map: { departments: [], entrances: [], suggestedOrder: [], warnings: [] },
  entranceId: 'manual',
  preset: 'map_order',
  order: [],
  notes: '',
  entranceConfirmed: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.setting.mockReturnValue({ enabled: true, model: 'fixture-model' });
  mocks.cached.mockReturnValue(undefined);
});
async function input() {
  return {
    imageBase64: (
      await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } })
        .png()
        .toBuffer()
    ).toString('base64'),
    mimeType: 'image/png' as const,
    notes: '',
    preset: 'map_order' as const,
    allowPaidCall: false,
  };
}
describe('map review consent boundary', () => {
  it('reuses an eligible cached review without paid consent', async () => {
    mocks.cached.mockReturnValue({
      id: 'cached-fixture',
      version: 2,
      resultJson: JSON.stringify(result),
      correctionJson: null,
    });
    expect(await suggestStoreMap(principal, await input())).toMatchObject({
      id: 'cached-fixture',
      cached: true,
      version: 2,
    });
    expect(mocks.key).not.toHaveBeenCalled();
  });
  it('rejects a cache miss without paid consent before reading provider credentials', async () => {
    await expect(suggestStoreMap(principal, await input())).rejects.toThrow('paid image analysis');
    expect(mocks.key).not.toHaveBeenCalled();
  });
  it('honours the workload gate before cache reuse', async () => {
    mocks.setting.mockReturnValue({ enabled: false, model: 'fixture-model' });
    await expect(suggestStoreMap(principal, await input())).rejects.toThrow('disabled');
    expect(mocks.cached).not.toHaveBeenCalled();
    expect(mocks.key).not.toHaveBeenCalled();
  });
});
