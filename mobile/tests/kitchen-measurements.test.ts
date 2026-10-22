import { expect, it } from 'vitest';
import {
  measurementBasesFor,
  measurementUnitsFor,
  starterMeasurement,
  validateMeasurementDrafts,
} from '../../shared/kitchen-measurements';
it('native size entry uses relevant fields and leaves new measurement values unsaved until entered', () => {
  expect(measurementBasesFor('slots')).toEqual(['slices-per-cycle']);
  expect(measurementBasesFor('diameter')).toEqual(['diameter', 'depth']);
  expect(measurementUnitsFor('width')).toEqual(['cm', 'mm', 'in']);
  expect(measurementUnitsFor('dry-input')).toContain('device-cups');
  expect(measurementUnitsFor('nominal-volume')).not.toContain('device-cups');
  expect(() => validateMeasurementDrafts([starterMeasurement('volume')])).toThrow(/positive value/);
  expect(() =>
    validateMeasurementDrafts([{ value: 1.5, basis: 'slices-per-cycle', unit: 'slices' }]),
  ).toThrow(/whole number/);
  expect(() =>
    validateMeasurementDrafts([{ value: 6, basis: 'dry-input', unit: 'device-cups' }]),
  ).toThrow(/cup volume/);
  expect(() =>
    validateMeasurementDrafts([
      { value: 6, basis: 'dry-input', unit: 'device-cups', deviceCupMl: 180 },
    ]),
  ).not.toThrow();
});
