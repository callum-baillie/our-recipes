import { aiConnectionStatusSchema, type AiConnectionStatus } from '@/lib/domain/ai';
import {
  OpenAiProvider,
  UnconfiguredAiProvider,
  type AiProvider,
} from '@/lib/providers/ai-provider';
import { getOpenAiApiKey } from '@/lib/providers/openai-key';

const unconfiguredStatus = aiConnectionStatusSchema.parse({
  provider: 'OpenAI',
  state: 'unconfigured',
  enabled: false,
  message:
    'OpenAI is not configured. Add a server-side key before any household action can use it.',
  supportedOperationKinds: [
    'text-normalization',
    'vision-extraction',
    'image-generation',
    'nutrition-estimation',
    'recipe-improvement',
  ],
});

let providerForTests: AiProvider | null = null;

export function getAiReadiness(): AiConnectionStatus {
  if (providerForTests) return providerForTests.getStatus();
  return getOpenAiApiKey()
    ? aiConnectionStatusSchema.parse({
        provider: 'OpenAI',
        state: 'configured',
        enabled: true,
        message:
          'OpenAI is configured. Every review and generated image requires an explicit household action.',
        supportedOperationKinds: [
          'text-normalization',
          'vision-extraction',
          'image-generation',
          'nutrition-estimation',
          'recipe-improvement',
        ],
      })
    : unconfiguredStatus;
}

export function getAiProvider(): AiProvider {
  if (providerForTests) return providerForTests;
  const apiKey = getOpenAiApiKey();
  return apiKey ? new OpenAiProvider(apiKey) : new UnconfiguredAiProvider(getAiReadiness());
}

export function setAiProviderForTests(provider: AiProvider | null): void {
  providerForTests = provider;
}
