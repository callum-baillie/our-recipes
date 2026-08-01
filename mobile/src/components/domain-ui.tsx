import { Alert, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { MealPlanItem, PantryItem, ShoppingItem, ShoppingList } from '@/data/types';
import { Icon, StatusPill, Surface } from '@/components/ui';
import { tokens, editorial } from '@/theme/tokens';
import { useBord } from '@/state/bord-store';
import { useServerActions } from '@/data/server-actions';

export function PantryRow({ item }: { item: PantryItem }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.name}`}
      onPress={() => router.push(`/(app)/(pantry)/${item.id}`)}
      style={({ pressed }) => [
        {
          minHeight: 64,
          flexDirection: 'row',
          alignItems: 'center',
          gap: tokens.space.sm,
          padding: tokens.space.sm,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 12,
          backgroundColor: tokens.color.sage,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={item.icon} fallback="•" color={tokens.color.olive} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          selectable
          style={[tokens.type.footnote, { fontWeight: '700', color: tokens.color.ink }]}
        >
          {item.name}
        </Text>
        <Text selectable style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
          {item.location} · {item.expires}
        </Text>
      </View>
      <Text
        selectable
        style={[
          tokens.type.caption,
          {
            color: item.low ? tokens.color.warning : tokens.color.olive,
            fontWeight: '700',
            fontVariant: ['tabular-nums'],
          },
        ]}
      >
        {item.amount}
      </Text>
      <Icon name="chevron.right" fallback="›" color={tokens.color.inkSecondary} size={14} />
    </Pressable>
  );
}
export function MealCard({ item }: { item: MealPlanItem }) {
  const { state } = useBord();
  const recipe = item.recipeId
    ? state.recipes.find((entry) => entry.id === item.recipeId)
    : undefined;
  const title = recipe?.title ?? item.title ?? 'Planned meal';
  const content = (
    <Surface style={{ flexDirection: 'row', alignItems: 'center', padding: tokens.space.sm }}>
      {recipe ? (
        <Image
          source={recipe.image}
          contentFit="cover"
          style={{ width: 72, height: 58, borderRadius: tokens.radius.small }}
        />
      ) : (
        <View
          style={{
            width: 72,
            height: 58,
            borderRadius: tokens.radius.small,
            backgroundColor: tokens.color.sage,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="photo" fallback="•" color={tokens.color.olive} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          selectable
          style={[tokens.type.caption, { color: tokens.color.olive, fontWeight: '700' }]}
        >
          {item.meal.toUpperCase()}
        </Text>
        <Text
          selectable
          numberOfLines={2}
          style={[
            editorial,
            { color: tokens.color.ink, fontSize: 17, lineHeight: 18, fontWeight: '700' },
          ]}
        >
          {title}
        </Text>
        <Text selectable style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
          {[item.time, `serves ${item.servings}`].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {recipe ? <Icon name="chevron.right" fallback="›" color={tokens.color.inkSecondary} /> : null}
    </Surface>
  );
  if (!recipe) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${title}`}
      onPress={() => router.push(`/(app)/(recipes)/${recipe.id}`)}
      style={({ pressed }) => ({ opacity: pressed ? 0.76 : 1 })}
    >
      {content}
    </Pressable>
  );
}
type HouseholdNutritionComparison = {
  periodDays: number;
  members: {
    key: string;
    label: string;
    status: string;
    observedDays: number;
    confirmedCount: number;
    averageCompleteness: number | null;
    nutrients: {
      nutrientCode: string;
      normalizedPercent: number;
      status: string;
    }[];
  }[];
};

export function NutritionSummary({ comparison }: { comparison?: unknown }) {
  const summary = comparison as HouseholdNutritionComparison | null | undefined;
  if (!summary?.members?.length) {
    return (
      <Surface elevated>
        <EditorialLabel text="Nutrition cache" />
        <Text style={[tokens.type.footnote, { color: tokens.color.inkSecondary }]}>
          No household comparison is available yet. Pull to refresh after setting up a Nutrition
          profile on the server.
        </Text>
      </Surface>
    );
  }
  return (
    <Surface elevated style={{ gap: tokens.space.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <EditorialLabel text={`${summary.periodDays}-day view`} />
        <StatusPill>Server confirmed</StatusPill>
      </View>
      {summary.members.map((member) => (
        <View key={member.key} style={{ gap: tokens.space.xs }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text
              numberOfLines={1}
              style={[
                tokens.type.footnote,
                { flex: 1, color: tokens.color.ink, fontWeight: '800' },
              ]}
            >
              {member.label}
            </Text>
            <Text
              numberOfLines={2}
              style={[
                tokens.type.caption,
                { flexShrink: 1, color: tokens.color.inkSecondary, textAlign: 'right' },
              ]}
            >
              {member.confirmedCount} confirmed · {member.observedDays} days
            </Text>
          </View>
          {member.nutrients.map((nutrient) => (
            <Macro
              key={nutrient.nutrientCode}
              label={nutrient.nutrientCode.replaceAll('_', ' ')}
              value={`${Math.round(nutrient.normalizedPercent)}% · ${nutrient.status}`}
              percent={`${Math.min(100, Math.max(0, nutrient.normalizedPercent))}%`}
            />
          ))}
          {!member.nutrients.length ? (
            <Text style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
              More confirmed days are needed before Bòrd compares this profile with its goals.
            </Text>
          ) : null}
        </View>
      ))}
    </Surface>
  );
}
function Macro({ label, value, percent }: { label: string; value: string; percent: `${number}%` }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text
        numberOfLines={1}
        style={[
          tokens.type.caption,
          { width: 76, color: tokens.color.ink, textTransform: 'capitalize' },
        ]}
      >
        {label}
      </Text>
      <View
        style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: tokens.color.paperMuted }}
      >
        <View
          style={{
            width: percent,
            height: '100%',
            borderRadius: 3,
            backgroundColor: tokens.color.olive,
          }}
        />
      </View>
      <Text
        numberOfLines={2}
        style={[
          tokens.type.caption,
          {
            maxWidth: 106,
            flexShrink: 1,
            color: tokens.color.inkSecondary,
            fontVariant: ['tabular-nums'],
            textAlign: 'right',
          },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}
function EditorialLabel({ text }: { text: string }) {
  return (
    <Text
      selectable
      style={[
        editorial,
        { fontSize: 22, lineHeight: 26, fontWeight: '700', color: tokens.color.ink },
      ]}
    >
      {text}
    </Text>
  );
}
export function ShoppingListCard({ list }: { list: ShoppingList }) {
  const done = list.items.filter((item) => item.done).length;
  const total = list.items.length;
  const progress = total ? Math.round((done / total) * 100) : 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${list.name}`}
      onPress={() => router.push(`/(app)/(lists)/${list.id}`)}
      style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
    >
      <Surface elevated style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View
          style={{
            width: 52,
            height: 52,
            borderWidth: 5,
            borderColor: tokens.color.sageStrong,
            borderRadius: 26,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={[
              tokens.type.caption,
              { color: tokens.color.olive, fontWeight: '800', fontVariant: ['tabular-nums'] },
            ]}
          >
            {total ? Math.round((done / total) * 100) : 0}%
          </Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            selectable
            style={[
              editorial,
              { fontSize: 21, lineHeight: 22, fontWeight: '700', color: tokens.color.ink },
            ]}
          >
            {list.name}
          </Text>
          <Text selectable style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
            {total - done} items · {done} in cart
          </Text>
          {list.supermarket ? (
            <Text
              numberOfLines={1}
              style={[tokens.type.caption, { color: tokens.color.olive, fontWeight: '700' }]}
            >
              {list.supermarket.name}
              {list.supermarket.locationLabel ? ` · ${list.supermarket.locationLabel}` : ''}
            </Text>
          ) : null}
          <View
            accessibilityLabel={`${progress}% of ${list.name} in cart`}
            style={{
              height: 5,
              borderRadius: tokens.radius.capsule,
              backgroundColor: tokens.color.sage,
              overflow: 'hidden',
              marginTop: 2,
            }}
          >
            <View
              style={{
                width: `${progress}%`,
                height: '100%',
                borderRadius: tokens.radius.capsule,
                backgroundColor: tokens.color.olive,
              }}
            />
          </View>
        </View>
        <Icon name="chevron.right" fallback="›" color={tokens.color.inkSecondary} />
      </Surface>
    </Pressable>
  );
}
export function ShoppingRow({ item, listId }: { item: ShoppingItem; listId: string }) {
  const actions = useServerActions();
  const state = item.shoppingState ?? (item.done ? 'in_cart' : 'to_buy');
  const inCart = state === 'in_cart' || state === 'sourced';
  const cantFind = state === 'cant_find';
  const update = (next: NonNullable<ShoppingItem['shoppingState']>) =>
    void actions
      .setShoppingState(listId, item, next)
      .catch((error) =>
        Alert.alert(
          'Shopping item not changed',
          error instanceof Error ? error.message : 'Try again.',
        ),
      );
  return (
    <View
      style={{
        padding: tokens.space.sm,
        gap: tokens.space.xs,
        opacity: state === 'sourced' ? 0.58 : 1,
      }}
    >
      <Pressable
        onPress={() => update(inCart ? 'to_buy' : 'in_cart')}
        accessibilityRole="checkbox"
        accessibilityLabel={`${item.name}, ${inCart ? 'in cart' : cantFind ? "can't find" : 'to buy'}`}
        accessibilityState={{ checked: inCart }}
        style={({ pressed }) => ({
          minHeight: 44,
          flexDirection: 'row',
          alignItems: 'center',
          gap: tokens.space.sm,
          opacity: pressed ? 0.72 : 1,
        })}
      >
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            borderWidth: 1.5,
            borderColor: inCart
              ? tokens.color.olive
              : cantFind
                ? tokens.color.warning
                : tokens.color.inkTertiary,
            backgroundColor: inCart ? tokens.color.olive : cantFind ? '#FFF4DE' : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {inCart ? (
            <Icon name="checkmark" fallback="✓" color={tokens.color.inverse} size={15} />
          ) : null}
          {cantFind ? (
            <Icon name="xmark.circle" fallback="×" color={tokens.color.warning} size={16} />
          ) : null}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            selectable
            style={[tokens.type.headline, { color: tokens.color.ink, fontSize: 16 }]}
          >
            {item.name}
          </Text>
          <Text
            numberOfLines={2}
            style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}
          >
            {item.source}
          </Text>
        </View>
        <Text
          selectable
          style={[tokens.type.footnote, { color: tokens.color.olive, fontWeight: '800' }]}
        >
          {item.amount}
        </Text>
      </Pressable>
      {state !== 'sourced' ? (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              cantFind ? `Try finding ${item.name} again` : `Mark ${item.name} as can't find`
            }
            onPress={() => update(cantFind ? 'to_buy' : 'cant_find')}
            style={({ pressed }) => ({
              minHeight: 44,
              paddingHorizontal: tokens.space.sm,
              borderRadius: tokens.radius.capsule,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: cantFind
                ? '#FFF4DE'
                : pressed
                  ? tokens.color.paperMuted
                  : 'transparent',
              opacity: pressed ? 0.72 : 1,
            })}
          >
            <Icon
              name={cantFind ? 'arrow.counterclockwise' : 'xmark.circle'}
              color={tokens.color.warning}
              size={16}
            />
            <Text style={[tokens.type.caption, { color: tokens.color.warning, fontWeight: '800' }]}>
              {cantFind ? 'Try again' : "Can't find"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
