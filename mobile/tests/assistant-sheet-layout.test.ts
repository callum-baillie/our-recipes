import { describe, expect, it } from 'vitest';
import { getAssistantSheetHeights } from '@/screens/assistant-sheet-layout';

describe('assistant sheet layout', () => {
  it('starts near half height and expands below the iOS top safe area', () => {
    expect(getAssistantSheetHeights(932, 59)).toEqual({
      compactHeight: 512.6,
      expandedHeight: 873,
    });
  });

  it('keeps enough room for the fixed header and composer on a small iPhone', () => {
    const heights = getAssistantSheetHeights(667, 20);

    expect(heights.compactHeight).toBe(460);
    expect(heights.expandedHeight).toBe(647);
    expect(heights.compactHeight).toBeLessThan(heights.expandedHeight);
  });

  it('never makes the compact detent taller than the available landscape height', () => {
    const heights = getAssistantSheetHeights(390, 0);

    expect(heights).toEqual({ compactHeight: 378, expandedHeight: 378 });
  });
});
