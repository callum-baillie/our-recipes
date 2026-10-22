import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { AiJobCard } from '@/components/ai-job-card';
import { UNKNOWN_AI_OUTCOMES } from '../../shared/mobile-domain/ai-job-outcome';

describe('unknown background image outcomes', () => {
  it.each(UNKNOWN_AI_OUTCOMES)(
    'explains %s and does not offer a paid duplicate retry',
    (errorCode) => {
      const html = renderToStaticMarkup(
        createElement(AiJobCard, {
          job: {
            id: 'synthetic',
            kind: 'recipe_images',
            title: 'Soup preview',
            status: 'failed',
            executionMode: 'direct',
            actionId: null,
            totalItems: 1,
            completedItems: 0,
            failedItems: 1,
            errorCode,
          },
          onCommand: vi.fn(),
        }),
      );
      expect(html).toContain('provider outcome is unknown');
      expect(html).not.toContain('Retry unfinished items');
    },
  );
});
