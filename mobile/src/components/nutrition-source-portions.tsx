import * as React from 'react';
import { View } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { Body, Button } from '@/components/ui';
import { TaskError } from '@/components/nutrition-workspace-common';
import {
  catalogContextKey,
  createRequestGeneration,
  normalizeCatalogMeasure,
  type CatalogMeasure,
} from '../../../shared/mobile-domain/catalog-measures';
import {
  nutritionSourceContextKey,
  selectNutritionSourcePortion,
  type NutritionSourceRecord,
} from '../../../shared/mobile-domain/nutrition-source-portions';

type Props = {
  productId: string;
  record: NutritionSourceRecord;
  disabled: boolean;
  onSelect: (amount: {
    quantity: number;
    unit: 'g';
    expectedFoodNutritionRecordId: string;
  }) => void;
};

export function NutritionSourcePortions(props: Props) {
  const { instanceUrl, user } = useAuth();
  return (
    <SourcePortions
      key={`${instanceUrl}:${user?.id}:${nutritionSourceContextKey(props.productId, props.record)}`}
      {...props}
    />
  );
}

function SourcePortions({ productId, record, disabled, onSelect }: Props) {
  const { request } = useAuth();
  const generation = React.useRef(createRequestGeneration());
  const abort = React.useRef<AbortController | null>(null);
  const loading = React.useRef(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [measures, setMeasures] = React.useState<CatalogMeasure[] | null>(null);
  const [shown, setShown] = React.useState(12);
  const [selection, setSelection] = React.useState('');
  const contextKey = nutritionSourceContextKey(productId, record);
  React.useEffect(() => {
    const requests = generation.current;
    return () => {
      requests.next();
      abort.current?.abort();
    };
  }, []);

  const load = async () => {
    if (disabled || loading.current || !record.catalogRef) return;
    loading.current = true;
    const token = generation.current.next();
    const controller = new AbortController();
    abort.current?.abort();
    abort.current = controller;
    setBusy(true);
    setError(null);
    try {
      const result = await request<{
        reference: NonNullable<NutritionSourceRecord['catalogRef']>;
        generation?: string;
        measures: Record<string, unknown>[];
      }>('/api/v1/food-data/catalog/measures', {
        method: 'POST',
        body: JSON.stringify({ reference: record.catalogRef }),
        signal: controller.signal,
      });
      if (!generation.current.isCurrent(token)) return;
      if (
        !result.reference ||
        catalogContextKey(result.reference, productId) !==
          catalogContextKey(record.catalogRef, productId) ||
        (result.generation && result.generation !== record.catalogRef.catalog_generation) ||
        !Array.isArray(result.measures) ||
        result.measures.some((value) => !value || typeof value !== 'object' || Array.isArray(value))
      )
        throw new Error(
          'The source context changed. Reload the saved product before choosing a portion.',
        );
      setMeasures(result.measures.map(normalizeCatalogMeasure));
    } catch (cause) {
      if (generation.current.isCurrent(token) && !controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'Source portions could not be loaded.');
    } finally {
      if (generation.current.isCurrent(token)) {
        loading.current = false;
        setBusy(false);
      }
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <Body muted>
        Saved nutrition: {record.sourceName} · revision {record.revision} · {record.basisAmount}{' '}
        {record.basisUnit} ({record.basisType.replaceAll('_', ' ')})
      </Body>
      {!record.catalogRef ? (
        <Body muted>
          No catalog source is linked to this saved nutrition record. Enter the eaten amount using
          its supported units.
        </Body>
      ) : (
        <>
          <Body muted>
            Source {record.catalogRef.source_id.replaceAll('_', ' ')} · revision{' '}
            {record.catalogRef.source_revision}. Selecting a portion fills the amount below; it does
            not log food or change Pantry stock.
          </Body>
          {!record.supportedUnits.includes('g') ? (
            <Body muted>
              This saved nutrition basis cannot convert grams. Source weights are information only;
              enter an amount in a supported unit. No density or serving conversion is assumed.
            </Body>
          ) : null}
          <Button
            label={
              busy
                ? 'Loading source portions…'
                : measures
                  ? 'Reload source portions'
                  : 'Show source portions'
            }
            tone="secondary"
            disabled={disabled || busy}
            onPress={() => void load()}
          />
          <TaskError error={error} />
          {measures?.length === 0 ? (
            <Body muted>
              No portions are available for this exact source revision. Enter a measured amount.
            </Body>
          ) : null}
          {measures?.slice(0, shown).map((measure, index) => {
            const amount = selectNutritionSourcePortion({
              productId,
              record,
              reviewedContextKey: contextKey,
              measure,
              locked: false,
            });
            return (
              <View key={`${index}:${measure.label}`} style={{ gap: 6 }}>
                <Body>
                  {measure.label}
                  {measure.gramWeight !== null ? ` · ${measure.gramWeight} g` : ''}
                  {measure.form ? ` · ${measure.form}` : ''}
                  {measure.basis ? ` · ${measure.basis}` : ''}
                </Body>
                {measure.description && measure.description !== measure.modifier ? (
                  <Body muted>{measure.description}</Body>
                ) : null}
                {amount ? (
                  <Button
                    label={`Use ${measure.label} · ${amount.quantity} g`}
                    tone="quiet"
                    disabled={disabled}
                    onPress={() => {
                      const selected = selectNutritionSourcePortion({
                        productId,
                        record,
                        reviewedContextKey: contextKey,
                        measure,
                        locked: disabled,
                      });
                      if (!selected) return;
                      onSelect(selected);
                      setSelection(
                        `${measure.label}: ${selected.quantity} g copied to the eaten amount. Review before confirming.`,
                      );
                    }}
                  />
                ) : !disabled && record.supportedUnits.includes('g') ? (
                  <Body muted>
                    No usable positive gram weight is recorded for this portion. Enter a measured
                    amount.
                  </Body>
                ) : null}
              </View>
            );
          })}
          {measures && measures.length > shown ? (
            <Button
              label={`Show more portions (${measures.length - shown} remaining)`}
              tone="quiet"
              disabled={disabled}
              onPress={() => setShown((value) => value + 12)}
            />
          ) : null}
          {selection ? (
            <View accessible accessibilityLiveRegion="polite">
              <Body>{selection}</Body>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
