// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AiAppActionCard } from '@/components/ai-app-action-card';
import type { AppActionReview } from '@/lib/services/ai-app-action-service';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);
const actions = Array.from({ length: 10 }, (_, index) => ({
  summary: 'Generate recipe image',
  method: 'POST',
  path: '/api/v1/recipes/{recipeId}/images/generate',
  parameters: { recipeId: `recipe-${index}` },
  body: {},
}));
it('distinguishes completed, failed and unattempted older actions and exposes both disclosures', () => {
  render(
    createElement(AiAppActionCard, {
      proposal: {
        id: 'proposal',
        version: 1,
        title: 'Recipe images',
        actions,
        status: 'partial',
        results: [
          { summary: 'First', ok: true, message: 'Saved.' },
          { summary: 'Second', ok: true, message: 'Saved.' },
          { summary: 'Third', ok: false, message: 'Rejected.' },
        ],
      } satisfies AppActionReview,
    }),
  );
  expect(screen.getByText(/2 completed · 1 failed · 7 not attempted/)).toBeTruthy();
  expect(screen.getByText('Show 6 more recipes')).toBeTruthy();
  expect(screen.getByText('View results (3)')).toBeTruthy();
  expect(screen.getAllByText('Recipe title unavailable in this saved proposal.')).toHaveLength(10);
});
it('retains fresh recipe labels and does not classify waiting or cancelled job items as failures', () => {
  render(
    createElement(AiAppActionCard, {
      proposal: {
        id: 'proposal',
        version: 1,
        title: 'Recipe images',
        actions: [
          { ...actions[0], recordLabel: 'Tomato soup', changeLabel: 'Create image' },
          actions[1],
          actions[2],
        ],
        status: 'partial',
        results: [
          { summary: 'Soup', ok: true, message: 'Saved.', state: 'completed' },
          { summary: 'Salad', ok: false, message: 'Waiting.', state: 'pending' },
          { summary: 'Pasta', ok: false, message: 'Cancelled.', state: 'not-attempted' },
        ],
      } satisfies AppActionReview,
    }),
  );
  expect(screen.getByText(/1 completed · 0 failed · 1 not attempted · 1 waiting/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Tomato soup' }).getAttribute('href')).toBe(
    '/recipes/recipe-0',
  );
  expect(screen.getByText('Create image')).toBeTruthy();
});
it('renders the authoritative named meal and context for a bodyless removal without raw IDs or empty values', () => {
  render(
    createElement(AiAppActionCard, {
      proposal: {
        id: 'review',
        version: 1,
        title: 'Model description only',
        status: 'pending',
        actions: [
          {
            summary: 'Remove meal',
            method: 'DELETE',
            path: '/meal-plan/{entryId}',
            parameters: { entryId: 'hidden-record-id' },
            body: null,
            review: {
              schemaVersion: 1,
              subject: { kind: 'Meal', label: 'Friday lentil supper', href: '/planner' },
              effect: 'Remove meal',
              context: [
                { label: 'Date', value: '2026-10-23' },
                { label: 'Meal', value: 'Dinner' },
                { label: 'Servings', value: '4' },
              ],
              changes: [],
              caveats: [],
            },
          },
        ],
      },
    }),
  );
  expect(screen.getByRole('link', { name: 'Friday lentil supper' }).getAttribute('href')).toBe(
    '/planner',
  );
  expect(screen.getByText('2026-10-23')).toBeTruthy();
  expect(screen.getByText('Dinner')).toBeTruthy();
  expect(screen.getByText('4')).toBeTruthy();
  expect(screen.queryByText(/Not set|hidden-record-id/)).toBeNull();
});
