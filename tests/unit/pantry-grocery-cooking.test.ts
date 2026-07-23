import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  pantryCookConfirmationSchema,
  pantryPurchaseIntakeSchema,
  pantryShoppingControlSchema,
  pantryShortageGenerationSchema,
} from '@/lib/domain/pantry-grocery-cooking';
import {
  createIntakeOperationTracker,
  pantryContributions,
  pantryOptionsFromSummary,
  pantryStateLabel,
  runTrackedIntakeOperation,
} from '@/components/shopping-list-editor';
import { MealPlanPantryDemand } from '@/components/meal-plan-pantry-demand';

describe('Pantry grocery and cooking contracts', () => {
  it('reads Pantry products and locations from the nested summary dashboard', () => {
    expect(
      pantryOptionsFromSummary({
        dashboard: {
          products: [{ id: 'product-1', displayName: 'Red lentils' }],
          locations: [{ id: 'location-1', path: 'Basement shelf' }],
          batches: [],
        },
      }),
    ).toEqual({
      products: [{ id: 'product-1', displayName: 'Red lentils' }],
      locations: [{ id: 'location-1', path: 'Basement shelf' }],
    });
  });

  it('keeps shortage generation disabled in the server render until mount', () => {
    const markup = renderToStaticMarkup(
      createElement(MealPlanPantryDemand, {
        demand: {
          weekStart: '2027-03-29',
          weekEnd: '2027-04-04',
          lines: [],
          unknown: [],
        },
      }),
    );
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Make missing-items list<\/button>/u);
    expect(markup).toContain('All demand, including covered');
  });

  it('requires an explicit cooking confirmation', () => {
    expect(
      pantryCookConfirmationSchema.safeParse({ confirmed: false, consumptions: [] }).success,
    ).toBe(false);
    expect(pantryCookConfirmationSchema.parse({ confirmed: true, consumptions: [] })).toMatchObject(
      { confirmed: true, leftovers: [] },
    );
  });

  it('requires location-aware idempotent purchase intake', () => {
    const base = {
      productId: '00000000-0000-4000-8000-000000000001',
      locationId: '00000000-0000-4000-8000-000000000002',
      quantity: 2,
      unit: 'each',
    };
    expect(pantryPurchaseIntakeSchema.safeParse(base).success).toBe(false);
    expect(
      pantryPurchaseIntakeSchema.parse({ ...base, operationKey: 'purchase-1234' }),
    ).toMatchObject({
      ...base,
      intakeMode: 'partial',
      expiryPrecision: 'unknown',
      source: 'shopping-list-purchase',
    });
    expect(
      pantryPurchaseIntakeSchema.parse({
        ...base,
        operationKey: 'purchase-rich-1234',
        intakeMode: 'complete',
        packageCount: 2,
        amountPerPackage: 500,
        packageUnit: 'g',
        sublocation: 'Top shelf',
        purchaseDate: '2027-04-01',
        bestBeforeDate: '2027-05-01',
        useByDate: '2027-04-20',
        sellByDate: '2027-04-15',
        purchasePriceCents: 899,
        store: 'Corner market',
        notes: 'Two sealed bags',
      }),
    ).toMatchObject({ intakeMode: 'complete', packageCount: 2, purchasePriceCents: 899 });
  });

  it('validates durable grocery controls and defaults generation to missing-only', () => {
    expect(
      pantryShortageGenerationSchema.parse({
        weekStart: '2027-04-01',
        weekEnd: '2027-04-07',
      }).mode,
    ).toBe('missing');
    expect(pantryShoppingControlSchema.safeParse({ action: 'extra' }).success).toBe(false);
    expect(
      pantryShoppingControlSchema.parse({ action: 'extra', quantity: 1.5, unit: 'kg' }),
    ).toMatchObject({ action: 'extra', quantity: 1.5, unit: 'kg' });
  });

  it('rejects inverted shortage date ranges', () => {
    expect(
      pantryShortageGenerationSchema.safeParse({
        weekStart: '2027-04-08',
        weekEnd: '2027-04-01',
      }).success,
    ).toBe(false);
  });

  it('labels generated, uncertain, manual override, and obsolete-manual rows truthfully', () => {
    const detail = {
      shoppingListItemId: 'item',
      productId: null,
      demandState: 'shortage' as const,
      generatedQuantity: 2,
      generatedUnit: 'each',
      shortageQuantity: 2,
      uncertaintyReason: null,
      formulaInputs: '{}',
      provenance: '{}',
      generationKey: 'key',
      manualQuantityOverride: false,
      manualUnitOverride: false,
      manualItemOverride: false,
      manualNoteOverride: false,
      generatedAt: new Date(),
      updatedAt: new Date(),
    };
    expect(pantryStateLabel({ pantry: detail })).toBe('Generated Pantry shortage · 2 each');
    expect(
      pantryStateLabel({
        pantry: {
          ...detail,
          demandState: 'uncertain',
          generatedQuantity: null,
          shortageQuantity: null,
        },
      }),
    ).toBe('Uncertain generated demand · no numeric shortage claimed');
    expect(pantryStateLabel({ pantry: { ...detail, manualQuantityOverride: true } })).toBe(
      'Manual override · generated shortage is 2 each',
    );
    expect(pantryStateLabel({ pantry: { ...detail, demandState: 'manual' } })).toBe(
      'Obsolete generated demand · kept as a manual item',
    );
    expect(
      pantryContributions({
        pantry: {
          ...detail,
          demandState: 'manual',
          provenance: JSON.stringify({ contributions: [{ contributionQuantity: 99 }] }),
        },
      }),
    ).toEqual([]);
  });

  it('reuses a persisted intake key across rejected, unknown-outcome, and concurrent fetches', async () => {
    const generated = ['operation-1', 'operation-2'];
    const tracker = createIntakeOperationTracker(() => generated.shift()!);
    const dispatchedKeys: string[] = [];
    const resolvers: Array<(result: { confirmed: boolean; value: { error?: string } }) => void> =
      [];
    const dispatch = (operationKey: string) => {
      dispatchedKeys.push(operationKey);
      return new Promise<{ confirmed: boolean; value: { error?: string } }>((resolve) =>
        resolvers.push(resolve),
      );
    };
    const first = runTrackedIntakeOperation(tracker, 'item-1', dispatch);
    const concurrent = runTrackedIntakeOperation(tracker, 'item-1', dispatch);
    expect(dispatchedKeys).toEqual(['operation-1', 'operation-1']);
    resolvers[0]!({ confirmed: false, value: { error: 'rejected' } });
    resolvers[1]!({ confirmed: false, value: { error: 'rejected' } });
    expect((await first).outcome).toBe('rejected');
    expect((await concurrent).outcome).toBe('rejected');
    expect(tracker.current('item-1')).toBe('operation-1');

    const unknown = await runTrackedIntakeOperation(tracker, 'item-1', async (operationKey) => {
      expect(operationKey).toBe('operation-1');
      throw new TypeError('network result unknown');
    });
    expect(unknown.outcome).toBe('unknown');
    expect(tracker.current('item-1')).toBe('operation-1');

    const successResolvers: Array<
      (result: { confirmed: boolean; value: { status: string } }) => void
    > = [];
    const successDispatch = () =>
      new Promise<{ confirmed: boolean; value: { status: string } }>((resolve) =>
        successResolvers.push(resolve),
      );
    const matchingSuccess = runTrackedIntakeOperation(tracker, 'item-1', successDispatch);
    const lateSuccess = runTrackedIntakeOperation(tracker, 'item-1', successDispatch);
    successResolvers[0]!({ confirmed: true, value: { status: 'current success' } });
    const confirmed = await matchingSuccess;
    expect(confirmed).toMatchObject({
      outcome: 'confirmed',
      operationKey: 'operation-1',
      nextOperationKey: 'operation-2',
    });
    successResolvers[1]!({ confirmed: true, value: { status: 'late stale success' } });
    const stale = await lateSuccess;
    expect(stale).toEqual({
      outcome: 'stale',
      operationKey: 'operation-1',
      nextOperationKey: 'operation-2',
    });
    expect('value' in stale).toBe(false);
    expect(tracker.begin('item-1')).toBe('operation-2');
  });
});
