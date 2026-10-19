import * as React from 'react';
import { Alert, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { useSync } from '@/sync/sync-context';
import { useResource } from '@/hooks/use-resource';
import { useTask } from '@/hooks/use-task';
import {
  AppHeader,
  Body,
  Button,
  EditorialText,
  FormField,
  Screen,
  Surface,
} from '@/components/ui';
import { ResourceState, TaskError } from '@/components/nutrition-workspace-common';
import { preserveRecipeFields, type EditableDetail } from '@/data/recipe-edit';

type Detail = EditableDetail & {
  id: string;
  images: { id: string; altText: string }[];
  tags: string[];
};
const textFields = [
  ['category', 'Categories (comma separated)'],
  ['cuisine', 'Cuisines (comma separated)'],
  ['difficulty', 'Difficulty'],
  ['cookingMethod', 'Cooking method'],
  ['sourceName', 'Source name'],
  ['sourceUrl', 'Source URL'],
  ['originalAuthor', 'Original author'],
  ['tips', 'Cooking tips'],
  ['sharedNotes', 'Shared notes'],
] as const;
const nutritionFields = [
  ['nutritionCalories', 'Calories (kcal)'],
  ['nutritionProteinGrams', 'Protein (g)'],
  ['nutritionCarbohydrateGrams', 'Carbohydrate (g)'],
  ['nutritionFatGrams', 'Fat (g)'],
  ['nutritionSaturatedFatGrams', 'Saturated fat (g)'],
  ['nutritionFiberGrams', 'Fiber (g)'],
  ['nutritionSugarGrams', 'Sugar (g)'],
  ['nutritionSodiumMilligrams', 'Sodium (mg)'],
] as const;
export function RecipeMetadataScreen() {
  const { recipeId } = useLocalSearchParams<{ recipeId: string }>();
  const resource = useResource<{ recipe: Detail }>(
    `/api/v1/recipes/${encodeURIComponent(recipeId)}`,
  );
  return (
    <Screen>
      <AppHeader back />
      <EditorialText variant="title">Recipe details & photos</EditorialText>
      <ResourceState resource={resource} />
      {resource.data ? (
        <MetadataEditor
          key={resource.data.recipe.currentRevision}
          detail={resource.data.recipe}
          reload={resource.reload}
        />
      ) : null}
    </Screen>
  );
}
function MetadataEditor({ detail, reload }: { detail: Detail; reload: () => void }) {
  const { request, assetSource } = useAuth();
  const { refresh } = useSync();
  const task = useTask();
  const [fields, setFields] = React.useState<Record<string, string>>(
    Object.fromEntries(
      [...textFields, ...nutritionFields].map(([key]) => [key, String(detail[key] ?? '')]),
    ),
  );
  const [photoDescription, setPhotoDescription] = React.useState('');
  const [tags, setTags] = React.useState(detail.tags.join(', '));
  const [equipment, setEquipment] = React.useState(
    detail.equipment.map((item) => item.name).join('\n'),
  );
  const save = () =>
    task.run(async () => {
      const lines = {
        ingredients: detail.ingredientGroups.flatMap((group) =>
          group.ingredients.map((ingredient) => ingredient.item),
        ),
        steps: detail.instructionSections.flatMap((section) =>
          section.steps.map((step) => step.body),
        ),
      };
      const payload = preserveRecipeFields(
        detail,
        detail,
        { revision: detail.currentRevision, ...lines },
        lines,
      );
      for (const [field] of nutritionFields) {
        const raw = fields[field].trim();
        const amount = Number(raw);
        if (raw && (!Number.isFinite(amount) || amount < 0 || amount > 100000))
          throw new Error('Nutrition values must be between 0 and 100,000, or blank if unknown.');
      }
      await request(`/api/v1/recipes/${detail.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...payload,
          ...fields,
          tags: tags
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
          equipment: equipment
            .split('\n')
            .map((value) => value.trim())
            .filter(Boolean),
        }),
      });
      await refresh();
      router.back();
    });
  const addPhoto = () =>
    task.run(async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const form = new FormData();
      form.append('image', {
        uri: asset.uri,
        name: asset.fileName ?? 'recipe.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      } as unknown as Blob);
      form.append('altText', photoDescription.trim().slice(0, 180));
      await request(`/api/v1/recipes/${detail.id}/images`, { method: 'POST', body: form });
      reload();
      await refresh();
    });
  return (
    <View style={{ gap: 16 }}>
      <TaskError error={task.error} />
      <Surface style={{ gap: 12 }}>
        <FormField label="Tags (comma separated)" value={tags} onChangeText={setTags} />
        {textFields.map(([key, label]) => (
          <FormField
            key={key}
            label={label}
            value={fields[key]}
            onChangeText={(value) => setFields({ ...fields, [key]: value })}
            multiline={key === 'tips' || key === 'sharedNotes'}
            autoCapitalize={key === 'sourceUrl' ? 'none' : 'sentences'}
          />
        ))}
        <FormField
          label="Equipment (one per line)"
          value={equipment}
          onChangeText={setEquipment}
          multiline
        />
      </Surface>
      <Surface style={{ gap: 12 }}>
        <EditorialText>Recipe nutrition</EditorialText>
        <Body muted>
          These are the recipe’s declared nutrition values. Leave unknown amounts blank.
        </Body>
        {nutritionFields.map(([key, label]) => (
          <FormField
            key={key}
            label={label}
            value={fields[key]}
            onChangeText={(value) => setFields({ ...fields, [key]: value })}
            keyboardType="decimal-pad"
          />
        ))}
      </Surface>
      <Button label="Save recipe details" disabled={task.busy} onPress={() => void save()} />
      <EditorialText>Photos</EditorialText>
      <Button
        label="Generate serving photo with OpenAI"
        tone="secondary"
        disabled={task.busy}
        onPress={() =>
          Alert.alert(
            'Generate a recipe photo?',
            'This sends this recipe to OpenAI and uses your server’s configured paid image provider.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Confirm paid generation',
                onPress: () =>
                  void task.run(async () => {
                    await request(`/api/v1/recipes/${detail.id}/images/generate`, {
                      method: 'POST',
                      body: JSON.stringify({ confirm: true }),
                    });
                    reload();
                    await refresh();
                  }),
              },
            ],
          )
        }
      />
      <FormField
        label="Description for the next photo (optional)"
        value={photoDescription}
        onChangeText={setPhotoDescription}
      />
      <Button
        label="Add photo"
        tone="secondary"
        disabled={task.busy}
        onPress={() => void addPhoto()}
      />
      {detail.images.map((photo) => (
        <Surface key={photo.id} style={{ gap: 10 }}>
          <Image
            source={assetSource(`/api/v1/recipes/${detail.id}/images/${photo.id}`)}
            accessibilityLabel={photo.altText || 'Recipe photo'}
            contentFit="cover"
            style={{ width: '100%', aspectRatio: 1.4, borderRadius: 12 }}
          />
          <Button
            label="Remove photo"
            tone="danger"
            disabled={task.busy}
            onPress={() =>
              Alert.alert('Remove this photo?', 'This removes the photo from the recipe.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Remove',
                  style: 'destructive',
                  onPress: () =>
                    void task.run(async () => {
                      await request(`/api/v1/recipes/${detail.id}/images/${photo.id}`, {
                        method: 'DELETE',
                      });
                      reload();
                      await refresh();
                    }),
                },
              ])
            }
          />
        </Surface>
      ))}
    </View>
  );
}
