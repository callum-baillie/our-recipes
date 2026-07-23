import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const imageProps = { ...props };
    delete imageProps.fill;
    delete imageProps.unoptimized;
    return createElement('img', imageProps);
  },
}));

import { AiActionCard } from '@/components/ai-action-card';

describe('AI action cards', () => {
  it('renders a recipe proposal as a styled review card without raw JSON', () => {
    const markup = renderToStaticMarkup(
      createElement(AiActionCard, {
        busy: false,
        onDecide: vi.fn(),
        action: {
          id: 'proposal-1',
          kind: 'recipe_create',
          status: 'pending',
          preview: {
            operation: 'create recipe',
            image: { status: 'ready', altText: 'Cauliflower mac and cheese' },
            recipe: {
              title: 'Cauliflower-Forward Mac and Cheese',
              summary: 'Roasted cauliflower in a creamy cheese sauce.',
              servings: '6 servings',
              prepMinutes: 20,
              cookMinutes: 35,
              restMinutes: 0,
              difficulty: 'Easy',
              nutritionCalories: 300,
              nutritionProteinGrams: 15,
              nutritionFiberGrams: 4,
              ingredientGroups: [
                {
                  name: 'Main',
                  ingredients: [
                    { quantity: 1, unit: 'head', item: 'cauliflower', note: 'cut into florets' },
                    { quantity: 200, unit: 'g', item: 'cheddar', note: 'grated' },
                  ],
                },
              ],
            },
          },
        },
      }),
    );

    expect(markup).toContain('Cauliflower-Forward Mac and Cheese');
    expect(markup).toContain('1 head cauliflower, cut into florets');
    expect(markup).toContain('300<small>kcal</small>');
    expect(markup).toContain('Add to My Recipes');
    expect(markup).toContain('Cancel');
    expect(markup).not.toContain('&quot;operation&quot;');
    expect(markup).not.toContain('<pre');
  });

  it('shows a specific loading state while a recipe is being added', () => {
    const markup = renderToStaticMarkup(
      createElement(AiActionCard, {
        busy: true,
        pendingDecision: 'confirm',
        onDecide: vi.fn(),
        action: {
          id: 'proposal-2',
          kind: 'recipe_create',
          status: 'pending',
          preview: {
            operation: 'create recipe',
            image: { status: 'unavailable' },
            recipe: {
              title: 'Quick bowl',
              summary: '',
              servings: '2 servings',
              prepMinutes: 5,
              cookMinutes: 10,
              ingredientGroups: [
                { name: '', ingredients: [{ quantity: 1, unit: 'can', item: 'beans', note: '' }] },
              ],
            },
          },
        },
      }),
    );

    expect(markup).toContain('Adding recipe…');
    expect(markup).toContain('disabled');
  });
});
