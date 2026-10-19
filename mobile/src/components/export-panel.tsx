import * as React from 'react';
import { Platform, Text, View } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { presentDocument } from '@/exports/document';
import { Body, Button, FormField, NativeToggle, Surface } from '@/components/ui';
import { ChoiceField } from '@/components/choice-field';
import { useResource } from '@/hooks/use-resource';
import { tokens } from '@/theme/tokens';

export function ExportPanel({
  path,
  filename,
  body,
  formats = [],
  recipe = false,
}: {
  path: string;
  filename: string;
  body?: Record<string, unknown>;
  recipe?: boolean;
  formats?: { label: string; path: string; extension: string }[];
}) {
  const { requestDocument } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [documentFormat, setDocumentFormat] = React.useState('pdf');
  const [paper, setPaper] = React.useState<'A4' | 'Letter'>('A4');
  const [notes, setNotes] = React.useState(true);
  const [nutrition, setNutrition] = React.useState(true);
  const [images, setImages] = React.useState(true);
  const inventory = path.includes('/pantry/') || path.includes('/shopping-lists/');
  const plan = path.includes('/meal-plan/');
  const stores = useResource<{ profiles: { id: string; name: string }[] }>(
    open && inventory ? '/api/v1/supermarket-profiles' : null,
  );
  const [storeId, setStoreId] = React.useState('');
  const [extra, setExtra] = React.useState({
    includeIngredients: true,
    ingredientCheckboxes: false,
    includeMethod: true,
    includeEquipment: true,
    includeSource: true,
    includeRecipes: true,
    includeChecked: false,
    includeDates: true,
    countColumn: true,
  });
  const [servings, setServings] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const lock = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);
  const exportFile = async (print: boolean, alternative?: (typeof formats)[number]) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      if (
        recipe &&
        servings &&
        (!Number.isFinite(Number(servings)) || Number(servings) <= 0 || Number(servings) > 1000)
      )
        throw new Error('Use a serving count between 0 and 1,000.');
      const options = {
        ...body,
        paper,
        format: print ? 'pdf' : documentFormat,
        includeNotes: notes,
        includeNutrition: nutrition,
        includeImage: images,
        ...(recipe || plan
          ? {
              includeIngredients: extra.includeIngredients,
              ingredientCheckboxes: extra.ingredientCheckboxes,
              includeMethod: extra.includeMethod,
              includeEquipment: extra.includeEquipment,
              includeSource: extra.includeSource,
            }
          : {}),
        ...(plan ? { includeRecipes: extra.includeRecipes } : {}),
        ...(inventory
          ? {
              includeChecked: extra.includeChecked,
              includeDates: extra.includeDates,
              countColumn: extra.countColumn,
              organizeByStore: Boolean(storeId),
              ...(storeId ? { storeId } : {}),
            }
          : {}),
        ...(recipe && servings ? { servings: Number(servings) } : {}),
      };
      const result = await requestDocument(
        alternative?.path ?? path,
        alternative ? undefined : { method: 'POST', body: JSON.stringify(options) },
      );
      await presentDocument(
        result.bytes,
        `${filename}.${alternative?.extension ?? (print ? 'pdf' : documentFormat)}`,
        result.mimeType,
        print,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Export failed. Try again.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <Surface style={{ gap: 12 }}>
      <Button
        label={open ? 'Hide export options' : 'Print & export'}
        tone="secondary"
        icon="square.and.arrow.down"
        onPress={() => setOpen(!open)}
      />
      {open ? (
        <>
          <Body>Save a document or send it to another app.</Body>
          {recipe ? (
            <ChoiceField
              label="Document format"
              value={documentFormat}
              onChange={setDocumentFormat}
              choices={[
                { value: 'pdf', label: 'Combined PDF' },
                { value: 'zip', label: 'ZIP of recipe PDFs' },
              ]}
            />
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['A4', 'Letter'] as const).map((value) => (
              <Button
                key={value}
                label={`${paper === value ? '✓ ' : ''}${value}`}
                tone="secondary"
                onPress={() => setPaper(value)}
              />
            ))}
          </View>
          <NativeToggle label="Include notes" value={notes} onChange={setNotes} />
          <NativeToggle label="Include nutrition" value={nutrition} onChange={setNutrition} />
          <NativeToggle label="Include images" value={images} onChange={setImages} />
          {recipe || plan
            ? (
                [
                  'includeIngredients',
                  'ingredientCheckboxes',
                  'includeMethod',
                  'includeEquipment',
                  'includeSource',
                ] as const
              ).map((key) => (
                <NativeToggle
                  key={key}
                  label={
                    {
                      includeIngredients: 'Include ingredients',
                      ingredientCheckboxes: 'Ingredient checkboxes',
                      includeMethod: 'Include method',
                      includeEquipment: 'Include equipment',
                      includeSource: 'Include source',
                    }[key]
                  }
                  value={extra[key]}
                  onChange={(value) => setExtra((current) => ({ ...current, [key]: value }))}
                />
              ))
            : null}
          {plan ? (
            <NativeToggle
              label="Include recipe pages"
              value={extra.includeRecipes}
              onChange={(value) => setExtra((current) => ({ ...current, includeRecipes: value }))}
            />
          ) : null}
          {inventory ? (
            <>
              <NativeToggle
                label="Include checked items"
                value={extra.includeChecked}
                onChange={(value) => setExtra((current) => ({ ...current, includeChecked: value }))}
              />
              <NativeToggle
                label="Include dates"
                value={extra.includeDates}
                onChange={(value) => setExtra((current) => ({ ...current, includeDates: value }))}
              />
              <NativeToggle
                label="Count column"
                value={extra.countColumn}
                onChange={(value) => setExtra((current) => ({ ...current, countColumn: value }))}
              />
              <ChoiceField
                label="Organize by store"
                value={storeId}
                onChange={setStoreId}
                choices={[
                  { value: '', label: 'Default order' },
                  ...(stores.data?.profiles ?? []).map((store) => ({
                    value: store.id,
                    label: store.name,
                  })),
                ]}
              />
            </>
          ) : null}
          {recipe ? (
            <FormField
              label="Scale servings (optional)"
              value={servings}
              onChangeText={setServings}
              keyboardType="decimal-pad"
            />
          ) : null}
          <Button
            label={busy ? 'Preparing…' : `Save / share ${documentFormat.toUpperCase()}`}
            disabled={busy}
            onPress={() => void exportFile(false)}
          />
          {Platform.OS !== 'web' ? (
            <Button
              label="Print PDF"
              tone="secondary"
              disabled={busy}
              onPress={() => void exportFile(true)}
            />
          ) : null}
          {formats.map((format) => (
            <Button
              key={format.path}
              label={format.label}
              tone="secondary"
              disabled={busy}
              onPress={() => void exportFile(false, format)}
            />
          ))}
        </>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={{ color: tokens.color.danger }}>
          {error}
        </Text>
      ) : null}
    </Surface>
  );
}
