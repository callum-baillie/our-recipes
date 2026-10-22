import * as React from 'react';
import { Body, Button, FormField, Surface } from './ui';
import { ChoiceField } from './choice-field';
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
} from '../../../shared/kitchen-measurements';
export type KitchenMeasurementDraft = {
  value: number;
  unit: MeasurementUnit;
  basis: MeasurementBasis;
  mode?: string;
  deviceCupMl?: number;
  resourceIndex?: number;
  provenance: 'user-confirmed' | 'curated-type-default';
};
export function NativeKitchenMeasurementsEditor({
  values,
  kind,
  custom,
  onChange,
  resourceCount: requestedResourceCount = 1,
}: {
  values: KitchenMeasurementDraft[];
  kind: MeasurementKind;
  custom: boolean;
  resourceCount?: number;
  onChange: (values: KitchenMeasurementDraft[]) => void;
}) {
  const resourceCount = Number.isFinite(requestedResourceCount)
    ? Math.max(1, Math.min(8, Math.trunc(requestedResourceCount)))
    : 1;
  const [raw, setRaw] = React.useState(values.map((value) => String(value.value || '')));
  const bases = measurementBasesFor(kind, custom);
  const update = (index: number, patch: Partial<KitchenMeasurementDraft>) =>
    onChange(
      values.map((value, i) =>
        i === index ? { ...value, ...patch, provenance: 'user-confirmed' } : value,
      ),
    );
  if (!bases.length && !values.length) return null;
  return (
    <Surface>
      <Body>
        Sizes and working limits (optional). Leave unrecorded for “Not sure”. Nominal volume is not
        a working fill limit. Changing units relabels the value, without conversion.
      </Body>
      {!values.length ? <Body>Size not recorded.</Body> : null}
      {values.map((measurement, index) => (
        <Surface key={index}>
          <Body>Measurement {index + 1}</Body>
          <ChoiceField
            label={`Measurement ${index + 1} basis`}
            value={measurement.basis}
            choices={[...new Set([...bases, measurement.basis])].map((basis) => ({
              value: basis,
              label: MEASUREMENT_BASIS_LABELS[basis],
            }))}
            onChange={(value) => {
              const basis = value as MeasurementBasis;
              update(index, { basis, unit: measurementUnitsFor(basis)[0], deviceCupMl: undefined });
            }}
          />
          <FormField
            label={`Measurement ${index + 1} value`}
            value={raw[index] ?? String(measurement.value || '')}
            keyboardType="decimal-pad"
            onChangeText={(text) => {
              setRaw(raw.map((value, i) => (i === index ? text : value)));
              update(index, { value: Number(text) });
            }}
          />
          <ChoiceField
            label={`Measurement ${index + 1} unit`}
            value={measurement.unit}
            choices={[
              ...new Set([...measurementUnitsFor(measurement.basis), measurement.unit]),
            ].map((unit) => ({ value: unit, label: MEASUREMENT_UNIT_LABELS[unit] }))}
            onChange={(unit) =>
              update(index, { unit: unit as MeasurementUnit, deviceCupMl: undefined })
            }
          />
          {resourceCount > 1 || measurement.resourceIndex !== undefined ? (
            <ChoiceField
              label={`Measurement ${index + 1} compartment`}
              value={measurement.resourceIndex ? String(measurement.resourceIndex) : ''}
              choices={[
                { value: '', label: 'Whole device; individual compartment fit unknown' },
                ...Array.from({ length: resourceCount }, (_, i) => ({
                  value: String(i + 1),
                  label: `Independent compartment ${i + 1}`,
                })),
              ]}
              onChange={(value) =>
                update(index, { resourceIndex: value ? Number(value) : undefined })
              }
            />
          ) : null}
          {measurement.unit === 'device-cups' ? (
            <>
              <FormField
                label={`Measurement ${index + 1} device cup volume in mL`}
                value={measurement.deviceCupMl ? String(measurement.deviceCupMl) : ''}
                keyboardType="decimal-pad"
                onChangeText={(text) =>
                  update(index, { deviceCupMl: text ? Number(text) : undefined })
                }
              />
              <Body>Use the cup supplied with this device, not an ordinary measuring cup.</Body>
            </>
          ) : null}
          <FormField
            label={`Measurement ${index + 1} mode or food (optional)`}
            value={measurement.mode ?? ''}
            onChangeText={(mode) => update(index, { mode: mode || undefined })}
          />
          <Button
            tone="secondary"
            label={`Remove measurement ${index + 1} / Not sure`}
            onPress={() => {
              setRaw(raw.filter((_, i) => i !== index));
              onChange(values.filter((_, i) => i !== index));
            }}
          />
        </Surface>
      ))}
      <Button
        label="Record another measurement"
        tone="secondary"
        disabled={values.length >= MAX_KITCHEN_MEASUREMENTS}
        onPress={() => {
          setRaw([...raw, '']);
          onChange([...values, starterMeasurement(kind, custom)]);
        }}
      />
    </Surface>
  );
}
