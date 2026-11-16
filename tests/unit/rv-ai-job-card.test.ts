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

describe('batch background tasks', () => {
  const job = (executionMode: 'direct' | 'batch', status = 'running') => ({
    id: 'synthetic-batch',
    kind: 'recipe_images',
    title: 'Plan photos',
    status,
    executionMode,
    actionId: null,
    totalItems: 3,
    completedItems: 0,
    failedItems: 0,
  });

  it('tells the person a running batch can take a while and that they can check back later', () => {
    const html = renderToStaticMarkup(createElement(AiJobCard, { job: job('batch') }));
    expect(html).toContain('Batch process');
    expect(html).toContain('batch process and may take a while');
    expect(html).toContain('check back later');
  });

  it('does not call a direct task or a finished batch a long wait', () => {
    expect(renderToStaticMarkup(createElement(AiJobCard, { job: job('direct') }))).not.toContain(
      'may take a while',
    );
    expect(
      renderToStaticMarkup(createElement(AiJobCard, { job: job('batch', 'succeeded') })),
    ).not.toContain('may take a while');
  });
});
