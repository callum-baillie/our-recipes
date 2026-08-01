import * as React from 'react';
import {
  Alert,
  ActionSheetIOS,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import {
  AppHeader,
  Body,
  Button,
  Divider,
  EditorialText,
  EmptyState,
  Eyebrow,
  FormField,
  Group,
  Icon,
  IconButton,
  NativeToggle,
  Screen,
  StatusPill,
  Surface,
  TopActions,
  useBottomContentInset,
} from '@/components/ui';
import type { Recipe, RecipeStepCategory } from '@/data/types';
import { RecipeCard } from '@/components/recipe-card';
import { useBord } from '@/state/bord-store';
import { tokens } from '@/theme/tokens';
import { useSync } from '@/sync/sync-context';
import { useServerActions } from '@/data/server-actions';
import { useAuth } from '@/auth/auth-context';
import { randomUUID } from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useRecipeFilters } from '@/state/recipe-filter-store';

type ServerRecipeDraft = {
  recipe: {
    title: string;
    summary: string;
    servings: string;
    prepMinutes: number;
    cookMinutes: number;
    restMinutes?: number;
    sourceName?: string;
    sourceUrl?: string;
    ingredientGroups: {
      ingredients: { quantity: number | string; unit: string; item: string; note: string }[];
    }[];
    instructionSections: { steps: string[] }[];
  };
  provenance: { extractionNotice: string; sourceName: string; sourceUrl?: string | null };
};

function mapServerDraft(draft: ServerRecipeDraft, importId?: string) {
  const recipe = draft.recipe;
  return {
    title: recipe.title,
    summary: recipe.summary,
    servings: recipe.servings,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    restMinutes: recipe.restMinutes,
    ingredients: recipe.ingredientGroups.flatMap((group) =>
      group.ingredients.map((ingredient) =>
        [ingredient.quantity, ingredient.unit, ingredient.item, ingredient.note]
          .filter((value) => value !== '' && value != null)
          .join(' '),
      ),
    ),
    steps: recipe.instructionSections.flatMap((section) => section.steps),
    sourceName: recipe.sourceName ?? draft.provenance.sourceName,
    sourceUrl: recipe.sourceUrl ?? draft.provenance.sourceUrl ?? undefined,
    notice: draft.provenance.extractionNotice,
    importId,
  };
}

export function RecipeLibraryScreen() {
  const { state } = useBord();
  const { refreshing, refresh } = useSync();
  const recipes = state.recipes;
  const { filters } = useRecipeFilters();
  const filter = filters.scope;
  const category = filters.category;
  const selectedTags = filters.selectedTags;
  const selectedCollection = filters.selectedCollection;
  const params = useLocalSearchParams<{ query?: string }>();
  const [query, setQuery] = React.useState(typeof params.query === 'string' ? params.query : '');
  const { width } = useWindowDimensions();
  const filtered = recipes.filter((recipe, index) => {
    const matchesQuery = `${recipe.title} ${recipe.tags.join(' ')} ${recipe.ingredients.join(' ')}`
      .toLowerCase()
      .includes(query.toLowerCase());
    if (!matchesQuery) return false;
    if (category !== 'all' && recipe.meal !== category) return false;
    if (
      selectedTags.length &&
      !selectedTags.every((tag) => recipe.tags.some((candidate) => candidate.toLowerCase() === tag))
    )
      return false;
    if (selectedCollection) {
      const collection = state.collections.find((entry) => entry.id === selectedCollection);
      if (!collection) return false;
      if (collection.recipes && !collection.recipes.some((entry) => entry.id === recipe.id)) {
        return false;
      }
    }
    if (filter === 'favorites') return state.favorites.includes(recipe.id);
    if (filter === 'recent') return index < 6;
    return true;
  });
  const columns = width >= 700 ? 3 : width >= 375 ? 2 : 1;
  const bottomInset = useBottomContentInset();
  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.paper }}>
      <AppHeader title="Recipes" actions={<RecipeCreateMenu />} />
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        data={filtered}
        numColumns={columns}
        key={columns}
        keyExtractor={(recipe) => recipe.id}
        ListHeaderComponent={
          <View style={{ gap: tokens.space.sm, paddingBottom: tokens.space.md }}>
            <Eyebrow>THE SHARED COOKBOOK</Eyebrow>
            <EditorialText variant="display">Recipes</EditorialText>
            <Body muted>{recipes.length} recipes ready for the kitchen.</Body>
            <Search
              value={query}
              onChange={setQuery}
              placeholder="Search recipes or ingredients"
              onAdvanced={() => router.push('/recipe-filters')}
              advancedActive={
                filter !== 'all' ||
                category !== 'all' ||
                selectedTags.length > 0 ||
                Boolean(selectedCollection)
              }
            />
            <Text style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
              {filtered.length} {filtered.length === 1 ? 'recipe' : 'recipes'} match your filters.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="magnifyingglass"
            title="No recipes found"
            detail="Try another ingredient, title, or tag."
          />
        }
        renderItem={({ item }) => (
          <View style={{ flex: 1, padding: 4 }}>
            <RecipeCard recipe={item} />
          </View>
        )}
        contentContainerStyle={{
          padding: tokens.layout.page,
          paddingBottom: bottomInset,
          maxWidth: tokens.layout.maxWidth,
          alignSelf: 'center',
          width: '100%',
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      />
    </View>
  );
}
export function CollectionsScreen() {
  const { state } = useBord();
  const { request } = useAuth();
  const { refresh } = useSync();
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await request('/api/v1/collections', {
        method: 'POST',
        headers: { 'Idempotency-Key': randomUUID() },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          coverImageId: '',
        }),
      });
      await refresh();
      setName('');
      setDescription('');
      setCreating(false);
    } catch (error) {
      Alert.alert('Collection not created', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Screen>
      <AppHeader back />
      <View>
        <Eyebrow>RECIPEBOOK</Eyebrow>
        <EditorialText variant="title">Collections</EditorialText>
        <Body muted>Curated shelves for recipes that belong together.</Body>
      </View>
      <EditorialText variant="section">Your shelves</EditorialText>
      {state.collections.map((collection) => {
        const coverRecipe = collection.coverImage
          ? state.recipes.find((recipe) => recipe.id === collection.coverImage?.recipeId)
          : undefined;
        return (
          <Pressable
            key={collection.id}
            accessibilityRole="button"
            accessibilityLabel={`Open ${collection.name}`}
            onPress={() => router.push(`/(app)/(recipes)/collection/${collection.id}`)}
          >
            <Surface style={{ flexDirection: 'row', alignItems: 'center' }}>
              {coverRecipe ? (
                <Image
                  source={coverRecipe.image}
                  contentFit="cover"
                  style={{ width: 70, height: 54, borderRadius: tokens.radius.small }}
                />
              ) : (
                <View
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 16,
                    backgroundColor: tokens.color.sage,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="books.vertical" color={tokens.color.olive} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <EditorialText variant="section">{collection.name}</EditorialText>
                <Text style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
                  {collection.recipeCount} recipe{collection.recipeCount === 1 ? '' : 's'}
                </Text>
              </View>
              <Icon name="chevron.right" fallback="›" color={tokens.color.inkSecondary} />
            </Surface>
          </Pressable>
        );
      })}
      {!state.collections.length ? (
        <EmptyState
          icon="books.vertical"
          title="No collections yet"
          detail="Create a shelf for recipes you cook together."
        />
      ) : null}
      {creating ? (
        <Surface elevated>
          <EditorialText variant="section">New collection</EditorialText>
          <FormField
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Weeknight favourites"
          />
          <FormField
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="A calm shelf for busy evenings"
            multiline
          />
          <View style={{ flexDirection: 'row', gap: tokens.space.xs }}>
            <View style={{ flex: 1 }}>
              <Button label="Cancel" tone="secondary" onPress={() => setCreating(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={saving ? 'Saving…' : 'Create'}
                disabled={saving || !name.trim()}
                onPress={() => void create()}
              />
            </View>
          </View>
        </Surface>
      ) : (
        <Button
          label="New collection"
          tone="secondary"
          icon="plus"
          onPress={() => setCreating(true)}
        />
      )}
    </Screen>
  );
}

export function CollectionDetailScreen({ collectionId }: { collectionId: string }) {
  const { state } = useBord();
  const { request } = useAuth();
  const { refresh } = useSync();
  const collection = state.collections.find((entry) => entry.id === collectionId);
  if (!collection)
    return (
      <Screen>
        <AppHeader back />
        <EmptyState
          icon="books.vertical"
          title="Collection unavailable"
          detail="Pull to refresh or return to Collections."
        />
      </Screen>
    );
  const recipes = (collection.recipes ?? []).flatMap((entry) => {
    const recipe = state.recipes.find((candidate) => candidate.id === entry.id);
    return recipe ? [recipe] : [];
  });
  const remove = () =>
    Alert.alert('Delete collection?', 'Recipes will stay in your cookbook.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void request(`/api/v1/collections/${encodeURIComponent(collection.id)}`, {
            method: 'DELETE',
          })
            .then(refresh)
            .then(() => router.back())
            .catch((error) =>
              Alert.alert(
                'Collection not deleted',
                error instanceof Error ? error.message : 'Try again.',
              ),
            ),
      },
    ]);
  return (
    <Screen>
      <AppHeader
        back
        actions={
          <IconButton
            label="Delete collection"
            icon="trash"
            appearance="plain"
            color={tokens.color.danger}
            onPress={remove}
          />
        }
      />
      <View>
        <Eyebrow>COLLECTION</Eyebrow>
        <EditorialText variant="title">{collection.name}</EditorialText>
        <Body muted>{collection.description || `${collection.recipeCount} saved recipes`}</Body>
      </View>
      {recipes.map((recipe) => (
        <RecipeCard key={recipe.id} recipe={recipe} />
      ))}
      {!recipes.length ? (
        <EmptyState
          icon="books.vertical"
          title="This shelf is empty"
          detail="Add recipes from a recipe’s More menu."
        />
      ) : null}
    </Screen>
  );
}
export function TagsScreen() {
  const { state } = useBord();
  const { request } = useAuth();
  const { refresh } = useSync();
  const tagRecords = state.tags.length
    ? state.tags
    : Object.entries(
        state.recipes
          .flatMap((recipe) => recipe.tags)
          .reduce<Record<string, number>>(
            (all, tag) => ({ ...all, [tag]: (all[tag] ?? 0) + 1 }),
            {},
          ),
      ).map(([tagName, usageCount]) => ({ name: tagName, usageCount, color: '' }));
  const tags = tagRecords.map(
    (tag) => [tag.name, tag.usageCount, tag.color || tokens.color.olive] as const,
  );
  const [query, setQuery] = React.useState('');
  const [editing, setEditing] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await request(editing ? `/api/v1/tags/${encodeURIComponent(editing)}` : '/api/v1/tags', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({ name: name.trim(), color: '' }),
      });
      await refresh();
      setEditing(null);
      setCreating(false);
      setName('');
    } catch (error) {
      Alert.alert('Tag not saved', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };
  const remove = (tagName: string) =>
    Alert.alert('Delete tag?', 'Recipes stay in your cookbook.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void request(`/api/v1/tags/${encodeURIComponent(tagName)}`, { method: 'DELETE' })
            .then(refresh)
            .catch((error) =>
              Alert.alert('Tag not deleted', error instanceof Error ? error.message : 'Try again.'),
            ),
      },
    ]);
  return (
    <Screen>
      <AppHeader back />
      <View>
        <Eyebrow>HOUSEHOLD ORGANIZATION</Eyebrow>
        <EditorialText variant="title">Tags</EditorialText>
        <Body muted>A shared name and colour make the cookbook easier to scan.</Body>
      </View>
      <Search value={query} onChange={setQuery} placeholder="Search tags" />
      <Group title="TAGS">
        {tags
          .filter(([name]) => name.toLowerCase().includes(query.toLowerCase()))
          .map(([name, count, color], index) => (
            <React.Fragment key={name}>
              {index ? <Divider /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Show ${name} recipes`}
                onPress={() =>
                  router.replace({
                    pathname: '/(app)/(recipes)',
                    params: { query: name },
                  })
                }
                onLongPress={() => {
                  setEditing(name);
                  setName(name);
                }}
                style={{
                  minHeight: 56,
                  padding: tokens.space.md,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: tokens.space.sm,
                }}
              >
                <View style={{ width: 16, height: 16, backgroundColor: color, borderRadius: 5 }} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[tokens.type.footnote, { fontWeight: '800', color: tokens.color.ink }]}
                  >
                    {name}
                  </Text>
                  <Text style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
                    {count} recipes
                  </Text>
                </View>
                <Icon name="chevron.right" fallback="›" color={tokens.color.inkSecondary} />
                <IconButton
                  label={`Edit ${name}`}
                  icon="ellipsis"
                  appearance="plain"
                  onPress={() => {
                    setEditing(name);
                    setName(name);
                  }}
                />
              </Pressable>
            </React.Fragment>
          ))}
      </Group>
      {editing !== null || creating ? (
        <Surface elevated>
          <EditorialText variant="section">{editing ? `Edit ${editing}` : 'New tag'}</EditorialText>
          <FormField label="Tag name" value={name} onChangeText={setName} placeholder="weeknight" />
          <View style={{ flexDirection: 'row', gap: tokens.space.xs }}>
            {editing ? (
              <Button label="Delete" tone="danger" onPress={() => remove(editing)} />
            ) : null}
            <View style={{ flex: 1 }}>
              <Button
                label="Cancel"
                tone="secondary"
                onPress={() => {
                  setEditing(null);
                  setCreating(false);
                  setName('');
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={saving ? 'Saving…' : 'Save'}
                disabled={saving || !name.trim()}
                onPress={() => void submit()}
              />
            </View>
          </View>
        </Surface>
      ) : (
        <Button
          label="New tag"
          icon="plus"
          tone="secondary"
          onPress={() => {
            setCreating(true);
            setName('');
          }}
        />
      )}
      <Surface style={{ backgroundColor: tokens.color.sage }}>
        <Body>Tags stay flexible. Renaming or merging keeps the recipes already using a tag.</Body>
      </Surface>
    </Screen>
  );
}
export function ImportScreen() {
  const { request } = useAuth();
  const { dispatch } = useBord();
  const [pending, setPending] = React.useState(false);
  const upload = async (files: { uri: string; name: string; type: string }[]) => {
    if (!files.length) return;
    setPending(true);
    try {
      const form = new FormData();
      files.slice(0, 4).forEach((file) => form.append('files', file as unknown as Blob));
      form.append('autoOpenAiVision', 'false');
      const result = await request<{ operation: { id: string }; draft: ServerRecipeDraft }>(
        '/api/v1/imports',
        { method: 'POST', body: form },
      );
      dispatch({
        type: 'set-recipe-draft',
        draft: mapServerDraft(result.draft, result.operation.id),
      });
      router.push('/(app)/(recipes)/new');
    } catch (error) {
      Alert.alert('Import not prepared', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setPending(false);
    }
  };
  const takePhotos = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Camera access needed',
        'Allow camera access in Settings to photograph a recipe.',
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!result.canceled)
      await upload(
        result.assets.map((asset, index) => ({
          uri: asset.uri,
          name: asset.fileName ?? `recipe-${index + 1}.jpg`,
          type: asset.mimeType ?? 'image/jpeg',
        })),
      );
  };
  const choosePhotos = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 0.9,
    });
    if (!result.canceled)
      await upload(
        result.assets.map((asset, index) => ({
          uri: asset.uri,
          name: asset.fileName ?? `recipe-${index + 1}.jpg`,
          type: asset.mimeType ?? 'image/jpeg',
        })),
      );
  };
  const chooseDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (!result.canceled)
      await upload(
        result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType ?? 'application/octet-stream',
        })),
      );
  };
  return (
    <Screen>
      <AppHeader back />
      <View>
        <Eyebrow>ADD TO YOUR RECIPEBOOK</Eyebrow>
        <EditorialText variant="title">Import a recipe</EditorialText>
        <Body muted>
          Choose a source. You will review an editable draft before anything is saved.
        </Body>
      </View>
      <Group title="CHOOSE A SOURCE">
        <ImportRow
          icon="camera"
          title="Take photos"
          detail="Capture one or more recipe pages"
          onPress={() => void takePhotos()}
        />
        <Divider />
        <ImportRow
          icon="photo"
          title="Choose from Photos"
          detail="Use images already on this iPhone"
          onPress={() => void choosePhotos()}
        />
        <Divider />
        <ImportRow
          icon="doc"
          title="Choose a document"
          detail="Import a PDF or scanned file"
          onPress={() => void chooseDocument()}
        />
        <Divider />
        <ImportRow
          icon="link"
          title="Import from a link"
          detail="Paste a recipe URL"
          onPress={() => router.push('/(app)/(recipes)/capture?mode=url')}
        />
      </Group>
      <Surface style={{ backgroundColor: tokens.color.paperMuted }}>
        <Body muted>
          {pending
            ? 'Preparing an editable review draft…'
            : 'Bòrd validates files and prepares a review draft. AI is never started automatically, and nothing is saved until you confirm.'}
        </Body>
      </Surface>
    </Screen>
  );
}
function ImportRow({
  icon,
  title,
  detail,
  onPress,
}: {
  icon: string;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        minHeight: 72,
        padding: tokens.space.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.space.sm,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 13,
          backgroundColor: tokens.color.sage,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} fallback="+" color={tokens.color.olive} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[tokens.type.footnote, { color: tokens.color.ink, fontWeight: '800' }]}>
          {title}
        </Text>
        <Text style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>{detail}</Text>
      </View>
      <Icon name="chevron.right" fallback="›" color={tokens.color.inkSecondary} />
    </Pressable>
  );
}
export function CaptureScreen() {
  const { request } = useAuth();
  const { dispatch } = useBord();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [text, setText] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [candidates, setCandidates] = React.useState<
    { index: number; title: string; summary: string; warnings: string[] }[]
  >([]);
  const [mode, setMode] = React.useState<'describe' | 'paste' | 'url'>(
    params.mode === 'paste' || params.mode === 'url' ? params.mode : 'describe',
  );
  const createDraft = async (candidateIndex?: number) => {
    const draft = text.trim();
    if (!draft) {
      Alert.alert(
        'Add recipe details',
        'Describe, paste, or link the recipe before creating a draft.',
      );
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await request<{
        draft?: ServerRecipeDraft;
        candidates?: { index: number; title: string; summary: string; warnings: string[] }[];
      }>('/api/v1/capture-drafts', {
        method: 'POST',
        body: JSON.stringify(
          mode === 'url'
            ? { kind: 'url', url: draft, ...(candidateIndex == null ? {} : { candidateIndex }) }
            : { kind: 'text', text: draft },
        ),
      });
      if (response.candidates?.length) {
        setCandidates(response.candidates);
        return;
      }
      if (!response.draft) throw new Error('The server did not return a review draft.');
      dispatch({
        type: 'set-recipe-draft',
        draft: mapServerDraft(response.draft),
      });
      router.push('/(app)/(recipes)/new');
    } catch (captureError) {
      setError(
        captureError instanceof Error ? captureError.message : 'The draft could not be created.',
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <Screen>
      <AppHeader back />
      <View>
        <Eyebrow>PASTE OR DESCRIBE</Eyebrow>
        <EditorialText variant="title">Turn your notes into a recipe.</EditorialText>
        <Body muted>
          Describe what you want or paste a complete recipe. Bòrd will organize it into an editable
          draft.
        </Body>
      </View>
      <TopActions label="Capture actions">
        <View style={{ flex: 1 }}>
          <Button
            label={pending ? 'Preparing draft…' : 'Create review draft'}
            disabled={pending}
            onPress={() => void createDraft()}
            icon="doc.text.magnifyingglass"
          />
        </View>
      </TopActions>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        <Chip label="Describe" active={mode === 'describe'} onPress={() => setMode('describe')} />
        <Chip label="Paste" active={mode === 'paste'} onPress={() => setMode('paste')} />
        <Chip label="From URL" active={mode === 'url'} onPress={() => setMode('url')} />
      </ScrollView>
      <View>
        <FormField
          label="Recipe text or request"
          value={text}
          onChangeText={setText}
          multiline
          placeholder={
            mode === 'url'
              ? 'https://example.com/recipe'
              : mode === 'paste'
                ? 'Paste the recipe ingredients and instructions…'
                : 'Create a quick lemon pasta for four with spinach, garlic, and ingredients I probably already have…'
          }
        />
      </View>
      {error ? (
        <Surface style={{ backgroundColor: tokens.color.paperMuted }}>
          <Text
            accessibilityRole="alert"
            style={[tokens.type.footnote, { color: tokens.color.danger }]}
          >
            {error}
          </Text>
        </Surface>
      ) : null}
      {candidates.length ? (
        <Group title="CHOOSE A RECIPE">
          {candidates.map((candidate, index) => (
            <React.Fragment key={candidate.index}>
              {index ? <Divider /> : null}
              <ImportRow
                icon="doc.text"
                title={candidate.title}
                detail={candidate.summary || candidate.warnings[0] || 'Review this recipe'}
                onPress={() => void createDraft(candidate.index)}
              />
            </React.Fragment>
          ))}
        </Group>
      ) : null}
    </Screen>
  );
}
export function RecipeFormScreen({ recipe: existing }: { recipe?: Recipe }) {
  const params = useLocalSearchParams<{ draft?: string }>();
  const { state, dispatch } = useBord();
  const captured = existing ? null : state.recipeDraft;
  const actions = useServerActions();
  const { request } = useAuth();
  const { refresh } = useSync();
  const [cover, setCover] = React.useState<{ uri: string; name: string; type: string } | null>(
    null,
  );
  const [title, setTitle] = React.useState(existing?.title ?? captured?.title ?? '');
  const [note, setNote] = React.useState(
    existing?.subtitle ??
      captured?.summary ??
      (typeof params.draft === 'string' ? params.draft : ''),
  );
  const [serves, setServes] = React.useState(
    existing ? String(existing.servings) : (captured?.servings.match(/\d+/u)?.[0] ?? '4'),
  );
  const [prepMinutes, setPrepMinutes] = React.useState(
    String(
      existing?.prepMinutes ??
        captured?.prepMinutes ??
        (existing ? Math.min(existing.minutes, 15) : 15),
    ),
  );
  const [cookMinutes, setCookMinutes] = React.useState(
    String(existing?.cookMinutes ?? captured?.cookMinutes ?? 30),
  );
  const [restMinutes, setRestMinutes] = React.useState(
    String(existing?.restMinutes ?? captured?.restMinutes ?? 0),
  );
  const [ingredients, setIngredients] = React.useState(
    existing?.ingredients.join('\n') ?? captured?.ingredients.join('\n') ?? '',
  );
  const [steps, setSteps] = React.useState(
    existing?.steps.join('\n') ?? captured?.steps.join('\n') ?? '',
  );
  const [keepAwake, setKeepAwake] = React.useState(true);
  const [haptics, setHaptics] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const chooseCover = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setCover({
        uri: asset.uri,
        name: asset.fileName ?? 'recipe-cover.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      });
    }
  };
  const save = async () => {
    const parsedServings = Number.parseInt(serves, 10);
    const parsedPrep = Number.parseInt(prepMinutes, 10);
    const parsedCook = Number.parseInt(cookMinutes, 10);
    const parsedRest = Number.parseInt(restMinutes, 10);
    const ingredientLines = ingredients
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const stepLines = steps
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (!title.trim() || !Number.isFinite(parsedServings) || parsedServings < 1) {
      Alert.alert('Check the recipe', 'Add a recipe name and a valid serving count.');
      return;
    }
    if (!ingredientLines.length || !stepLines.length) {
      Alert.alert('Finish the recipe', 'Add at least one ingredient and one instruction.');
      return;
    }
    setSaving(true);
    try {
      const savedRecipe = await actions.saveRecipe(
        {
          title: title.trim(),
          summary: note.trim(),
          servings: String(parsedServings),
          prepMinutes: Number.isFinite(parsedPrep) ? Math.max(0, parsedPrep) : 0,
          cookMinutes: Number.isFinite(parsedCook) ? Math.max(0, parsedCook) : 0,
          restMinutes: Number.isFinite(parsedRest) ? Math.max(0, parsedRest) : 0,
          ingredients: ingredientLines,
          steps: stepLines,
          sourceName: captured?.sourceName,
          sourceUrl: captured?.sourceUrl,
        },
        existing,
        captured?.importId,
      );
      if (cover) {
        const form = new FormData();
        form.append('image', cover as unknown as Blob);
        form.append('altText', title.trim());
        await request(`/api/v1/recipes/${encodeURIComponent(savedRecipe.id)}/images`, {
          method: 'POST',
          body: form,
        });
        await refresh();
      }
      if (!existing) dispatch({ type: 'set-recipe-draft', draft: null });
      router.back();
    } catch (error) {
      Alert.alert(
        'Recipe not saved',
        error instanceof Error ? error.message : 'Refresh and try again.',
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.paper }}>
      <Screen>
        <AppHeader back />
        <View>
          <Eyebrow>{existing ? 'REVISION 2' : 'A RECIPE WORTH KEEPING'}</Eyebrow>
          <EditorialText variant="title">{existing ? 'Edit recipe' : 'New recipe'}</EditorialText>
          <Body muted>
            {existing
              ? 'Saving keeps the previous version in revision history.'
              : 'Add the details you use at the stove. You can refine anything later.'}
          </Body>
        </View>
        <TopActions label="Recipe editor actions">
          <View style={{ flex: 1 }}>
            <Button
              label={saving ? 'Saving…' : existing ? 'Save changes' : 'Save recipe'}
              disabled={saving}
              onPress={() => void save()}
            />
          </View>
        </TopActions>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a cover photo"
          onPress={() => void chooseCover()}
          style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
        >
          <Surface style={{ alignItems: 'center', padding: tokens.space.lg }}>
            <Icon name="camera" fallback="□" color={tokens.color.olive} size={26} />
            <Text style={[tokens.type.footnote, { color: tokens.color.olive, fontWeight: '800' }]}>
              {cover ? 'Cover photo selected' : 'Add a cover photo'}
            </Text>
            <Text style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
              {cover?.name ?? 'Optional · helps the library scan faster'}
            </Text>
          </Surface>
        </Pressable>
        <Group title="RECIPE CARD">
          <View style={{ padding: tokens.space.md, gap: tokens.space.md }}>
            <FormField
              label="Recipe name"
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Sunday tomato soup"
            />
            <FormField
              label="Short note"
              value={note}
              onChangeText={setNote}
              placeholder="Why it belongs in your cookbook"
            />
            <View style={{ flexDirection: 'row', gap: tokens.space.sm }}>
              <View style={{ flex: 1 }}>
                <FormField
                  label="Serves"
                  value={serves}
                  onChangeText={setServes}
                  keyboardType="number-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <FormField
                  label="Prep minutes"
                  value={prepMinutes}
                  onChangeText={setPrepMinutes}
                  keyboardType="number-pad"
                />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: tokens.space.sm }}>
              <View style={{ flex: 1 }}>
                <FormField
                  label="Cook minutes"
                  value={cookMinutes}
                  onChangeText={setCookMinutes}
                  keyboardType="number-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <FormField
                  label="Rest minutes"
                  value={restMinutes}
                  onChangeText={setRestMinutes}
                  keyboardType="number-pad"
                />
              </View>
            </View>
            <FormField
              label="Ingredients"
              value={ingredients}
              onChangeText={setIngredients}
              multiline
              placeholder="One ingredient per line"
            />
            <FormField
              label="Instructions"
              value={steps}
              onChangeText={setSteps}
              multiline
              placeholder="One step per line"
            />
          </View>
        </Group>
        <Group title="COOK MODE">
          <NativeToggle
            label="Keep screen awake"
            value={keepAwake}
            onChange={setKeepAwake}
            hint="While a cooking step is open"
          />
          <Divider />
          <NativeToggle label="Haptic step confirmations" value={haptics} onChange={setHaptics} />
        </Group>
      </Screen>
    </View>
  );
}
export function RecipeDetailScreen({ recipe }: { recipe: Recipe }) {
  const { state, dispatch } = useBord();
  const { request } = useAuth();
  const { refresh } = useSync();
  const actions = useServerActions();
  const favorite = state.favorites.includes(recipe.id);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const duplicate = () => {
    dispatch({
      type: 'set-recipe-draft',
      draft: {
        title: `${recipe.title} copy`,
        summary: recipe.subtitle,
        servings: String(recipe.servings),
        prepMinutes: recipe.prepMinutes ?? 0,
        cookMinutes: recipe.cookMinutes ?? recipe.minutes,
        restMinutes: recipe.restMinutes ?? 0,
        ingredients: recipe.ingredients,
        steps: recipe.steps,
      },
    });
    router.push('/(app)/(recipes)/new');
  };
  const addToCollection = async (collectionId: string) => {
    setMoreOpen(false);
    try {
      await request(`/api/v1/collections/${encodeURIComponent(collectionId)}/recipes`, {
        method: 'POST',
        body: JSON.stringify({ recipeId: recipe.id }),
      });
      await refresh();
    } catch (error) {
      Alert.alert('Recipe not added', error instanceof Error ? error.message : 'Try again.');
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.paper }}>
      <Screen style={{ paddingTop: 0 }}>
        <AppHeader back />
        <View style={{ marginHorizontal: -tokens.layout.page, height: 300, position: 'relative' }}>
          <Image
            source={recipe.image}
            contentFit="cover"
            style={{ width: '100%', height: '100%' }}
          />
          <View style={{ position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 8 }}>
            <HeroAction
              label={favorite ? 'Remove from saved recipes' : 'Save recipe'}
              icon={favorite ? 'heart.fill' : 'heart'}
              onPress={() =>
                void actions
                  .setFavorite(recipe.id, !favorite)
                  .catch((error) =>
                    Alert.alert(
                      'Favorite not changed',
                      error instanceof Error ? error.message : 'Try again.',
                    ),
                  )
              }
            />
            <HeroAction
              label="More recipe actions"
              icon="ellipsis"
              onPress={() => setMoreOpen((current) => !current)}
            />
          </View>
          {moreOpen ? (
            <View
              accessibilityRole="menu"
              style={{
                position: 'absolute',
                top: 62,
                right: 12,
                width: 240,
                borderRadius: tokens.radius.card,
                backgroundColor: tokens.color.paperRaised,
                borderWidth: 1,
                borderColor: tokens.color.separator,
                boxShadow: tokens.shadow.card,
                overflow: 'hidden',
                zIndex: 3,
              }}
            >
              <RecipeMenuRow
                label="Edit recipe"
                icon="pencil"
                onPress={() => router.push(`/(app)/(recipes)/${recipe.id}/edit`)}
              />
              <RecipeMenuRow label="Duplicate as draft" icon="doc.on.doc" onPress={duplicate} />
              {state.collections.map((collection) => (
                <RecipeMenuRow
                  key={collection.id}
                  label={`Add to ${collection.name}`}
                  icon="books.vertical"
                  onPress={() => void addToCollection(collection.id)}
                />
              ))}
              {!state.collections.length ? (
                <RecipeMenuRow
                  label="Create a collection"
                  icon="plus"
                  onPress={() => router.push('/(app)/(recipes)/collections')}
                />
              ) : null}
            </View>
          ) : null}
        </View>
        <Surface elevated style={{ marginTop: -tokens.space.xxl, gap: tokens.space.md }}>
          <View style={{ gap: 5 }}>
            <Eyebrow>HOUSE RECIPE</Eyebrow>
            <EditorialText variant="title">{recipe.title}</EditorialText>
            <Body muted>{recipe.subtitle}</Body>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.xs }}>
            {recipe.tags.map((tag) => (
              <StatusPill key={tag}>{tag}</StatusPill>
            ))}
          </View>
          <RecipeTimeGrid recipe={recipe} />
          <Text style={[tokens.type.footnote, { color: tokens.color.inkSecondary }]}>
            Serves {recipe.servings} · {recipe.meal}
          </Text>
          <Button
            label="Start cooking"
            icon="fork.knife"
            onPress={() => router.push(`/(app)/(recipes)/${recipe.id}/cook`)}
          />
          <TopActions label="Recipe actions">
            <View style={{ flex: 1 }}>
              <Button
                label="Add to plan"
                tone="secondary"
                icon="calendar"
                onPress={() => router.push('/(app)/(plan)')}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Add to list"
                tone="secondary"
                icon="list.bullet"
                onPress={() => router.push('/(app)/(lists)')}
              />
            </View>
          </TopActions>
        </Surface>
        <EditorialText variant="section">Ingredients</EditorialText>
        <Surface style={{ padding: 0 }}>
          <View
            style={{
              paddingHorizontal: tokens.space.sm,
              paddingVertical: tokens.space.xs,
              flexDirection: 'row',
              gap: tokens.space.md,
            }}
          >
            <Text
              style={[
                tokens.type.caption,
                {
                  width: 82,
                  color: tokens.color.inkSecondary,
                  fontWeight: '800',
                  textAlign: 'right',
                },
              ]}
            >
              AMOUNT
            </Text>
            <Text
              style={[
                tokens.type.caption,
                { flex: 1, color: tokens.color.inkSecondary, fontWeight: '800' },
              ]}
            >
              INGREDIENT
            </Text>
          </View>
          <Divider />
          {recipe.ingredients.map((ingredient, index) => {
            const { amount, name } = splitIngredient(ingredient);
            return (
              <React.Fragment key={`${index}-${ingredient}`}>
                {index ? <Divider /> : null}
                <View
                  style={{
                    minHeight: 44,
                    padding: tokens.space.sm,
                    flexDirection: 'row',
                    gap: tokens.space.md,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={[
                      tokens.type.footnote,
                      {
                        width: 82,
                        color: tokens.color.olive,
                        fontWeight: '800',
                        textAlign: 'right',
                        fontVariant: ['tabular-nums'],
                      },
                    ]}
                  >
                    {amount}
                  </Text>
                  <Text style={[tokens.type.footnote, { flex: 1, color: tokens.color.ink }]}>
                    {name}
                  </Text>
                </View>
              </React.Fragment>
            );
          })}
        </Surface>
        <EditorialText variant="section">Method</EditorialText>
        <Surface style={{ padding: 0 }}>
          {recipe.steps.map((instruction, index) => {
            const category = getStepCategory(instruction, recipe.stepCategories?.[index]);
            return (
              <React.Fragment key={`${index}-${instruction}`}>
                {index ? <Divider /> : null}
                <View
                  style={{
                    minHeight: 64,
                    padding: tokens.space.sm,
                    flexDirection: 'row',
                    gap: tokens.space.sm,
                    alignItems: 'flex-start',
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: tokens.color.sage,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={[
                        tokens.type.caption,
                        { color: tokens.color.olive, fontWeight: '800' },
                      ]}
                    >
                      {index + 1}
                    </Text>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Eyebrow>{STEP_META[category].label.toUpperCase()}</Eyebrow>
                    <Body>{instruction}</Body>
                  </View>
                </View>
              </React.Fragment>
            );
          })}
        </Surface>
      </Screen>
    </View>
  );
}
function RecipeMenuRow({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: tokens.layout.touch,
        paddingHorizontal: tokens.space.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.space.sm,
        backgroundColor: pressed ? tokens.color.sage : tokens.color.paperRaised,
      })}
    >
      <Icon name={icon} color={tokens.color.olive} size={17} />
      <Text
        numberOfLines={1}
        style={[tokens.type.footnote, { color: tokens.color.ink, fontWeight: '700', flex: 1 }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function CookScreen({ recipe }: { recipe: Recipe }) {
  const { state, dispatch } = useBord();
  const { request } = useAuth();
  const { refresh } = useSync();
  const [cookSession, setCookSession] = React.useState<{
    id: string;
    consumptions: { productId: string; quantity: number; unit: string; ingredientName: string }[];
  } | null>(null);
  const [sessionError, setSessionError] = React.useState<string | null>(null);
  const [finishing, setFinishing] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    void request<{
      session: { id: string };
      pantry: {
        recommendedConsumptions: {
          productId: string;
          quantity: number;
          unit: string;
          ingredientName: string;
        }[];
      };
    }>('/api/v1/cook-sessions', {
      method: 'POST',
      body: JSON.stringify({ recipeId: recipe.id, targetServings: recipe.servings }),
    })
      .then((result) => {
        if (!cancelled)
          setCookSession({
            id: result.session.id,
            consumptions: result.pantry.recommendedConsumptions,
          });
      })
      .catch((error) => {
        if (!cancelled)
          setSessionError(error instanceof Error ? error.message : 'Cook session could not start.');
      });
    return () => {
      cancelled = true;
    };
  }, [recipe.id, recipe.servings, request]);
  const complete = (usePantry: boolean) => {
    if (!cookSession) {
      Alert.alert('Cook session is not ready', sessionError ?? 'Wait a moment and try again.');
      return;
    }
    setFinishing(true);
    void request(`/api/v1/cook-sessions/${encodeURIComponent(cookSession.id)}/complete`, {
      method: 'POST',
      body: JSON.stringify({
        confirmed: true,
        consumptions: usePantry
          ? cookSession.consumptions.map(({ productId, quantity, unit }) => ({
              productId,
              quantity,
              unit,
            }))
          : [],
        leftovers: [],
      }),
    })
      .then(refresh)
      .then(() => router.back())
      .catch((error) =>
        Alert.alert('Cooking not completed', error instanceof Error ? error.message : 'Try again.'),
      )
      .finally(() => setFinishing(false));
  };
  const finish = () =>
    Alert.alert(
      'Finish cooking?',
      cookSession?.consumptions.length
        ? `${cookSession.consumptions.length} mapped Pantry ingredient${cookSession.consumptions.length === 1 ? '' : 's'} can be deducted using FEFO.`
        : 'No Pantry deductions were mapped for this recipe.',
      [
        { text: 'Keep cooking', style: 'cancel' },
        ...(cookSession?.consumptions.length
          ? [{ text: 'Finish without Pantry', onPress: () => complete(false) }]
          : []),
        {
          text: cookSession?.consumptions.length ? 'Finish & update Pantry' : 'Finish',
          onPress: () => complete(Boolean(cookSession?.consumptions.length)),
        },
      ],
    );
  const step = state.cook[recipe.id] ?? 0;
  const current = recipe.steps[step];
  const category = current ? getStepCategory(current, recipe.stepCategories?.[step]) : 'prep';
  const categoryMeta = STEP_META[category];
  const bottomInset = useBottomContentInset();
  if (!current) {
    return (
      <Screen>
        <AppHeader back title="Cook mode" />
        <EmptyState
          icon="fork.knife"
          title="No cooking steps yet"
          detail="Edit this recipe and add instructions before starting Cook Mode."
        />
      </Screen>
    );
  }
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: tokens.color.dark,
      }}
    >
      <AppHeader back title="Cook mode" variant="dark" />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          flexGrow: 1,
          padding: tokens.layout.page,
          paddingBottom: bottomInset + 76,
          gap: tokens.space.lg,
        }}
      >
        <View style={{ gap: 5 }}>
          <Eyebrow>
            STEP {step + 1} OF {recipe.steps.length} · {categoryMeta.label.toUpperCase()}
          </Eyebrow>
          <Text
            selectable
            style={{
              fontFamily: 'Georgia',
              color: tokens.color.inverse,
              fontSize: 34,
              lineHeight: 35,
              fontWeight: '700',
            }}
          >
            {recipe.title}
          </Text>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: tokens.color.olivePressed }}>
            <View
              style={{
                height: '100%',
                width: `${((step + 1) / recipe.steps.length) * 100}%`,
                backgroundColor: tokens.color.sageStrong,
                borderRadius: 2,
              }}
            />
          </View>
        </View>
        <View
          style={{ alignItems: 'center', gap: tokens.space.xs, paddingVertical: tokens.space.sm }}
        >
          <View
            style={{
              width: 78,
              height: 78,
              borderRadius: 24,
              backgroundColor: tokens.color.olivePressed,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={categoryMeta.icon} fallback="•" color={tokens.color.inverse} size={36} />
          </View>
          <Text
            style={[tokens.type.caption, { color: tokens.color.sageStrong, fontWeight: '800' }]}
          >
            {categoryMeta.label}
          </Text>
        </View>
        <Surface style={{ padding: tokens.space.lg, gap: tokens.space.md }}>
          <View style={{ flexDirection: 'row', gap: tokens.space.sm }}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: tokens.color.sage,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={[tokens.type.footnote, { color: tokens.color.olive, fontWeight: '800' }]}
              >
                {step + 1}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Eyebrow>{categoryMeta.label.toUpperCase()}</Eyebrow>
              <EditorialText variant="section">{current}</EditorialText>
            </View>
          </View>
          <Body muted>
            Bòrd keeps your progress on this device, so you can leave and return without losing your
            place.
          </Body>
          {sessionError ? (
            <Text
              accessibilityRole="alert"
              style={[tokens.type.caption, { color: tokens.color.gold }]}
            >
              {sessionError}
            </Text>
          ) : null}
        </Surface>
      </ScrollView>
      <View
        style={{
          position: 'absolute',
          left: tokens.layout.page,
          right: tokens.layout.page,
          bottom: Math.max(tokens.space.sm, bottomInset - tokens.space.xxl),
          flexDirection: 'row',
          gap: tokens.space.sm,
          padding: tokens.space.xs,
          borderRadius: tokens.radius.glass,
          backgroundColor: tokens.color.paperRaised,
        }}
      >
        <Button
          label="Timer"
          tone="secondary"
          icon="timer"
          onPress={() =>
            Alert.alert('Timer', 'Choose a timer duration with Siri or the Clock app.')
          }
        />
        <View style={{ flex: 1 }}>
          <Button
            label={
              finishing ? 'Finishing…' : step === recipe.steps.length - 1 ? 'Finish' : 'Next step'
            }
            disabled={finishing}
            onPress={() =>
              step === recipe.steps.length - 1
                ? finish()
                : dispatch({
                    type: 'advance-cook',
                    recipeId: recipe.id,
                    stepCount: recipe.steps.length,
                  })
            }
            icon="chevron.right"
          />
        </View>
      </View>
    </View>
  );
}
function RecipeCreateMenu() {
  const [expanded, setExpanded] = React.useState(false);
  const select = (index: number) => {
    setExpanded(false);
    if (index === 0) router.push('/(app)/(recipes)/new');
    if (index === 1) router.push('/(app)/(recipes)/capture?mode=describe');
    if (index === 2) router.push('/(app)/(recipes)/import');
  };
  const open = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Add to your cookbook',
          options: ['New Recipe', 'Generate a Recipe', 'Import a Recipe', 'Cancel'],
          cancelButtonIndex: 3,
        },
        select,
      );
      return;
    }
    setExpanded((current) => !current);
  };
  return (
    <View style={{ position: 'relative' }}>
      <IconButton label="Add recipe" icon="plus" appearance="plain" onPress={open} />
      {expanded ? (
        <View
          accessibilityRole="menu"
          style={{
            position: 'absolute',
            width: 220,
            right: 0,
            top: 46,
            borderRadius: tokens.radius.control,
            borderWidth: 1,
            borderColor: tokens.color.separator,
            backgroundColor: tokens.color.paperRaised,
            overflow: 'hidden',
            elevation: 8,
            zIndex: 100,
          }}
        >
          {[
            ['New Recipe', 'plus'],
            ['Generate a Recipe', 'sparkles'],
            ['Import a Recipe', 'square.and.arrow.down'],
          ].map(([label, icon], index) => (
            <Pressable
              key={label}
              accessibilityRole="menuitem"
              onPress={() => select(index)}
              style={({ pressed }) => ({
                minHeight: 48,
                paddingHorizontal: tokens.space.sm,
                flexDirection: 'row',
                alignItems: 'center',
                gap: tokens.space.sm,
                borderTopWidth: index ? 1 : 0,
                borderColor: tokens.color.separator,
                backgroundColor: pressed ? tokens.color.secondarySurface : tokens.color.paperRaised,
              })}
            >
              <Icon name={icon} color={tokens.color.olive} size={17} />
              <Text style={[tokens.type.footnote, { color: tokens.color.ink, fontWeight: '800' }]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
function HeroAction({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(24, 53, 37, 0.66)',
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <Icon name={icon} color={tokens.color.inverse} size={18} />
    </Pressable>
  );
}
function RecipeTimeGrid({ recipe }: { recipe: Recipe }) {
  const prep = recipe.prepMinutes ?? Math.min(recipe.minutes, 15);
  const cook = recipe.cookMinutes ?? Math.max(0, recipe.minutes - prep);
  const rest = recipe.restMinutes ?? 0;
  const total = prep + cook + rest;
  return (
    <View style={{ flexDirection: 'row', gap: tokens.space.xs }}>
      {[
        ['Prep', prep],
        ['Cook', cook],
        ['Rest', rest],
        ['Total', total],
      ].map(([label, minutes]) => (
        <View key={label} style={{ flex: 1, gap: 2 }}>
          <Text style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>{label}</Text>
          <Text
            style={[
              tokens.type.footnote,
              { color: tokens.color.ink, fontWeight: '800', fontVariant: ['tabular-nums'] },
            ]}
          >
            {minutes} min
          </Text>
        </View>
      ))}
    </View>
  );
}
const STEP_META = {
  prep: { label: 'Prepare', icon: 'fork.knife' },
  chop: { label: 'Chop', icon: 'knife' },
  mix: { label: 'Mix', icon: 'arrow.triangle.2.circlepath' },
  boil: { label: 'Boil', icon: 'flame' },
  simmer: { label: 'Simmer', icon: 'flame' },
  roast: { label: 'Roast', icon: 'oven' },
  bake: { label: 'Bake', icon: 'oven' },
  fry: { label: 'Fry', icon: 'frying.pan' },
  rest: { label: 'Rest', icon: 'timer' },
  serve: { label: 'Serve', icon: 'fork.knife' },
} as const;
function getStepCategory(step: string, supplied?: RecipeStepCategory) {
  if (supplied && supplied in STEP_META) return supplied;
  const normalized = step.toLowerCase();
  if (/\b(chop|dice|slice|mince|cut)\b/u.test(normalized)) return 'chop';
  if (/\b(boil|blanch)\b/u.test(normalized)) return 'boil';
  if (/\b(simmer|reduce)\b/u.test(normalized)) return 'simmer';
  if (/\b(roast|broil)\b/u.test(normalized)) return 'roast';
  if (/\b(bake|oven)\b/u.test(normalized)) return 'bake';
  if (/\b(fry|sauté|saute|sear)\b/u.test(normalized)) return 'fry';
  if (/\b(mix|whisk|stir|fold|combine)\b/u.test(normalized)) return 'mix';
  if (/\b(rest|cool|stand|chill)\b/u.test(normalized)) return 'rest';
  if (/\b(serve|plate|garnish)\b/u.test(normalized)) return 'serve';
  return 'prep';
}
function splitIngredient(ingredient: string) {
  const parts = ingredient.trim().split(/\s+/u);
  const units = new Set([
    'cup',
    'cups',
    'tbsp',
    'tsp',
    'g',
    'kg',
    'ml',
    'l',
    'can',
    'cans',
    'bag',
    'bags',
  ]);
  const startsWithAmount = /^[\d¼½¾⅓⅔⅛⅜⅝⅞]/u.test(parts[0] ?? '');
  if (!startsWithAmount) return { amount: '—', name: ingredient };
  const amountParts = units.has(parts[1]?.toLowerCase() ?? '')
    ? parts.slice(0, 2)
    : parts.slice(0, 1);
  return {
    amount: amountParts.join(' '),
    name: parts.slice(amountParts.length).join(' '),
  };
}
function Search({
  value,
  onChange,
  placeholder,
  onAdvanced,
  advancedActive = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  onAdvanced?: () => void;
  advancedActive?: boolean;
}) {
  return (
    <View
      style={{
        minHeight: 44,
        backgroundColor: tokens.color.surface,
        borderRadius: tokens.radius.control,
        borderWidth: 1,
        borderColor: tokens.color.separator,
        paddingHorizontal: tokens.space.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingRight: 4,
      }}
    >
      <Icon name="magnifyingglass" fallback="⌕" color={tokens.color.inkSecondary} size={16} />
      <TextInputLike value={value} onChange={onChange} placeholder={placeholder} />
      {onAdvanced ? (
        <IconButton
          label="Open advanced recipe search"
          icon="slider.horizontal.3"
          fallback="☷"
          appearance="plain"
          color={advancedActive ? tokens.color.olive : tokens.color.inkSecondary}
          onPress={onAdvanced}
        />
      ) : null}
    </View>
  );
}
function TextInputLike({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <TextInput
      accessibilityLabel={placeholder}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={tokens.color.inkTertiary}
      style={[tokens.type.footnote, { flex: 1, color: tokens.color.ink, minHeight: 42 }]}
    />
  );
}
function Chip({
  label,
  active = false,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: tokens.layout.touch,
        paddingHorizontal: 12,
        borderRadius: tokens.radius.capsule,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active
          ? tokens.color.olive
          : pressed
            ? tokens.color.sage
            : tokens.color.surface,
        borderWidth: active ? 0 : 1,
        borderColor: tokens.color.separator,
      })}
    >
      <Text
        style={[
          tokens.type.caption,
          { color: active ? tokens.color.inverse : tokens.color.ink, fontWeight: '800' },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
