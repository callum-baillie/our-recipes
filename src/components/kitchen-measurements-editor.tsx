'use client';
import { useId, useState } from 'react';
import type { EquipmentMeasurement } from '@/lib/domain/kitchen';
import {
  MAX_KITCHEN_MEASUREMENTS,
  measurementBasesFor,
  measurementUnitsFor,
  starterMeasurement,
  MEASUREMENT_BASIS_LABELS,
  MEASUREMENT_UNIT_LABELS,
  type MeasurementKind,
  type MeasurementBasis,
  type MeasurementUnit,
} from '../../shared/kitchen-measurements';
import styles from './my-kitchen.module.css';

export function KitchenMeasurementsEditor({
  values,
  kind,
  custom,
  onChange,
  errors,
  resourceCount: requestedResourceCount = 1,
}: {
  values: EquipmentMeasurement[];
  kind: MeasurementKind;
  custom: boolean;
  onChange: (values: EquipmentMeasurement[]) => void;
  errors: Record<string, string>;
  resourceCount?: number;
}) {
  const resourceCount = Number.isFinite(requestedResourceCount)
    ? Math.max(1, Math.min(8, Math.trunc(requestedResourceCount)))
    : 1;
  const prefix = useId();
  const [rawValues, setRawValues] = useState(values.map((value) => String(value.value || '')));
  const bases = measurementBasesFor(kind, custom);
  const update = (index: number, patch: Partial<EquipmentMeasurement>) =>
    onChange(
      values.map((value, i) =>
        i === index ? { ...value, ...patch, provenance: 'user-confirmed' } : value,
      ),
    );
  if (!bases.length && !values.length) return null;
  return (
    <fieldset aria-describedby={`${prefix}-help`}>
      <legend>Sizes and working limits (optional)</legend>
      <p id={`${prefix}-help`}>
        Leave sizes unrecorded for “Not sure”. Record each dimension or limit separately. Nominal
        volume is not a working fill limit. Changing units relabels the entered value; it does not
        convert it.
      </p>
      {!values.length && <p>Size not recorded.</p>}
      {values.map((measurement, index) => (
        <fieldset key={index}>
          <legend>Measurement {index + 1}</legend>
          <div className={styles.fields}>
            <div>
              <label htmlFor={`${prefix}-${index}-basis`}>Measurement basis</label>
              <select
                id={`${prefix}-${index}-basis`}
                value={measurement.basis}
                onChange={(event) => {
                  const basis = event.target.value as MeasurementBasis;
                  update(index, {
                    basis,
                    unit: measurementUnitsFor(basis)[0],
                    deviceCupMl: undefined,
                  });
                }}
              >
                {[...new Set([...bases, measurement.basis])].map((basis) => (
                  <option key={basis} value={basis}>
                    {MEASUREMENT_BASIS_LABELS[basis]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${prefix}-${index}-value`}>Value</label>
              <input
                id={`${prefix}-${index}-value`}
                type="number"
                min={0.001}
                step={measurement.basis === 'slices-per-cycle' ? 1 : 'any'}
                value={rawValues[index] ?? String(measurement.value || '')}
                onChange={(event) => {
                  setRawValues(
                    rawValues.map((value, i) => (i === index ? event.target.value : value)),
                  );
                  update(index, { value: Number(event.target.value) });
                }}
                aria-invalid={Boolean(errors[`measurements.${index}.value`])}
                aria-describedby={
                  errors[`measurements.${index}.value`] ? `${prefix}-${index}-error` : undefined
                }
              />
            </div>
            <div>
              <label htmlFor={`${prefix}-${index}-unit`}>Unit</label>
              <select
                id={`${prefix}-${index}-unit`}
                value={measurement.unit}
                onChange={(event) =>
                  update(index, {
                    unit: event.target.value as MeasurementUnit,
                    deviceCupMl: undefined,
                  })
                }
              >
                {[...new Set([...measurementUnitsFor(measurement.basis), measurement.unit])].map(
                  (unit) => (
                    <option key={unit} value={unit}>
                      {MEASUREMENT_UNIT_LABELS[unit]}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>
          {(resourceCount > 1 || measurement.resourceIndex !== undefined) && (
            <label>
              Applies to compartment
              <select
                value={measurement.resourceIndex ?? ''}
                onChange={(event) =>
                  update(index, {
                    resourceIndex: event.target.value ? Number(event.target.value) : undefined,
                  })
                }
              >
                <option value="">
                  Whole device (does not establish individual compartment fit)
                </option>
                {measurement.resourceIndex && measurement.resourceIndex > resourceCount && (
                  <option value={measurement.resourceIndex}>
                    Compartment {measurement.resourceIndex} is no longer recorded; choose a current
                    compartment
                  </option>
                )}
                {Array.from({ length: resourceCount }, (_, i) => (
                  <option value={i + 1} key={i}>{`Independent compartment ${i + 1}`}</option>
                ))}
              </select>
            </label>
          )}
          {errors[`measurements.${index}.resourceIndex`] && (
            <p role="alert">{errors[`measurements.${index}.resourceIndex`]}</p>
          )}
          {measurement.unit === 'device-cups' && (
            <label>
              Device measuring cup volume (mL)
              <input
                type="number"
                min={1}
                max={1000}
                value={measurement.deviceCupMl ?? ''}
                onChange={(event) =>
                  update(index, {
                    deviceCupMl: event.target.value ? Number(event.target.value) : undefined,
                  })
                }
              />
              <span>
                Use the cup supplied for this device. Ordinary measuring cups are not
                interchangeable.
              </span>
            </label>
          )}
          <label>
            Applies to mode or food (optional)
            <input
              value={measurement.mode ?? ''}
              maxLength={80}
              placeholder="For example: pressure-cook or dry-rice"
              onChange={(event) => update(index, { mode: event.target.value || undefined })}
            />
          </label>
          {errors[`measurements.${index}.value`] && (
            <p id={`${prefix}-${index}-error`} role="alert">
              {errors[`measurements.${index}.value`]}
            </p>
          )}
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setRawValues(rawValues.filter((_, i) => i !== index));
              onChange(values.filter((_, i) => i !== index));
            }}
          >
            Remove measurement {index + 1} / Not sure
          </button>
        </fieldset>
      ))}
      {errors.measurements && <p role="alert">{errors.measurements}</p>}
      <button
        className="secondary-button"
        type="button"
        disabled={values.length >= MAX_KITCHEN_MEASUREMENTS}
        onClick={() => {
          setRawValues([...rawValues, '']);
          onChange([...values, starterMeasurement(kind, custom)]);
        }}
      >
        Record another measurement
      </button>
    </fieldset>
  );
}
