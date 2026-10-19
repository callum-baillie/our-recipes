// @vitest-environment jsdom
import { createElement } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNutritionRequest } from '@/components/use-nutrition-request';
import { useNutritionDraft } from '@/components/use-nutrition-draft';
import { NutritionRecordForm } from '@/components/nutrition-recording';
import { NutritionGoalDialog } from '@/components/nutrition-goal-dialog';
import type { ProfileSummary, NutrientDefinition } from '@/components/nutrition-dashboard';
import {
  isNutritionDate,
  nutritionEventCandidates,
  nutritionEventInstant,
  nutritionKnownAverage,
  supportedFoodUnits,
} from '@/lib/domain/nutrition-ui';
import { nutritionGoalComparison, type ChartGoal } from '@/lib/domain/nutrition-chart-datasets';
import { moveNutritionLocalTimeToDate } from '@/lib/domain/nutrition-diary-lifecycle';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
const profile: ProfileSummary = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Callum',
  profileType: 'adult',
  relationship: 'self',
  canViewDiary: true,
  canViewMeasurements: true,
  canManageProfile: true,
  canManageGoals: true,
  dailyResetTimezone: 'America/Chicago',
  measurementSystem: 'metric',
};
const definitions: NutrientDefinition[] = [
  { code: 'energy_kcal', displayName: 'Calories', canonicalUnit: 'kcal', category: 'energy' },
  { code: 'protein', displayName: 'Protein', canonicalUnit: 'g', category: 'macro' },
];
const context = {
  profile,
  profiles: [profile],
  date: '2026-10-18',
  today: '2026-10-19',
  definitions,
  workspace: { products: [], recipes: [] },
};
beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value() {
      this.open = false;
    },
  });
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(fn, 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const response = (data: object, status = 201) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
describe('Nutrition dates, bases and comparisons', () => {
  it('resolves profile-local times independently of the device and requires a fold choice', () => {
    expect(nutritionEventInstant('2026-10-18', '23:45', 'America/Chicago')).toBe(
      '2026-10-19T04:45:00.000Z',
    );
    expect(nutritionEventCandidates('2026-03-08T02:30', 'America/Chicago')).toEqual([]);
    expect(() => nutritionEventInstant('2026-11-01', '01:30', 'America/Chicago')).toThrow(/twice/);
    expect(nutritionEventInstant('2026-11-01', '01:30', 'America/Chicago', 'later')).toBe(
      '2026-11-01T07:30:00.000Z',
    );
    expect(isNutritionDate('2026-02-30')).toBe(false);
  });
  it('copies local meal times with seconds, rejecting nonexistent destination times', () => {
    expect(
      moveNutritionLocalTimeToDate(
        new Date('2026-10-19T04:45:12Z'),
        '2026-10-17',
        'America/Chicago',
        'America/Los_Angeles',
      ).toISOString(),
    ).toBe('2026-10-18T06:45:12.000Z');
    expect(() =>
      moveNutritionLocalTimeToDate(
        new Date('2026-03-07T08:30Z'),
        '2026-03-08',
        'America/Chicago',
        'America/Chicago',
      ),
    ).toThrow(/does not exist/);
  });
  it('averages only known days, preserving explicit zero', () => {
    expect(
      nutritionKnownAverage({ a: { protein: 0 }, b: {}, c: { protein: 20 } }, 'protein'),
    ).toEqual({ value: 10, days: 2 });
    expect(nutritionKnownAverage({ a: {} }, 'protein')).toEqual({ value: undefined, days: 0 });
  });
  it('does not offer unsupported mass or serving conversion for a liquid record', () => {
    const units = supportedFoodUnits({
      basisType: 'per_100ml',
      basisAmount: 100,
      basisUnit: 'ml',
      servingWeightGrams: null,
      densityGramsPerMilliliter: null,
      pieceWeightGrams: null,
    });
    expect(units[0]).toBe('ml');
    expect(units).not.toContain('g');
    expect(units).not.toContain('serving');
  });
  it('keeps dated target/minimum/range/limit and ambiguity meanings consistent', () => {
    const base: ChartGoal = {
      id: 'a',
      sourceType: 'user_defined',
      nutrientCode: 'protein',
      unit: 'g',
      kind: 'minimum',
      value: 50,
      minimum: null,
      maximum: null,
      state: 'active',
      startsOn: '2026-10-01',
      endsOn: null,
    };
    expect(nutritionGoalComparison([base], '2026-10-19', 'protein', 0).description).toMatch(
      /50.*minimum/,
    );
    expect(nutritionGoalComparison([base], '2026-09-30', 'protein', 0).description).toMatch(
      /no.*goal/,
    );
    expect(
      nutritionGoalComparison([base, { ...base, id: 'b' }], '2026-10-19', 'protein', 40)
        .description,
    ).toMatch(/Multiple/);
    expect(
      nutritionGoalComparison(
        [{ ...base, kind: 'limit', value: null, maximum: 70 }],
        '2026-10-19',
        'protein',
        80,
      ).description,
    ).toMatch(/above.*limit/);
    expect(
      nutritionGoalComparison(
        [{ ...base, kind: 'range', value: null, minimum: 50, maximum: 70 }],
        '2026-10-19',
        'protein',
        60,
      ).description,
    ).toMatch(/within/i);
  });
});
describe('Nutrition request and draft ownership', () => {
  it('locks rapid submissions and ignores responses after a profile scope changes', async () => {
    let resolve!: (r: Response) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    );
    vi.stubGlobal('fetch', fetcher);
    const { result, rerender } = renderHook(({ scope }) => useNutritionRequest(scope), {
      initialProps: { scope: 'one' },
    });
    let first!: Promise<object | null>;
    await act(async () => {
      first = result.current.send('manual', '/mutation', {});
      void result.current.send('manual', '/mutation', {});
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    rerender({ scope: 'two' });
    await act(async () => {
      resolve(response({ saved: true }));
      await first;
    });
    expect(await first).toBeNull();
    expect(result.current.feedback).toEqual({});
    expect(result.current.pending).toBe(false);
  });
  it('restores incomplete drafts by person and keeps another person separate', async () => {
    const first = renderHook(() => useNutritionDraft('Callum:manual', { name: '', protein: '' }));
    await act(async () => first.result.current.update({ name: 'Half written' }));
    first.unmount();
    const second = renderHook(() => useNutritionDraft('Callum:manual', { name: '', protein: '' }));
    await waitFor(() => expect(second.result.current.draft.name).toBe('Half written'));
    const other = renderHook(() => useNutritionDraft('Julia:manual', { name: '', protein: '' }));
    expect(other.result.current.draft.name).toBe('');
  });
});
describe('shared food recording', () => {
  it('keeps read-only inline recording guarded even if a submit event is forced', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    render(
      createElement(NutritionRecordForm, {
        ...context,
        profile: { ...profile, canManageProfile: false },
        mode: 'skipped',
        inline: true,
      }),
    );
    const submit = screen.getByRole('button', { name: 'Record skipped meal' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(submit.closest('form')!);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('warns about incompatible restored product units instead of silently reinterpreting the amount', async () => {
    sessionStorage.setItem(
      `bord-nutrition-draft-v1:${profile.id}:product:${context.date}:`,
      JSON.stringify({ values: { productId: 'liquid', unit: 'g', quantity: '250' } }),
    );
    render(
      createElement(NutritionRecordForm, {
        ...context,
        mode: 'product',
        workspace: {
          recipes: [],
          products: [
            {
              id: 'liquid',
              displayName: 'A saved liquid',
              record: {
                id: 'record',
                revision: 1,
                basisType: 'per_100ml',
                basisAmount: 100,
                basisUnit: 'ml',
                sourceName: 'Fixture label',
                confidence: 0.8,
                completeness: 0.5,
                values: [{ nutrientCode: 'energy_kcal', amount: 42 }],
              },
            },
          ],
        },
      }),
    );
    await waitFor(() => expect(screen.getByText(/saved draft unit “g”/)).toBeTruthy());
    expect((screen.getByLabelText('Amount consumed') as HTMLInputElement).value).toBe('250');
  });

  it('records partial nutrients as full-amount totals, including zero, exactly once', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ entry: { id: 'saved' } }));
    vi.stubGlobal('fetch', fetcher);
    render(createElement(NutritionRecordForm, { ...context, mode: 'manual' }));
    fireEvent.change(screen.getByLabelText('Food or meal name'), {
      target: { value: 'Two portions' },
    });
    fireEvent.change(screen.getByLabelText('Amount consumed'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '23:45' } });
    fireEvent.change(screen.getByLabelText('Protein (g)'), { target: { value: '0' } });
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Add to food diary' }).closest('form')!);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body).toMatchObject({
      quantity: 2,
      occurredAt: '2026-10-19T04:45:00.000Z',
      values: [{ nutrientCode: 'protein', amount: 0 }],
    });
    expect(screen.getByText(/Food logged for Callum/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View diary day' }).getAttribute('href')).toContain(
      '2026-10-18',
    );
  });
  it('retains a zero-result copy and retries an uncertain copy with the same command key', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(response({ result: { revisionIds: [] } }));
    vi.stubGlobal('fetch', fetcher);
    render(createElement(NutritionRecordForm, { ...context, mode: 'copy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy confirmed entries' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Retry same copy' })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry same copy' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(
      JSON.parse(fetcher.mock.calls[1][1].body),
    );
    expect(screen.getByText(/No eligible eaten or corrected/)).toBeTruthy();
  });
  it('converts weight and advanced mass when the input unit changes', () => {
    render(createElement(NutritionRecordForm, { ...context, mode: 'weight' }));
    fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '70' } });
    fireEvent.change(screen.getByLabelText('Observation unit'), { target: { value: 'lb' } });
    expect(Number((screen.getByLabelText('Weight (lb)') as HTMLInputElement).value)).toBeCloseTo(
      154.32358,
      4,
    );
  });
  it('populates an example goal without saving, then supersedes the selected series explicitly', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ goal: { revision: 2 } }));
    vi.stubGlobal('fetch', fetcher);
    render(
      createElement(NutritionGoalDialog, {
        profile,
        definitions,
        goals: [
          {
            id: 'old',
            seriesId: 'series',
            revision: 1,
            startsOn: '2026-10-01',
            endsOn: null,
            nutrientCode: 'energy_kcal',
            kind: 'target',
            value: 1800,
            minimum: null,
            maximum: null,
            unit: 'kcal',
            sourceType: 'user_defined',
            state: 'active',
          },
        ],
        today: context.today,
        open: true,
        onClose: vi.fn(),
        onSaved: vi.fn(),
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /1,800/ }));
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Goal to change'), { target: { value: 'old' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      seriesId: 'series',
      supersedesGoalVersionId: 'old',
    });
  });
});
