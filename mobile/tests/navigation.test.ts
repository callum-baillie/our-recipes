import { describe, expect, it } from 'vitest';

const routes = [
  '/(app)/(recipes)',
  '/(app)/(plan)',
  '/(app)/(pantry)',
  '/(app)/(nutrition)',
  '/(app)/(lists)',
  '/(app)/(recipes)/home',
  '/settings',
  '/assistant',
  '/recipe-filters',
  '/offline',
  '/(auth)/instance',
  '/(auth)/sign-in',
  '/scanner',
];
describe('navigation contract', () => {
  it('keeps five primary destinations and supporting flows reachable', () => {
    expect(routes.slice(0, 5)).toEqual([
      '/(app)/(recipes)',
      '/(app)/(plan)',
      '/(app)/(pantry)',
      '/(app)/(nutrition)',
      '/(app)/(lists)',
    ]);
    expect(routes).toContain('/assistant');
    expect(routes).toContain('/recipe-filters');
    expect(routes).toContain('/settings');
    expect(routes).toContain('/(app)/(recipes)/home');
    expect(routes).toContain('/(auth)/instance');
    expect(routes).toContain('/scanner');
  });
  it('keeps Home available outside the five visible tabs', () => {
    expect(routes.indexOf('/(app)/(recipes)/home')).toBeGreaterThanOrEqual(5);
  });
});
