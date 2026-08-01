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
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import {
  Body,
  Button,
  Divider,
  EditorialText,
  EmptyState,
  Eyebrow,
  FormField,
  AppHeader,
  Group,
  Icon,
  IconButton,
  Screen,
  StatusPill,
  Surface,
  TopActions,
  useBottomContentInset,
} from '@/components/ui';
import {
  NutritionGoalChart,
  type HouseholdNutritionComparison,
} from '@/components/nutrition-chart';
import {
  MealCard,
  NutritionSummary,
  PantryRow,
  ShoppingListCard,
  ShoppingRow,
} from '@/components/domain-ui';
import { useBord } from '@/state/bord-store';
import { tokens } from '@/theme/tokens';
import { useSync } from '@/sync/sync-context';
import { useAuth } from '@/auth/auth-context';
import { useServerActions } from '@/data/server-actions';

export function PantryScreen() {
  const { state } = useBord();
  const { refreshing, refresh } = useSync();
  const [scope, setScope] = React.useState('All');
  const bottomInset = useBottomContentInset();
  const data =
    scope === 'All' ? state.pantry : state.pantry.filter((item) => item.location === scope);
  const pantrySummary = [
    [String(state.pantry.length), 'items'],
    [
      String(
        state.pantry.filter((item) => /expir|use soon|today|tomorrow/iu.test(item.expires)).length,
      ),
      'expiring',
    ],
    [String(state.pantry.filter((item) => item.low).length), 'low stock'],
  ];
  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.paper }}>
      <AppHeader title="Pantry" />
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        data={data}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={{ gap: tokens.space.md, paddingBottom: tokens.space.sm }}>
            <View>
              <Eyebrow>HOUSEHOLD INVENTORY</Eyebrow>
              <EditorialText variant="display">Pantry</EditorialText>
              <Body muted>
                Know what is on hand, what needs using, and where every batch lives.
              </Body>
            </View>
            <TopActions label="Pantry actions">
              <View style={{ flex: 1 }}>
                <Button
                  label="Scan item"
                  icon="barcode.viewfinder"
                  onPress={() => router.push('/scanner?target=pantry')}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Add manually"
                  tone="secondary"
                  icon="plus"
                  onPress={() => router.push('/(app)/(pantry)/new')}
                />
              </View>
            </TopActions>
            <Surface style={{ padding: 0, flexDirection: 'row' }}>
              {pantrySummary.map(([value, label]) => (
                <View
                  key={label}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    padding: tokens.space.sm,
                    borderRightWidth: label === 'low stock' ? 0 : 1,
                    borderColor: tokens.color.separator,
                  }}
                >
                  <Text
                    style={[
                      tokens.type.section,
                      { color: tokens.color.ink, fontVariant: ['tabular-nums'] },
                    ]}
                  >
                    {value}
                  </Text>
                  <Text style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
                    {label}
                  </Text>
                </View>
              ))}
            </Surface>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {['All', 'Pantry', 'Fridge', 'Freezer'].map((entry) => (
                <Pressable
                  key={entry}
                  accessibilityRole="button"
                  accessibilityState={{ selected: scope === entry }}
                  accessibilityLabel={`Show ${entry.toLowerCase()} items`}
                  onPress={() => setScope(entry)}
                  style={{
                    minHeight: tokens.layout.touch,
                    paddingHorizontal: tokens.space.md,
                    borderRadius: tokens.radius.capsule,
                    justifyContent: 'center',
                    backgroundColor: scope === entry ? tokens.color.olive : tokens.color.surface,
                    borderWidth: scope === entry ? 0 : 1,
                    borderColor: tokens.color.separator,
                  }}
                >
                  <Text
                    style={[
                      tokens.type.caption,
                      {
                        color: scope === entry ? tokens.color.inverse : tokens.color.ink,
                        fontWeight: '800',
                      },
                    ]}
                  >
                    {entry}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                justifyContent: 'space-between',
              }}
            >
              <EditorialText variant="section">Use soon</EditorialText>
              <Button label="See all" tone="quiet" onPress={() => setScope('All')} />
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="archivebox"
            title="Nothing in this location"
            detail="Add an item or choose another pantry location."
          />
        }
        renderItem={({ item, index }) => (
          <Surface style={{ padding: 0, marginBottom: index === data.length - 1 ? 0 : 8 }}>
            <PantryRow item={item} />
          </Surface>
        )}
        contentContainerStyle={{
          padding: tokens.layout.page,
          paddingBottom: bottomInset,
          maxWidth: tokens.layout.maxWidth,
          width: '100%',
          alignSelf: 'center',
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      />
    </View>
  );
}
export function PantryAddScreen() {
  const params = useLocalSearchParams<{ name?: string }>();
  const { request } = useAuth();
  const { refresh } = useSync();
  const [products, setProducts] = React.useState<{ id: string; displayName: string }[]>([]);
  const [locations, setLocations] = React.useState<
    { id: string; name: string; storageType: string }[]
  >([]);
  const [name, setName] = React.useState(typeof params.name === 'string' ? params.name : '');
  const [quantity, setQuantity] = React.useState('1');
  const [unit, setUnit] = React.useState('each');
  const [locationId, setLocationId] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    void Promise.all([
      request<{ products: { id: string; displayName: string }[] }>('/api/v1/pantry/products'),
      request<{ locations: { id: string; name: string; storageType: string }[] }>(
        '/api/v1/pantry/locations',
      ),
    ])
      .then(([productResult, locationResult]) => {
        setProducts(productResult.products);
        setLocations(locationResult.locations);
        setLocationId((current) => current || locationResult.locations[0]?.id || '');
      })
      .catch((error) =>
        Alert.alert(
          'Pantry setup unavailable',
          error instanceof Error ? error.message : 'Try again.',
        ),
      );
  }, [request]);
  const save = async () => {
    const amount = Number(quantity);
    if (!name.trim() || !Number.isFinite(amount) || amount <= 0 || !unit.trim() || !locationId) {
      Alert.alert('Check the item', 'Enter a name, positive amount, unit, and location.');
      return;
    }
    setSaving(true);
    try {
      let product = products.find(
        (entry) => entry.displayName.toLowerCase() === name.trim().toLowerCase(),
      );
      if (!product) {
        const storageType =
          locations.find((entry) => entry.id === locationId)?.storageType ?? 'pantry';
        const created = await request<{ product: { id: string; displayName: string } }>(
          '/api/v1/pantry/products',
          {
            method: 'POST',
            headers: { 'Idempotency-Key': randomUUID() },
            body: JSON.stringify({
              displayName: name.trim(),
              brand: '',
              variant: '',
              category: '',
              subcategory: '',
              aliases: [],
              defaultInventoryUnit: unit.trim(),
              defaultPackageAmount: null,
              defaultPackageUnit: '',
              defaultStorageType: storageType,
              dietaryTags: [],
              allergens: [],
              storageInstructions: '',
              defaultShelfLifeDays: null,
              shelfLifeAfterOpeningDays: null,
              isStaple: false,
              preferredBrand: '',
              preferredStore: '',
              minimumStock: null,
              targetStock: null,
              reorderThreshold: null,
              preferredPurchaseQuantity: null,
              stockUnit: unit.trim(),
              suggestGroceryRestock: false,
              archived: false,
            }),
          },
        );
        product = created.product;
      }
      await request('/api/v1/pantry/batches', {
        method: 'POST',
        headers: { 'Idempotency-Key': randomUUID() },
        body: JSON.stringify({
          productId: product.id,
          quantityRemaining: amount,
          originalQuantity: amount,
          unit: unit.trim(),
          packageCount: null,
          amountPerPackage: null,
          packageUnit: '',
          approximateState: null,
          locationId,
          sublocation: '',
          purchaseDate: '',
          bestBeforeDate: '',
          useByDate: '',
          sellByDate: '',
          openedDate: '',
          frozenDate: '',
          thawedDate: '',
          preparedDate: '',
          expiryPrecision: 'unknown',
          status: 'unopened',
          purchasePriceCents: null,
          source: 'Bòrd mobile',
          notes: '',
          excludeFromGrocery: false,
          sourceRecipeId: '',
          sourceMealPlanEntryId: '',
          sourceShoppingListItemId: '',
        }),
      });
      await refresh();
      router.back();
    } catch (error) {
      Alert.alert('Item not added', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Screen>
      <AppHeader back />
      <View>
        <Eyebrow>PANTRY INTAKE</Eyebrow>
        <EditorialText variant="title">Add an item</EditorialText>
        <Body muted>
          Record the amount and where it lives. Bòrd will use it for availability and shopping.
        </Body>
      </View>
      <Group title="ITEM">
        <View style={{ padding: tokens.space.md, gap: tokens.space.md }}>
          <FormField
            label="Product"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Chickpeas"
          />
          <View style={{ flexDirection: 'row', gap: tokens.space.sm }}>
            <View style={{ flex: 1 }}>
              <FormField
                label="Amount"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <FormField label="Unit" value={unit} onChangeText={setUnit} placeholder="each" />
            </View>
          </View>
        </View>
      </Group>
      <Group title="LOCATION">
        <View style={{ padding: tokens.space.sm, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {locations.map((location) => (
            <ShopperFilter
              key={location.id}
              label={location.name}
              active={location.id === locationId}
              onPress={() => setLocationId(location.id)}
            />
          ))}
        </View>
      </Group>
      <Button
        label={saving ? 'Adding…' : 'Add to Pantry'}
        disabled={saving || !locations.length}
        icon="plus"
        onPress={() => void save()}
      />
    </Screen>
  );
}
export function PantryDetailScreen({ itemId }: { itemId: string }) {
  const { state } = useBord();
  const actions = useServerActions();
  const item = state.pantry.find((entry) => entry.id === itemId);
  if (!item) {
    return (
      <Screen>
        <AppHeader back />
        <EmptyState
          icon="shippingbox"
          title="Pantry item unavailable"
          detail="It may have been consumed or removed on another device."
        />
      </Screen>
    );
  }
  return (
    <Screen>
      <AppHeader back />
      <View>
        <Eyebrow>{item.location.toUpperCase()}</Eyebrow>
        <EditorialText variant="title">{item.name}</EditorialText>
        <Body muted>Track quantity, freshness, and where this batch is stored.</Body>
      </View>
      <TopActions label={`${item.name} actions`}>
        <View style={{ flex: 1 }}>
          <Button
            label="Use item"
            icon="checkmark"
            onPress={() =>
              Alert.alert('Use this item?', `${item.amount} of ${item.name} will be removed.`, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Use item',
                  style: 'destructive',
                  onPress: () =>
                    void actions
                      .markPantryEmpty(item)
                      .then(() => router.back())
                      .catch((error) =>
                        Alert.alert(
                          'Pantry item not changed',
                          error instanceof Error ? error.message : 'Try again.',
                        ),
                      ),
                },
              ])
            }
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label="Edit"
            tone="secondary"
            icon="pencil"
            onPress={() => router.push(`/(app)/(pantry)/edit/${item.id}`)}
          />
        </View>
      </TopActions>
      <Surface elevated style={{ alignItems: 'center', padding: tokens.space.xl }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 24,
            backgroundColor: tokens.color.sage,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={item.icon} fallback="•" color={tokens.color.olive} size={32} />
        </View>
        <EditorialText variant="section">{item.amount}</EditorialText>
        <StatusPill tone={item.low ? 'warning' : 'olive'}>
          {item.low ? 'Low stock' : 'In stock'}
        </StatusPill>
      </Surface>
      <Group title="BATCH DETAILS">
        <DetailRow label="Location" value={item.location} />
        <Divider />
        <DetailRow label="Freshness" value={item.expires} />
        <Divider />
        <DetailRow
          label="Sync state"
          value={state.offline ? 'Read-only saved copy' : 'Synced with server'}
        />
      </Group>
    </Screen>
  );
}
export function PantryEditScreen({ itemId }: { itemId: string }) {
  const { request } = useAuth();
  const { refresh } = useSync();
  const [batch, setBatch] = React.useState<Record<string, unknown> | null>(null);
  const [locations, setLocations] = React.useState<{ id: string; name: string }[]>([]);
  const [quantity, setQuantity] = React.useState('');
  const [unit, setUnit] = React.useState('');
  const [locationId, setLocationId] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    void Promise.all([
      request<{ batch: Record<string, unknown> }>(
        `/api/v1/pantry/batches/${encodeURIComponent(itemId)}`,
      ),
      request<{ locations: { id: string; name: string }[] }>('/api/v1/pantry/locations'),
    ])
      .then(([batchResult, locationResult]) => {
        const value = batchResult.batch;
        setBatch(value);
        setLocations(locationResult.locations);
        setQuantity(String(value.quantityRemaining ?? ''));
        setUnit(String(value.unit ?? ''));
        setLocationId(String(value.locationId ?? ''));
        setNotes(String(value.notes ?? ''));
      })
      .catch((error) =>
        Alert.alert('Item unavailable', error instanceof Error ? error.message : 'Try again.'),
      );
  }, [itemId, request]);
  const text = (key: string) => String(batch?.[key] ?? '');
  const numberOrNull = (key: string) => (batch?.[key] == null ? null : Number(batch[key]));
  const save = async () => {
    const amount = Number(quantity);
    if (!batch || !Number.isFinite(amount) || amount < 0 || !unit.trim() || !locationId) return;
    setSaving(true);
    try {
      await request(`/api/v1/pantry/batches/${encodeURIComponent(itemId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          productId: text('productId'),
          quantityRemaining: amount,
          originalQuantity: numberOrNull('originalQuantity'),
          unit: unit.trim(),
          packageCount: numberOrNull('packageCount'),
          amountPerPackage: numberOrNull('amountPerPackage'),
          packageUnit: text('packageUnit'),
          approximateState: null,
          locationId,
          sublocation: text('sublocation'),
          purchaseDate: text('purchaseDate'),
          bestBeforeDate: text('bestBeforeDate'),
          useByDate: text('useByDate'),
          sellByDate: text('sellByDate'),
          openedDate: text('openedDate'),
          frozenDate: text('frozenDate'),
          thawedDate: text('thawedDate'),
          preparedDate: text('preparedDate'),
          expiryPrecision: text('expiryPrecision') || 'unknown',
          status: text('status') || 'unopened',
          purchasePriceCents: numberOrNull('purchasePriceCents'),
          source: text('source'),
          notes: notes.trim(),
          excludeFromGrocery: Boolean(batch.excludeFromGrocery),
          sourceRecipeId: text('sourceRecipeId'),
          sourceMealPlanEntryId: text('sourceMealPlanEntryId'),
          sourceShoppingListItemId: text('sourceShoppingListItemId'),
          expectedVersion: Number(batch.version),
        }),
      });
      await refresh();
      router.back();
    } catch (error) {
      Alert.alert('Item not saved', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Screen>
      <AppHeader back />
      <View>
        <Eyebrow>PANTRY ITEM</Eyebrow>
        <EditorialText variant="title">Edit stock</EditorialText>
        <Body muted>Update the amount, location, or household note.</Body>
      </View>
      {batch ? (
        <>
          <Group title="STOCK">
            <View style={{ padding: tokens.space.md, gap: tokens.space.md }}>
              <View style={{ flexDirection: 'row', gap: tokens.space.sm }}>
                <View style={{ flex: 1 }}>
                  <FormField
                    label="Amount"
                    value={quantity}
                    onChangeText={setQuantity}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <FormField label="Unit" value={unit} onChangeText={setUnit} />
                </View>
              </View>
              <FormField label="Notes" value={notes} onChangeText={setNotes} multiline />
            </View>
          </Group>
          <Group title="LOCATION">
            <View
              style={{ padding: tokens.space.sm, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
            >
              {locations.map((location) => (
                <ShopperFilter
                  key={location.id}
                  label={location.name}
                  active={location.id === locationId}
                  onPress={() => setLocationId(location.id)}
                />
              ))}
            </View>
          </Group>
          <Button
            label={saving ? 'Saving…' : 'Save changes'}
            disabled={saving}
            onPress={() => void save()}
          />
        </>
      ) : (
        <Body muted>Loading item…</Body>
      )}
    </Screen>
  );
}
export function PlanScreen() {
  const { state } = useBord();
  const { request } = useAuth();
  const { refresh } = useSync();
  const days = React.useMemo(() => {
    const monday = new Date();
    const weekday = monday.getDay() || 7;
    monday.setDate(monday.getDate() - weekday + 1);
    return Array.from({ length: 5 }, (_, offset) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + offset);
      return {
        short: date.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(),
        long: date.toLocaleDateString(undefined, { weekday: 'long' }),
        date: date.getDate(),
        iso: localIsoDate(date),
        display: date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }),
      };
    });
  }, []);
  const [selectedDate, setSelectedDate] = React.useState(days[0].iso);
  const [addOpen, setAddOpen] = React.useState(false);
  const selected = days.find((entry) => entry.iso === selectedDate) ?? days[0];
  const selectedMeals = state.mealPlan.filter((item) =>
    item.date ? item.date === selectedDate : item.day === selected.date,
  );
  const addMeal = async (recipe: (typeof state.recipes)[number]) => {
    try {
      await request('/api/v1/meal-plan', {
        method: 'POST',
        headers: { 'Idempotency-Key': randomUUID() },
        body: JSON.stringify({
          plannedFor: selectedDate,
          meal: 'Snack',
          recipeId: recipe.id,
          title: '',
          servings: Math.max(1, recipe.servings),
          note: 'Added from Bòrd mobile',
        }),
      });
      await refresh();
      setAddOpen(false);
    } catch (error) {
      Alert.alert('Meal not added', error instanceof Error ? error.message : 'Try again.');
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.paper }}>
      <Screen>
        <AppHeader title="Meal plan" />
        <View>
          <Eyebrow>MEAL PLANNER</Eyebrow>
          <EditorialText variant="display">Meal plan</EditorialText>
          <Body muted>A focused day view keeps the weekly plan easy to scan.</Body>
        </View>
        <TopActions label="Meal plan actions">
          <View style={{ flex: 1 }}>
            <Button
              label="Add meal"
              tone="secondary"
              icon="plus"
              onPress={() => setAddOpen((current) => !current)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Plan with assistant"
              icon="sparkles"
              onPress={() => router.push('/assistant')}
            />
          </View>
        </TopActions>
        {addOpen ? (
          <Group title="CHOOSE A RECIPE">
            <View style={{ padding: tokens.space.sm, gap: tokens.space.xs }}>
              {state.recipes.slice(0, 12).map((recipe) => (
                <Pressable
                  key={recipe.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${recipe.title}`}
                  onPress={() => void addMeal(recipe)}
                  style={({ pressed }) => ({
                    minHeight: tokens.layout.touch,
                    paddingHorizontal: tokens.space.sm,
                    borderRadius: tokens.radius.control,
                    backgroundColor: pressed ? tokens.color.sage : tokens.color.surface,
                    justifyContent: 'center',
                  })}
                >
                  <Text
                    numberOfLines={1}
                    style={[tokens.type.footnote, { color: tokens.color.ink, fontWeight: '700' }]}
                  >
                    {recipe.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Group>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 7 }}>
          {days.map(({ short, date, iso }) => (
            <Pressable
              key={iso}
              accessibilityRole="button"
              accessibilityLabel={`${short}, ${date}`}
              accessibilityState={{ selected: selectedDate === iso }}
              onPress={() => setSelectedDate(iso)}
              style={{
                flex: 1,
                minHeight: 62,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: tokens.radius.control,
                backgroundColor: selectedDate === iso ? tokens.color.sage : tokens.color.surface,
                borderWidth: 1,
                borderColor: selectedDate === iso ? tokens.color.olive : tokens.color.separator,
              }}
            >
              <Text
                style={[
                  tokens.type.caption,
                  { color: tokens.color.inkSecondary, fontWeight: '800' },
                ]}
              >
                {short}
              </Text>
              <Text
                style={[
                  tokens.type.headline,
                  { color: tokens.color.ink, fontVariant: ['tabular-nums'] },
                ]}
              >
                {date}
              </Text>
            </Pressable>
          ))}
        </View>
        <View>
          <EditorialText variant="section">
            {selected.long}, {selected.display}
          </EditorialText>
          <Text style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
            {selectedMeals.length} {selectedMeals.length === 1 ? 'meal' : 'meals'} planned
          </Text>
        </View>
        {selectedMeals.map((item) => (
          <MealCard key={item.id} item={item} />
        ))}
        {!selectedMeals.length ? (
          <EmptyState
            icon="calendar"
            title="Nothing planned"
            detail="Add a meal or generate a plan for this day."
          />
        ) : null}
      </Screen>
    </View>
  );
}
export function NutritionScreen() {
  const { state } = useBord();
  const [selectedDate, setSelectedDate] = React.useState(() => new Date());
  const comparison = state.nutrition.household as HouseholdNutritionComparison | null;
  const members = React.useMemo(() => comparison?.members ?? [], [comparison]);
  const [selectedMemberKey, setSelectedMemberKey] = React.useState<string | undefined>(
    members[0]?.key,
  );
  const [profileMenuOpen, setProfileMenuOpen] = React.useState(false);
  React.useEffect(() => {
    if (!selectedMemberKey && members[0]) setSelectedMemberKey(members[0].key);
  }, [members, selectedMemberKey]);
  const selectedMember = members.find((member) => member.key === selectedMemberKey) ?? members[0];
  const profileLabel = selectedMember?.label ?? nutritionProfileLabel(state.nutrition.profiles[0]);
  const selectedComparison =
    comparison && selectedMember ? { ...comparison, members: [selectedMember] } : comparison;
  const moveDate = (days: number) =>
    setSelectedDate((current) => {
      const next = new Date(current);
      next.setDate(current.getDate() + days);
      return next;
    });
  const chooseProfile = () => {
    if (!members.length) {
      Alert.alert('Nutrition profiles', 'No server-confirmed Nutrition profile is available yet.');
      return;
    }
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Nutrition profile',
          options: [...members.map((member) => member.label), 'Cancel'],
          cancelButtonIndex: members.length,
        },
        (index) => {
          if (members[index]) setSelectedMemberKey(members[index].key);
        },
      );
      return;
    }
    setProfileMenuOpen((current) => !current);
  };
  return (
    <Screen>
      <AppHeader title="Nutrition" />
      <View>
        <Eyebrow>{profileLabel.toUpperCase()}</Eyebrow>
        <EditorialText variant="title">Nutrition</EditorialText>
        <Body muted>Confirmed intake and planned portions stay separate.</Body>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Switch Nutrition profile. Current profile: ${profileLabel}`}
        onPress={chooseProfile}
        style={({ pressed }) => ({
          minHeight: 56,
          borderRadius: tokens.radius.control,
          borderWidth: 1,
          borderColor: tokens.color.separator,
          backgroundColor: pressed ? tokens.color.secondarySurface : tokens.color.surface,
          paddingHorizontal: tokens.space.sm,
          flexDirection: 'row',
          alignItems: 'center',
          gap: tokens.space.sm,
        })}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: tokens.color.sage,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="person" color={tokens.color.olive} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
            Nutrition profile
          </Text>
          <Text style={[tokens.type.headline, { color: tokens.color.ink }]}>{profileLabel}</Text>
        </View>
        <Icon name="chevron.right" color={tokens.color.inkSecondary} size={16} />
      </Pressable>
      {profileMenuOpen ? (
        <Surface style={{ padding: 0, overflow: 'hidden' }}>
          {members.map((member, index) => (
            <React.Fragment key={member.key}>
              {index ? <Divider /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: selectedMember?.key === member.key }}
                onPress={() => {
                  setSelectedMemberKey(member.key);
                  setProfileMenuOpen(false);
                }}
                style={({ pressed }) => ({
                  minHeight: 48,
                  paddingHorizontal: tokens.space.sm,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: tokens.space.sm,
                  backgroundColor:
                    selectedMember?.key === member.key
                      ? tokens.color.sage
                      : pressed
                        ? tokens.color.secondarySurface
                        : tokens.color.surface,
                })}
              >
                <Icon
                  name={selectedMember?.key === member.key ? 'checkmark' : 'person'}
                  color={tokens.color.olive}
                  size={17}
                />
                <Text
                  style={[tokens.type.footnote, { color: tokens.color.ink, fontWeight: '800' }]}
                >
                  {member.label}
                </Text>
              </Pressable>
            </React.Fragment>
          ))}
        </Surface>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space.xs }}>
        <View style={{ flex: 1 }}>
          <Button label="Previous" tone="quiet" icon="chevron.left" onPress={() => moveDate(-1)} />
        </View>
        <View style={{ flex: 1.4 }}>
          <Button
            label={selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            tone="secondary"
            icon="calendar"
            onPress={() => setSelectedDate(new Date())}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Next" tone="quiet" icon="chevron.right" onPress={() => moveDate(1)} />
        </View>
      </View>
      <NutritionGoalChart comparison={state.nutrition.household} memberKey={selectedMember?.key} />
      <NutritionSummary comparison={selectedComparison} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <EditorialText variant="section">Meals</EditorialText>
        <Button
          label="Record"
          icon="plus"
          onPress={() => router.push('/(app)/(nutrition)/record')}
        />
      </View>
      <Group title="CACHED FROM YOUR SERVER">
        <DetailRow label="Nutrition profiles" value={String(state.nutrition.profiles.length)} />
        <Divider />
        <DetailRow
          label="Profile datasets"
          value={String(Object.keys(state.nutrition.profileDetails).length)}
        />
        <Divider />
        <DetailRow
          label="Cache status"
          value={
            state.lastSyncedAt
              ? `Updated ${new Date(state.lastSyncedAt).toLocaleTimeString()}`
              : 'Waiting for refresh'
          }
        />
      </Group>
    </Screen>
  );
}
export function NutritionRecordScreen() {
  const { state } = useBord();
  const { request } = useAuth();
  const { refresh } = useSync();
  const profiles = state.nutrition.profiles.flatMap((profile) => {
    if (!profile || typeof profile !== 'object') return [];
    const value = profile as { id?: unknown; displayName?: unknown; name?: unknown };
    return typeof value.id === 'string'
      ? [
          {
            id: value.id,
            name:
              typeof value.displayName === 'string'
                ? value.displayName
                : typeof value.name === 'string'
                  ? value.name
                  : 'Profile',
          },
        ]
      : [];
  });
  const [profileId, setProfileId] = React.useState(profiles[0]?.id ?? '');
  const [name, setName] = React.useState('');
  const [mealSlot, setMealSlot] = React.useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>(
    'snack',
  );
  const [calories, setCalories] = React.useState('');
  const [protein, setProtein] = React.useState('');
  const [carbs, setCarbs] = React.useState('');
  const [fat, setFat] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    if (!profileId && profiles[0]) setProfileId(profiles[0].id);
  }, [profileId, profiles]);
  const save = async () => {
    const energy = Number(calories);
    if (!profileId || !name.trim() || !Number.isFinite(energy) || energy < 0) {
      Alert.alert('Check the entry', 'Choose a profile and enter a name and calories.');
      return;
    }
    const optional = [
      ['protein', protein],
      ['carbohydrate', carbs],
      ['total_fat', fat],
    ] as const;
    const sourceId = `manual-${randomUUID()}`;
    const values = [
      { nutrientCode: 'energy_kcal', amount: energy },
      ...optional.flatMap(([nutrientCode, raw]) => {
        const amount = Number(raw);
        return raw.trim() && Number.isFinite(amount) && amount >= 0
          ? [{ nutrientCode, amount }]
          : [];
      }),
    ].map((value) => ({
      ...value,
      sourceIds: [sourceId],
      confidence: 1,
      completeness: 1,
      estimated: false,
    }));
    const completeness = values.length / 4;
    setSaving(true);
    try {
      await request(`/api/v1/nutrition/profiles/${encodeURIComponent(profileId)}/intake`, {
        method: 'POST',
        body: JSON.stringify({
          supersedesIntakeRevisionId: null,
          occurredAt: new Date().toISOString(),
          mealSlot,
          state: 'eaten',
          sourceType: 'manual',
          sourceNameSnapshot: name.trim(),
          recipeId: null,
          productId: null,
          recipeCalculationId: null,
          foodNutritionRecordId: null,
          quantity: null,
          unit: null,
          servingCount: 1,
          portionWeightGrams: null,
          provenance: {
            sourceIds: [sourceId],
            sourceDetails: [
              {
                id: sourceId,
                name: name.trim(),
                provider: 'Bòrd mobile',
                version: '',
                sourceRecordKey: '',
              },
            ],
            calculationVersionId: null,
            sourceDigest: sourceId,
            basisType: 'manual_portion',
            basisAmount: 1,
            basisUnit: 'serving',
            confidence: 1,
            completeness,
            estimated: false,
          },
          revisionReason: 'Recorded on Bòrd mobile',
          values,
        }),
      });
      await refresh();
      router.back();
    } catch (error) {
      Alert.alert('Intake not recorded', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Screen>
      <AppHeader back />
      <View>
        <Eyebrow>CONFIRMED INTAKE</Eyebrow>
        <EditorialText variant="title">Record food</EditorialText>
        <Body muted>
          Enter only what you know. Bòrd stores this as a manual nutrition snapshot, separate from
          planned meals.
        </Body>
      </View>
      <Group title="PROFILE">
        <View style={{ padding: tokens.space.sm, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {profiles.map((profile) => (
            <ShopperFilter
              key={profile.id}
              label={profile.name}
              active={profile.id === profileId}
              onPress={() => setProfileId(profile.id)}
            />
          ))}
        </View>
      </Group>
      <Group title="ENTRY">
        <View style={{ padding: tokens.space.md, gap: tokens.space.md }}>
          <FormField
            label="Food or meal"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Oatmeal with berries"
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((slot) => (
              <ShopperFilter
                key={slot}
                label={slot[0].toUpperCase() + slot.slice(1)}
                active={slot === mealSlot}
                onPress={() => setMealSlot(slot)}
              />
            ))}
          </View>
          <FormField
            label="Calories (kcal)"
            value={calories}
            onChangeText={setCalories}
            keyboardType="decimal-pad"
          />
          <View style={{ flexDirection: 'row', gap: tokens.space.xs }}>
            <View style={{ flex: 1 }}>
              <FormField
                label="Protein (g)"
                value={protein}
                onChangeText={setProtein}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <FormField
                label="Carbs (g)"
                value={carbs}
                onChangeText={setCarbs}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <FormField
                label="Fat (g)"
                value={fat}
                onChangeText={setFat}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
        </View>
      </Group>
      <Button
        label={saving ? 'Recording…' : 'Record intake'}
        disabled={saving || !profiles.length}
        onPress={() => void save()}
      />
    </Screen>
  );
}
export function ListsScreen() {
  const { state } = useBord();
  const { request } = useAuth();
  const { refresh } = useSync();
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const active = state.lists.filter((list) => list.status === 'active');
  const planned = state.lists.filter((list) => list.status === 'planned');
  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await request('/api/v1/shopping-lists', {
        method: 'POST',
        headers: { 'Idempotency-Key': randomUUID() },
        body: JSON.stringify({ kind: 'manual', name: name.trim() }),
      });
      await refresh();
      setCreating(false);
      setName('');
    } catch (error) {
      Alert.alert('List not created', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Screen>
      <AppHeader title="Lists" />
      <View style={{ gap: tokens.space.sm }}>
        <Eyebrow>FROM THE PLAN TO THE PANTRY</Eyebrow>
        <EditorialText variant="display">Shopping lists</EditorialText>
        <Body muted>
          Planner-generated lists stay editable, and protected changes remain yours.
        </Body>
      </View>
      {creating ? (
        <Surface elevated>
          <EditorialText variant="section">New shopping list</EditorialText>
          <FormField
            label="List name"
            value={name}
            onChangeText={setName}
            placeholder="Weekend groceries"
          />
          <View style={{ flexDirection: 'row', gap: tokens.space.xs }}>
            <View style={{ flex: 1 }}>
              <Button label="Cancel" tone="secondary" onPress={() => setCreating(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={saving ? 'Creating…' : 'Create list'}
                disabled={saving || !name.trim()}
                onPress={() => void create()}
              />
            </View>
          </View>
        </Surface>
      ) : (
        <Button label="New shopping list" icon="plus" onPress={() => setCreating(true)} />
      )}
      <View>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <EditorialText variant="section">Active lists</EditorialText>
          <StatusPill>{active.length} lists</StatusPill>
        </View>
        <View style={{ gap: tokens.space.sm }}>
          {active.map((list) => (
            <ShoppingListCard key={list.id} list={list} />
          ))}
        </View>
      </View>
      <View style={{ gap: tokens.space.sm }}>
        <EditorialText variant="section">Planned</EditorialText>
        <View style={{ gap: tokens.space.sm }}>
          {planned.map((list) => (
            <ShoppingListCard key={list.id} list={list} />
          ))}
        </View>
      </View>
    </Screen>
  );
}
export function ListDetailScreen({ listId }: { listId: string }) {
  const { state } = useBord();
  const actions = useServerActions();
  const list = state.lists.find((entry) => entry.id === listId);
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState<'to_buy' | 'in_cart' | 'cant_find' | 'all'>('to_buy');
  if (!list) {
    return (
      <Screen>
        <AppHeader back />
        <EmptyState
          icon="list.bullet"
          title="Shopping list unavailable"
          detail="It may have been archived or removed on another device. Pull to refresh and try again."
        />
      </Screen>
    );
  }
  const filteredItems = list.items.filter((item) => {
    const itemState = item.shoppingState ?? (item.done ? 'in_cart' : 'to_buy');
    const matchesFilter =
      filter === 'all' ||
      (filter === 'in_cart'
        ? itemState === 'in_cart' || itemState === 'sourced'
        : itemState === filter);
    return (
      matchesFilter &&
      `${item.name} ${item.aisle} ${item.source}`.toLowerCase().includes(query.toLowerCase())
    );
  });
  const grouped = filteredItems.reduce<Record<string, typeof list.items>>(
    (all, item) => ({ ...all, [item.aisle]: [...(all[item.aisle] ?? []), item] }),
    {},
  );
  const inCart = list.items.filter(
    (item) => item.shoppingState === 'in_cart' || item.shoppingState === 'sourced',
  ).length;
  const cantFind = list.items.filter((item) => item.shoppingState === 'cant_find').length;
  const toBuy = list.items.length - inCart - cantFind;
  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.paper }}>
      <Screen>
        <AppHeader
          back
          actions={
            <IconButton
              label="Scan shopping item"
              icon="barcode.viewfinder"
              appearance="plain"
              onPress={() => router.push(`/scanner?target=shopping&listId=${list.id}`)}
            />
          }
        />
        <View>
          <Eyebrow>SHOPPING LIST</Eyebrow>
          <EditorialText variant="title">{list.name}</EditorialText>
          <Body muted>
            {toBuy} to find · {inCart} in cart · {cantFind} need attention
          </Body>
        </View>
        <Surface style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: tokens.color.sage,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="map" color={tokens.color.olive} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
              Shopping at
            </Text>
            <Text style={[tokens.type.headline, { color: tokens.color.ink }]}>
              {list.supermarket?.name ?? 'No grocery store profile'}
            </Text>
            {list.supermarket?.locationLabel ? (
              <Text style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
                {list.supermarket.locationLabel}
              </Text>
            ) : null}
          </View>
        </Surface>
        <TopActions label="Shopping list actions">
          <View style={{ flex: 1 }}>
            <Button
              label="Scan item"
              tone="secondary"
              icon="barcode.viewfinder"
              onPress={() => router.push(`/scanner?target=shopping&listId=${list.id}`)}
            />
          </View>
          <View style={{ flex: 2 }}>
            <Button
              label="Ready to checkout"
              icon="checkmark"
              disabled={toBuy > 0 || inCart === 0}
              onPress={() =>
                Alert.alert(
                  'Finish this shopping trip?',
                  `${inCart} in-cart item${inCart === 1 ? '' : 's'} will be marked purchased. ${cantFind ? `${cantFind} unavailable item${cantFind === 1 ? '' : 's'} will stay on the list.` : ''}`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Finish',
                      onPress: () =>
                        void actions
                          .completeShopping(list.id, list.items)
                          .catch((error) =>
                            Alert.alert(
                              'List not completed',
                              error instanceof Error ? error.message : 'Try again.',
                            ),
                          ),
                    },
                  ],
                )
              }
            />
          </View>
        </TopActions>
        <Surface style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              borderWidth: 5,
              borderColor: tokens.color.sageStrong,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={[tokens.type.caption, { color: tokens.color.olive, fontWeight: '800' }]}>
              {list.items.length ? Math.round((inCart / list.items.length) * 100) : 0}%
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[tokens.type.footnote, { color: tokens.color.ink, fontWeight: '800' }]}>
              {inCart ? `${inCart} in cart` : 'Ready to shop'}
            </Text>
            <Text style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
              Tap the check to put an item in cart. Mark unavailable items so they stay visible.
            </Text>
          </View>
        </Surface>
        <View
          style={{
            minHeight: 46,
            borderRadius: tokens.radius.control,
            borderWidth: 1,
            borderColor: tokens.color.separator,
            backgroundColor: tokens.color.surface,
            paddingHorizontal: tokens.space.sm,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon name="magnifyingglass" color={tokens.color.inkSecondary} size={17} />
          <TextInput
            accessibilityLabel="Search shopping list"
            value={query}
            onChangeText={setQuery}
            placeholder="Search items or aisles"
            placeholderTextColor={tokens.color.inkTertiary}
            style={[tokens.type.footnote, { flex: 1, minHeight: 44, color: tokens.color.ink }]}
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          <ShopperFilter
            label={`To buy ${toBuy}`}
            active={filter === 'to_buy'}
            onPress={() => setFilter('to_buy')}
          />
          <ShopperFilter
            label={`In cart ${inCart}`}
            active={filter === 'in_cart'}
            onPress={() => setFilter('in_cart')}
          />
          <ShopperFilter
            label={`Can't find ${cantFind}`}
            active={filter === 'cant_find'}
            onPress={() => setFilter('cant_find')}
          />
          <ShopperFilter label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
        </ScrollView>
        {Object.entries(grouped).map(([aisle, items]) => (
          <View key={aisle} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <EditorialText variant="section">{aisle}</EditorialText>
              <Text style={[tokens.type.caption, { color: tokens.color.olive, fontWeight: '800' }]}>
                {items.length}
              </Text>
            </View>
            <Surface style={{ padding: 0 }}>
              {items.map((item, index) => (
                <React.Fragment key={item.id}>
                  {index ? <Divider /> : null}
                  <ShoppingRow item={item} listId={list.id} />
                </React.Fragment>
              ))}
            </Surface>
          </View>
        ))}
        {!filteredItems.length ? (
          <EmptyState
            icon="magnifyingglass"
            title="No items in this view"
            detail="Choose another status or clear your search."
          />
        ) : null}
      </Screen>
    </View>
  );
}
function ShopperFilter({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: tokens.space.sm,
        borderRadius: tokens.radius.capsule,
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
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        minHeight: 52,
        paddingHorizontal: tokens.space.md,
        paddingVertical: tokens.space.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.space.sm,
      }}
    >
      <Text style={[tokens.type.footnote, { flex: 1, color: tokens.color.ink, fontWeight: '700' }]}>
        {label}
      </Text>
      <Text
        style={[
          tokens.type.footnote,
          { color: tokens.color.inkSecondary, textAlign: 'right', flexShrink: 1 },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function nutritionProfileLabel(profile: unknown) {
  if (!profile || typeof profile !== 'object') return 'Household';
  const value = profile as { displayName?: unknown; name?: unknown };
  if (typeof value.displayName === 'string' && value.displayName.trim()) return value.displayName;
  if (typeof value.name === 'string' && value.name.trim()) return value.name;
  return 'Household';
}
