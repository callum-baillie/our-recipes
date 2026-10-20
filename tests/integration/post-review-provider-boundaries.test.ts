import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
const mock = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock('openai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('openai')>();
  return {
    ...actual,
    default: class {
      responses = { parse: mock.parse };
    },
  };
});
import { getDatabase, resetDatabaseForTests } from '@/lib/db/client';
import { aiRuntimeSettings, aiExecutionTraces, aiDecisionRecords } from '@/lib/db/schema';
import { aiRuntimeSchema } from '@/lib/domain/ai-runtime-settings';
import { completeSetup } from '@/lib/services/household-service';
import { suggestStoreMap } from '@/lib/services/store-map-service';
import { withAiExecutionContext } from '@/lib/services/ai-execution-context';
import type { RequestPrincipal } from '@/lib/services/auth-service';
let principal: RequestPrincipal;
const map = {
  departments: [],
  entrances: [
    {
      id: 'entrance-a',
      label: 'Front entrance',
      x: 0.5,
      y: 1,
      evidence: 'Synthetic arrow',
      kind: 'general',
    },
  ],
  suggestedOrder: [],
  warnings: [],
};
beforeEach(() => {
  vi.stubEnv('DATABASE_URL', ':memory:');
  vi.stubEnv('DATA_DIR', '.test-data/post-review-provider');
  vi.stubEnv('OPENAI_API_KEY', 'dummy-synthetic-key-never-sent');
  resetDatabaseForTests();
  const id = completeSetup({
    householdName: 'Synthetic map fixture',
    appName: 'Bòrd',
    profile: {
      displayName: 'Alex',
      color: '#637A45',
      avatarUrl: '',
      units: 'metric',
      temperatureUnit: 'C',
      locale: 'en-GB',
      timezone: 'UTC',
    },
  }).profiles[0]!.id;
  principal = {
    kind: 'session',
    userId: 'fixture-user',
    profileId: id,
    linkedProfileId: id,
    role: 'admin',
    accountRole: 'admin',
    activeProfileRole: 'admin',
    sessionId: 'fixture',
    apiKeyId: null,
  };
  getDatabase()
    .insert(aiRuntimeSettings)
    .values({
      id: 'global',
      settings: JSON.stringify(
        aiRuntimeSchema.parse({
          maxOutputTokens: 512,
          requestTimeoutSeconds: 15,
          generationsPerTenMinutes: 100,
        }),
      ),
      version: 1,
    })
    .run();
  mock.parse.mockReset();
  mock.parse.mockResolvedValue({ output_parsed: map });
});
afterEach(() => {
  resetDatabaseForTests();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function input() {
  return {
    imageBase64: (
      await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } })
        .png()
        .toBuffer()
    ).toString('base64'),
    mimeType: 'image/png' as const,
    preset: 'map_order' as const,
    notes: 'Synthetic entrance',
    allowPaidCall: true,
  };
}
describe('provider boundaries outside chat', () => {
  it('caps actual map Responses input and traces supported Decisions fields without inventing token support', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        answers: [
          {
            type: 'choice',
            name: 'entrance',
            choice: 'unknown',
            confidence: 0.5,
            probabilities: [{ value: 'unknown', probability: 0.5 }],
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const abort = new AbortController();
    const result = await withAiExecutionContext({ signal: abort.signal }, async () =>
      suggestStoreMap(principal, await input()),
    );
    expect(result.entranceId).toBe('unknown');
    expect(mock.parse.mock.calls[0]![0]).toMatchObject({ max_output_tokens: 512 });
    expect(mock.parse.mock.calls[0]![1]).toMatchObject({
      maxRetries: 0,
      signal: expect.any(AbortSignal),
    });
    expect(mock.parse.mock.calls[0]![1].timeout).toBeLessThanOrEqual(15000);
    expect(fetch).toHaveBeenCalledOnce();
    const submitted = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
    expect(submitted.model).toBe('gpt-6-luna');
    expect(submitted).not.toHaveProperty('max_output_tokens');
    expect(submitted).not.toHaveProperty('reasoning');
    const traces = getDatabase().select().from(aiExecutionTraces).all();
    expect(traces).toHaveLength(2);
    expect(JSON.parse(traces[1]!.optionsJson)).toMatchObject({
      providerEndpoint: 'decisions',
      maxOutputTokens: null,
      outputContract: 'bounded choices; token cap unsupported',
    });
    expect(JSON.stringify(traces)).not.toContain('Synthetic entrance');
  });
  it('does not classify or save a map after cancellation during extraction', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const abort = new AbortController();
    let release!: () => void;
    mock.parse.mockImplementationOnce(async () => {
      await new Promise<void>((r) => {
        release = r;
      });
      return { output_parsed: map };
    });
    const request = withAiExecutionContext({ signal: abort.signal }, async () =>
      suggestStoreMap(principal, await input()),
    );
    await vi.waitFor(() => expect(mock.parse).toHaveBeenCalledOnce());
    abort.abort();
    release();
    await expect(request).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    expect(getDatabase().select().from(aiDecisionRecords).all()).toHaveLength(0);
  });
});
