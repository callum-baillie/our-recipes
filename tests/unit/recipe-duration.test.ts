import { describe, expect, it } from 'vitest';
import { formatRecipeDuration } from '@/lib/domain/recipe-duration';

describe('recipe card duration', () => {
  it('omits the zero sentinel used by unprovided recipe times', () => {
    expect(formatRecipeDuration(0)).toBeNull();
  });
  it('preserves minutes in long durations and includes the supplied rest time', () => {
    expect(formatRecipeDuration(15 + 210 + 20)).toBe('4h 5m');
    expect(formatRecipeDuration(60)).toBe('1h');
    expect(formatRecipeDuration(45)).toBe('45m');
  });
});
