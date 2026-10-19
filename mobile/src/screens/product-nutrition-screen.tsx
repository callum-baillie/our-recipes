import * as React from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  AppHeader,
  Body,
  Button,
  EditorialText,
  FormField,
  Screen,
  Surface,
} from '@/components/ui';
import { ChoiceField } from '@/components/choice-field';
import { ResourceState, TaskError } from '@/components/nutrition-workspace-common';
import { useResource } from '@/hooks/use-resource';
import { useTask } from '@/hooks/use-task';
import { useAuth } from '@/auth/auth-context';
import { useSync } from '@/sync/sync-context';
import { nutrientValues, positiveNumber } from '@/data/nutrition-commands';
import { nutrientCatalog } from '@/data/nutrient-catalog';
type FoodRecord = {
  id: string;
  revision: number;
  basisType: string;
  basisAmount: number;
  basisUnit: string;
  servingWeightGrams: number | null;
  densityGramsPerMilliliter: number | null;
  pieceWeightGrams: number | null;
  confidence: number;
  completeness: number;
  notes: string;
  values: { nutrientCode: string; amount: number }[];
};
export function ProductNutritionScreen() {
  const params = useLocalSearchParams<{ productId?: string }>();
  const [productId, setProductId] = React.useState(params.productId ?? '');
  const products = useResource<{ products: { id: string; displayName: string }[] }>(
    '/api/v1/pantry/products',
  );
  return (
    <Screen>
      <AppHeader back />
      <EditorialText variant="title">Product nutrition records</EditorialText>
      <ResourceState resource={products} />
      <ChoiceField
        label="Product"
        value={productId}
        onChange={setProductId}
        searchable
        choices={(products.data?.products ?? []).map((item) => ({
          value: item.id,
          label: item.displayName,
        }))}
      />
      {productId ? (
        <ProductRecordEditor key={productId} productId={productId} />
      ) : (
        <Body muted>Choose a Pantry product to record its label or review prior versions.</Body>
      )}
    </Screen>
  );
}
function ProductRecordEditor({ productId }: { productId: string }) {
  const path = `/api/v1/nutrition/products/${productId}/records`;
  const history = useResource<{ records: FoodRecord[] }>(path);
  const task = useTask();
  const { request } = useAuth();
  const { refresh } = useSync();
  const [editing, setEditing] = React.useState<FoodRecord | null>(null);
  const [open, setOpen] = React.useState(false);
  const [basis, setBasis] = React.useState('per_100g');
  const [amount, setAmount] = React.useState('1');
  const [unit, setUnit] = React.useState('serving');
  const [weight, setWeight] = React.useState('');
  const [density, setDensity] = React.useState('');
  const [piece, setPiece] = React.useState('');
  const [confidence, setConfidence] = React.useState('1');
  const [completeness, setCompleteness] = React.useState('1');
  const [notes, setNotes] = React.useState('');
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [nutrient, setNutrient] = React.useState('protein');
  const edit = (record?: FoodRecord) => {
    setEditing(record ?? null);
    setBasis(record?.basisType ?? 'per_100g');
    setAmount(String(record?.basisAmount ?? 1));
    setUnit(record?.basisUnit ?? 'serving');
    setWeight(String(record?.servingWeightGrams ?? ''));
    setDensity(String(record?.densityGramsPerMilliliter ?? ''));
    setPiece(String(record?.pieceWeightGrams ?? ''));
    setConfidence(String(record?.confidence ?? 1));
    setCompleteness(String(record?.completeness ?? 1));
    setNotes(record?.notes ?? '');
    setValues(
      Object.fromEntries(
        (record?.values ?? []).map((value) => [value.nutrientCode, String(value.amount)]),
      ),
    );
    setOpen(true);
  };
  const save = () =>
    task.run(async () => {
      const probability = (raw: string) => {
        const value = Number(raw);
        if (!raw.trim() || !Number.isFinite(value) || value < 0 || value > 1)
          throw new Error('Confidence and completeness must be between 0 and 1.');
        return value;
      };
      await request(path, {
        method: 'POST',
        body: JSON.stringify({
          basisType: basis,
          basisAmount: basis.startsWith('per_100') ? 100 : positiveNumber(amount, 'Basis amount'),
          basisUnit: basis === 'per_100g' ? 'g' : basis === 'per_100ml' ? 'ml' : unit,
          servingWeightGrams: weight ? positiveNumber(weight, 'Serving weight') : null,
          densityGramsPerMilliliter: density ? positiveNumber(density, 'Density') : null,
          pieceWeightGrams: piece ? positiveNumber(piece, 'Piece weight') : null,
          confidence: probability(confidence),
          completeness: probability(completeness),
          supersedesRecordId: editing?.id ?? null,
          notes,
          values: nutrientValues(values),
        }),
      });
      setOpen(false);
      history.reload();
      await refresh();
    });
  const shown = [
    ...new Set([
      'energy_kcal',
      'protein',
      'carbohydrate',
      'total_fat',
      'fiber',
      'sodium',
      ...Object.keys(values),
    ]),
  ];
  return (
    <>
      <ResourceState resource={history} />
      <TaskError error={task.error} />
      <Button label="Add nutrition record" onPress={() => edit()} />
      {open ? (
        <Surface style={{ gap: 12 }}>
          <EditorialText>{editing ? 'Revise saved record' : 'New record'}</EditorialText>
          <Body muted>
            Enter amounts from the product label. Blank nutrients remain unknown; use zero only when
            the source explicitly reports zero.
          </Body>
          <ChoiceField
            label="Label basis"
            value={basis}
            onChange={setBasis}
            choices={['per_100g', 'per_100ml', 'per_serving', 'per_unit'].map((value) => ({
              value,
              label: value.replaceAll('_', ' '),
            }))}
          />
          {!basis.startsWith('per_100') ? (
            <>
              <FormField
                label="Basis amount"
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
              />
              <FormField label="Basis unit" value={unit} onChangeText={setUnit} />
            </>
          ) : null}
          <FormField
            label="Serving weight (g)"
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
          />
          <FormField
            label="Density (g/ml)"
            value={density}
            onChangeText={setDensity}
            keyboardType="decimal-pad"
          />
          <FormField
            label="Piece weight (g)"
            value={piece}
            onChangeText={setPiece}
            keyboardType="decimal-pad"
          />
          {shown.map((code) => {
            const definition = nutrientCatalog.find((item) => item.code === code);
            return definition ? (
              <FormField
                key={code}
                label={`${definition.name} (${definition.unit})`}
                value={values[code] ?? ''}
                onChangeText={(value) => setValues((current) => ({ ...current, [code]: value }))}
                keyboardType="decimal-pad"
              />
            ) : null;
          })}
          <ChoiceField
            label="Additional nutrient"
            value={nutrient}
            onChange={setNutrient}
            searchable
            choices={nutrientCatalog.map((item) => ({ value: item.code, label: item.name }))}
          />
          <Button
            label="Add nutrient field"
            tone="secondary"
            onPress={() =>
              setValues((current) => ({ ...current, [nutrient]: current[nutrient] ?? '' }))
            }
          />
          <FormField
            label="Confidence (0–1)"
            value={confidence}
            onChangeText={setConfidence}
            keyboardType="decimal-pad"
          />
          <FormField
            label="Completeness (0–1)"
            value={completeness}
            onChangeText={setCompleteness}
            keyboardType="decimal-pad"
          />
          <FormField label="Source and notes" value={notes} onChangeText={setNotes} multiline />
          <Button label="Save nutrition record" disabled={task.busy} onPress={() => void save()} />
          <Button label="Cancel" tone="secondary" onPress={() => setOpen(false)} />
        </Surface>
      ) : null}
      {history.data?.records.map((record) => (
        <Surface key={record.id} style={{ gap: 8 }}>
          <EditorialText>Revision {record.revision}</EditorialText>
          <Body>
            {record.basisAmount} {record.basisUnit} · {record.values.length} known nutrients
          </Body>
          {record.notes ? <Body muted>{record.notes}</Body> : null}
          <Button label="Revise this record" tone="secondary" onPress={() => edit(record)} />
        </Surface>
      ))}
    </>
  );
}
