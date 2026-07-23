import { describe, expect, it } from 'vitest';

import {
  FDA_DAILY_VALUES_ADULTS_AND_CHILDREN_4_PLUS,
  NUTRITION_GENERAL_DISCLAIMER,
  REFERENCE_NUTRIENT_GAPS,
  canonicalReferenceGaps,
  estimatedEnergyDisclosure,
  nutritionReferenceRowSchema,
  nutritionReferenceSetSchema,
  referenceAppliesToProfile,
  referenceDisclosure,
} from '@/lib/domain/nutrition-reference';

describe('authoritative nutrition reference systems', () => {
  it('keeps the cited FDA table a label reference rather than a personalized DRI', () => {
    const set = FDA_DAILY_VALUES_ADULTS_AND_CHILDREN_4_PLUS;
    expect(set.referenceSystem).toBe('fda_daily_value');
    expect(set.purpose).toBe('label_reference');
    expect(set.rows).toHaveLength(35);
    expect(new Set(set.rows.map((row) => row.nutrientCode)).size).toBe(35);
    expect(set.source.url).toMatch(/^https:\/\/www\.fda\.gov\//u);
    expect(set.source.retrievedOn).toBe('2026-07-18');
    expect(set.disclaimer).toBe(NUTRITION_GENERAL_DISCLAIMER);
  });

  it('preserves exact FDA units and safe limit semantics for representative rows', () => {
    const byCode = new Map(
      FDA_DAILY_VALUES_ADULTS_AND_CHILDREN_4_PLUS.rows.map((row) => [row.nutrientCode, row]),
    );
    expect(byCode.get('folate')).toMatchObject({
      semantic: 'target',
      value: { form: 'amount', amount: 400, unit: 'mcg DFE' },
    });
    expect(byCode.get('vitamin_a')?.value).toEqual({
      form: 'amount',
      amount: 900,
      unit: 'mcg RAE',
    });
    expect(byCode.get('sodium')).toMatchObject({
      semantic: 'limit',
      value: { amount: 2_300, unit: 'mg' },
    });
    expect(byCode.get('added_sugars')?.semantic).toBe('limit');
  });

  it('makes every FDA nutrient missing from the canonical catalog explicit', () => {
    expect(REFERENCE_NUTRIENT_GAPS).toEqual([
      'chloride',
      'chromium',
      'molybdenum',
      'niacin_equivalents',
    ]);
    expect(canonicalReferenceGaps(FDA_DAILY_VALUES_ADULTS_AND_CHILDREN_4_PLUS)).toEqual(
      REFERENCE_NUTRIENT_GAPS,
    );
  });

  it('does not apply the general 4+ label category to children under four or pregnancy/lactation', () => {
    const applicability = FDA_DAILY_VALUES_ADULTS_AND_CHILDREN_4_PLUS.applicability;
    expect(
      referenceAppliesToProfile(applicability, {
        ageMonths: 48,
        sex: 'female',
        pregnant: false,
        lactating: false,
      }),
    ).toBe(true);
    expect(
      referenceAppliesToProfile(applicability, {
        ageMonths: 47,
        sex: 'male',
        pregnant: false,
        lactating: false,
      }),
    ).toBe(false);
    expect(
      referenceAppliesToProfile(applicability, {
        ageMonths: 360,
        sex: 'female',
        pregnant: true,
        lactating: false,
      }),
    ).toBe(false);
  });

  it('requires UL source scope and AMDR percent-energy ranges', () => {
    expect(() =>
      nutritionReferenceRowSchema.parse({
        nutrientCode: 'sodium',
        referenceKind: 'ul',
        semantic: 'target',
        value: { form: 'amount', amount: 2_300, unit: 'mg' },
        upperLimitScope: 'all_intake',
        note: '',
      }),
    ).toThrow(/UL is a limit/iu);
    expect(() =>
      nutritionReferenceRowSchema.parse({
        nutrientCode: 'total_fat',
        referenceKind: 'amdr',
        semantic: 'range',
        value: { form: 'range', minimum: 20, maximum: 35, unit: '%' },
        upperLimitScope: 'not_applicable',
        note: '',
      }),
    ).toThrow(/percent-of-energy range/iu);
  });

  it('rejects mixing FDA Daily Values with DRI rows', () => {
    expect(() =>
      nutritionReferenceSetSchema.parse({
        ...FDA_DAILY_VALUES_ADULTS_AND_CHILDREN_4_PLUS,
        rows: [
          {
            ...FDA_DAILY_VALUES_ADULTS_AND_CHILDREN_4_PLUS.rows[0],
            referenceKind: 'rda',
          },
        ],
      }),
    ).toThrow(/label-reference daily values/iu);
  });

  it('discloses source/applicability and gates estimated energy on consent and inputs', () => {
    expect(referenceDisclosure(FDA_DAILY_VALUES_ADULTS_AND_CHILDREN_4_PLUS)).toContain(
      'not medical advice',
    );
    expect(
      estimatedEnergyDisclosure({ consented: false, requiredInputsComplete: true }),
    ).toMatchObject({ status: 'unavailable', label: 'Energy target not estimated' });
    expect(
      estimatedEnergyDisclosure({ consented: true, requiredInputsComplete: false }),
    ).toMatchObject({ status: 'unavailable' });
    expect(
      estimatedEnergyDisclosure({
        consented: true,
        requiredInputsComplete: true,
        method: 'NASEM EER',
        sourceVersion: '2023',
      }),
    ).toEqual({
      status: 'estimated',
      label: 'Estimated energy target',
      explanation: 'Estimate using NASEM EER (2023). Individual needs may differ.',
    });
  });
});
