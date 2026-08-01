import { describe, expect, it } from 'vitest';

import { aiSummaryBundleOutputSchema } from '@/lib/domain/ai-assistant';

describe('AI summary bundle schema', () => {
  it('accepts compact domain summaries and structured metrics', () => {
    const result = aiSummaryBundleOutputSchema.parse({
      summaries: [
        {
          domain: 'nutrition',
          headline: 'Protein has been steady',
          summary: 'Recorded days are close to the configured protein target.',
          highlights: ['Three comparable days were available.'],
          metrics: [
            {
              label: 'Average protein',
              value: '96 g',
              context: 'Across recorded days',
              trend: 'steady',
            },
          ],
          caveats: ['Two meals contain estimated values.'],
        },
      ],
    });

    expect(result.summaries[0]?.metrics[0]?.value).toBe('96 g');
  });

  it('rejects duplicate domains in one provider response', () => {
    const item = {
      domain: 'recipes',
      headline: 'A varied recipebook',
      summary: 'The library includes several weeknight options.',
      highlights: [],
      metrics: [],
      caveats: [],
    };

    expect(() => aiSummaryBundleOutputSchema.parse({ summaries: [item, item] })).toThrowError(
      /domain may appear only once/i,
    );
  });
});
