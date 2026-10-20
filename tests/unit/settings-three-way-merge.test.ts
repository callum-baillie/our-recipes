import { describe, expect, it } from 'vitest';
import { mergeSettings, resolveSettingsMerge } from '@/lib/domain/settings-merge';
describe('settings three-way merge', () => {
  it('adopts untouched current fields and merges independent nested edits without updating metadata', () => {
    const base = {
      personal: { instructions: '', models: { chat: { model: 'a', effort: 'low' } } },
      accounts: { a: { enabled: true } },
      frequency: 'off',
    };
    const local = { ...base, personal: { ...base.personal, instructions: 'Short responses' } };
    const latest = {
      ...base,
      personal: { ...base.personal, models: { chat: { model: 'b', effort: 'high' } } },
      accounts: { a: { enabled: false } },
      frequency: 'daily',
    };
    const merged = mergeSettings(base, local, latest);
    expect(merged.conflicts).toEqual([]);
    expect(resolveSettingsMerge(merged, {})).toEqual({
      ...latest,
      personal: { ...latest.personal, instructions: 'Short responses' },
    });
  });
  it('requires explicit choices for every overlap including null and arrays, preserving unselected latest fields', () => {
    const base = { frequency: 'off', model: 'a', selected: ['a'], override: null as null | string };
    const merged = mergeSettings(
      base,
      { frequency: 'daily', model: 'b', selected: ['a', 'b'], override: 'one' },
      { frequency: 'weekly', model: 'c', selected: ['c'], override: 'two' },
    );
    expect(merged.conflicts).toHaveLength(4);
    expect(() => resolveSettingsMerge(merged, {})).toThrow(/every conflicting/);
    expect(
      resolveSettingsMerge(merged, {
        '["frequency"]': 'current',
        '["model"]': 'draft',
        '["selected"]': 'current',
        '["override"]': 'draft',
      }),
    ).toEqual({ frequency: 'weekly', model: 'b', selected: ['c'], override: 'one' });
  });
  it('keeps removed overrides absent while adopting independent current edits', () => {
    const baseline: { models: Record<string, { model: string }>; instructions: string } = {
      models: { chat: { model: 'a' } },
      instructions: 'Brief',
    };
    const merged = mergeSettings(
      baseline,
      { ...baseline, models: {} },
      { ...baseline, instructions: 'Detailed' },
    );
    expect(resolveSettingsMerge(merged, {})).toEqual({ models: {}, instructions: 'Detailed' });
  });
  it('compares new nested overrides field by field instead of treating the entire object as a choice', () => {
    const baseline: { override?: { model: string; effort: string } } = {};
    const merged = mergeSettings(
      baseline,
      { override: { model: 'local', effort: 'high' } },
      { override: { model: 'current', effort: 'high' } },
    );
    expect(merged.conflicts.map((item) => item.path)).toEqual([['override', 'model']]);
    expect(resolveSettingsMerge(merged, { '["override","model"]': 'current' })).toEqual({
      override: { model: 'current', effort: 'high' },
    });
  });
});
