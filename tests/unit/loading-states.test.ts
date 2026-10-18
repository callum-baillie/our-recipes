import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  PageSkeleton,
  type PageSkeletonVariant,
  AsyncSkeleton,
  InlineSkeleton,
} from '@/components/skeleton';
const variants: PageSkeletonVariant[] = [
  'account',
  'apiKeys',
  'assistant',
  'auth',
  'collectionDetail',
  'collections',
  'cook',
  'dashboard',
  'detail',
  'suggestions',
  'editor',
  'home',
  'library',
  'offline',
  'pantryInventory',
  'planner',
  'print',
  'securityUpgrade',
  'settings',
  'shoppingList',
  'shoppingLists',
  'tags',
  'workspace',
];
describe('loading surfaces', () => {
  it.each(variants)('announces the %s page once without fake interactive controls', (variant) => {
    const markup = renderToStaticMarkup(
      createElement(PageSkeleton, { variant, label: 'Loading your page' }),
    );
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('Loading your page');
    expect(markup).not.toMatch(/<(button|input|select|a)\b/);
    expect(markup).toContain('aria-hidden="true"');
  });
  it('labels asynchronous regions and inline loading feedback', () => {
    expect(
      renderToStaticMarkup(
        createElement(AsyncSkeleton, { label: 'Loading recipes', variant: 'rows' }),
      ),
    ).toContain('Loading recipes');
    expect(
      renderToStaticMarkup(createElement(InlineSkeleton, { label: 'Saving recipe' })),
    ).toContain('Saving recipe');
  });
});
