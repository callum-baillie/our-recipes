import * as React from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, EditorialText, Eyebrow, Icon, IconButton } from '@/components/ui';
import { useBord } from '@/state/bord-store';
import {
  activeRecipeFilterCount,
  defaultRecipeFilters,
  useRecipeFilters,
  type RecipeFilters,
} from '@/state/recipe-filter-store';
import { tokens } from '@/theme/tokens';
import { useReducedMotion } from '@/accessibility/use-reduced-motion';

export function RecipeFilterSheet() {
  const { state } = useBord();
  const { filters, applyFilters } = useRecipeFilters();
  const [draft, setDraft] = React.useState<RecipeFilters>(() => ({
    ...filters,
    selectedTags: [...filters.selectedTags],
  }));
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const expandedHeight = Math.max(0, windowHeight - Math.max(insets.top, tokens.space.sm));
  const compactHeight = Math.min(expandedHeight, Math.max(560, windowHeight * 0.72));
  const sheetHeight = useSharedValue(compactHeight);
  const dragStartHeight = useSharedValue(compactHeight);
  const activeCount = activeRecipeFilterCount(draft);
  const categories = React.useMemo(
    () =>
      [...new Set(state.recipes.map((recipe) => recipe.meal.trim()).filter(Boolean))].sort(
        (left, right) => left.localeCompare(right),
      ),
    [state.recipes],
  );
  const tags = React.useMemo(() => {
    const labels = new Map<string, string>();
    state.tags.forEach((tag) => labels.set(tag.name.toLowerCase(), tag.name));
    state.recipes.forEach((recipe) =>
      recipe.tags.forEach((tag) => {
        if (tag.trim()) labels.set(tag.toLowerCase(), tag);
      }),
    );
    return [...labels.values()].sort((left, right) => left.localeCompare(right));
  }, [state.recipes, state.tags]);

  React.useEffect(() => {
    sheetHeight.value = Math.min(Math.max(sheetHeight.value, compactHeight), expandedHeight);
  }, [compactHeight, expandedHeight, sheetHeight]);

  const snap = React.useCallback(
    (target: 'compact' | 'expanded') => {
      const next = target === 'expanded' ? expandedHeight : compactHeight;
      sheetHeight.value = reduceMotion
        ? next
        : withSpring(next, { damping: 24, stiffness: 240, mass: 0.8 });
    },
    [compactHeight, expandedHeight, reduceMotion, sheetHeight],
  );
  const gesture = React.useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-8, 8])
        .onBegin(() => {
          dragStartHeight.value = sheetHeight.value;
        })
        .onUpdate((event) => {
          sheetHeight.value = Math.min(
            expandedHeight,
            Math.max(compactHeight, dragStartHeight.value - event.translationY),
          );
        })
        .onEnd((event) => {
          const midpoint = compactHeight + (expandedHeight - compactHeight) * 0.5;
          const next =
            event.velocityY < -350 || sheetHeight.value >= midpoint
              ? expandedHeight
              : compactHeight;
          sheetHeight.value = reduceMotion
            ? next
            : withSpring(next, { damping: 24, stiffness: 240, mass: 0.8 });
        }),
    [compactHeight, dragStartHeight, expandedHeight, reduceMotion, sheetHeight],
  );
  const animatedStyle = useAnimatedStyle(() => ({ height: sheetHeight.value }));
  const close = React.useCallback(() => router.back(), []);
  const save = React.useCallback(() => {
    applyFilters(draft);
    router.back();
  }, [applyFilters, draft]);
  const toggleTag = (tag: string) => {
    const normalized = tag.toLowerCase();
    setDraft((current) => ({
      ...current,
      selectedTags: current.selectedTags.includes(normalized)
        ? current.selectedTags.filter((entry) => entry !== normalized)
        : [...current.selectedTags, normalized],
    }));
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close recipe filters"
          onPress={close}
          style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(20, 22, 17, 0.3)' }}
        />
        <Animated.View
          entering={reduceMotion ? undefined : FadeInUp.duration(180)}
          style={[
            {
              overflow: 'hidden',
              backgroundColor: tokens.color.paper,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              borderCurve: 'continuous',
            },
            animatedStyle,
          ]}
        >
          <GestureDetector gesture={gesture}>
            <View
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel="Recipe filter drawer height"
              accessibilityHint="Swipe up to expand or down to collapse"
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(event) =>
                snap(event.nativeEvent.actionName === 'increment' ? 'expanded' : 'compact')
              }
              style={{ minHeight: 28, alignItems: 'center', justifyContent: 'center' }}
            >
              <View
                style={{
                  width: 38,
                  height: 5,
                  borderRadius: tokens.radius.capsule,
                  backgroundColor: tokens.color.inkTertiary,
                  opacity: 0.55,
                }}
              />
            </View>
          </GestureDetector>

          <View
            style={{
              paddingHorizontal: tokens.layout.page,
              paddingBottom: tokens.space.sm,
              flexDirection: 'row',
              alignItems: 'center',
              gap: tokens.space.sm,
              flexShrink: 0,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Eyebrow>ADVANCED SEARCH</Eyebrow>
              <EditorialText variant="section">Refine recipes</EditorialText>
            </View>
            {activeCount ? (
              <View
                style={{
                  minWidth: 28,
                  height: 28,
                  paddingHorizontal: tokens.space.xs,
                  borderRadius: tokens.radius.capsule,
                  backgroundColor: tokens.color.sage,
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
                  {activeCount}
                </Text>
              </View>
            ) : null}
            <IconButton
              label="Close recipe filters"
              icon="xmark"
              appearance="plain"
              onPress={close}
            />
          </View>

          <ScrollView
            contentInsetAdjustmentBehavior="never"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: tokens.layout.page,
              paddingBottom: tokens.space.lg,
              gap: tokens.space.lg,
            }}
            style={{ flex: 1 }}
          >
            <FilterSection title="SHOW" description="Choose which part of your cookbook to search.">
              <FilterChoice
                label="All recipes"
                icon="books.vertical"
                active={draft.scope === 'all'}
                onPress={() => setDraft((current) => ({ ...current, scope: 'all' }))}
              />
              <FilterChoice
                label="Favorites"
                icon="heart"
                active={draft.scope === 'favorites'}
                onPress={() => setDraft((current) => ({ ...current, scope: 'favorites' }))}
              />
              <FilterChoice
                label="Recently added"
                icon="clock"
                active={draft.scope === 'recent'}
                onPress={() => setDraft((current) => ({ ...current, scope: 'recent' }))}
              />
            </FilterSection>

            <FilterSection title="CATEGORY">
              <FilterChoice
                label="All categories"
                icon="fork.knife"
                active={draft.category === 'all'}
                onPress={() => setDraft((current) => ({ ...current, category: 'all' }))}
              />
              {categories.map((category) => (
                <FilterChoice
                  key={category}
                  label={category}
                  icon="fork.knife"
                  active={draft.category === category}
                  onPress={() => setDraft((current) => ({ ...current, category }))}
                />
              ))}
            </FilterSection>

            <View style={{ gap: tokens.space.xs }}>
              <Eyebrow>TAGS</Eyebrow>
              <Body muted>Select every tag that matching recipes must include.</Body>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.xs }}>
                <FilterPill
                  label="Any tag"
                  active={draft.selectedTags.length === 0}
                  onPress={() => setDraft((current) => ({ ...current, selectedTags: [] }))}
                />
                {tags.map((tag) => (
                  <FilterPill
                    key={tag}
                    label={tag}
                    active={draft.selectedTags.includes(tag.toLowerCase())}
                    onPress={() => toggleTag(tag)}
                  />
                ))}
              </View>
            </View>

            <FilterSection title="COLLECTION">
              <FilterChoice
                label="All collections"
                icon="folder"
                active={!draft.selectedCollection}
                onPress={() => setDraft((current) => ({ ...current, selectedCollection: null }))}
              />
              {state.collections.map((collection) => (
                <FilterChoice
                  key={collection.id}
                  label={collection.name}
                  icon="folder"
                  active={draft.selectedCollection === collection.id}
                  onPress={() =>
                    setDraft((current) => ({
                      ...current,
                      selectedCollection: collection.id,
                    }))
                  }
                />
              ))}
            </FilterSection>
          </ScrollView>

          <View
            style={{
              paddingHorizontal: tokens.layout.page,
              paddingTop: tokens.space.sm,
              paddingBottom: Math.max(insets.bottom, tokens.space.sm),
              borderTopWidth: 1,
              borderTopColor: tokens.color.separator,
              backgroundColor: tokens.color.paper,
              flexDirection: 'row',
              gap: tokens.space.xs,
              flexShrink: 0,
            }}
          >
            <View style={{ flex: 1 }}>
              <Button
                label="Clear filters"
                tone="secondary"
                onPress={() => setDraft({ ...defaultRecipeFilters, selectedTags: [] })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Save filters" onPress={save} />
            </View>
          </View>
        </Animated.View>
      </View>
    </GestureHandlerRootView>
  );
}

function FilterSection({
  title,
  description,
  children,
}: React.PropsWithChildren<{ title: string; description?: string }>) {
  return (
    <View style={{ gap: tokens.space.xs }}>
      <Eyebrow>{title}</Eyebrow>
      {description ? <Body muted>{description}</Body> : null}
      <View
        style={{
          overflow: 'hidden',
          borderRadius: tokens.radius.card,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderColor: tokens.color.separator,
          backgroundColor: tokens.color.surface,
        }}
      >
        {React.Children.map(children, (child, index) => (
          <View
            style={
              index ? { borderTopWidth: 1, borderTopColor: tokens.color.separator } : undefined
            }
          >
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}

function FilterChoice({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 50,
        paddingHorizontal: tokens.space.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.space.sm,
        backgroundColor: active
          ? tokens.color.sage
          : pressed
            ? tokens.color.secondarySurface
            : tokens.color.surface,
      })}
    >
      <Icon name={icon} color={active ? tokens.color.olive : tokens.color.inkSecondary} size={18} />
      <Text style={[tokens.type.callout, { flex: 1, color: tokens.color.ink, fontWeight: '600' }]}>
        {label}
      </Text>
      {active ? <Icon name="checkmark" color={tokens.color.olive} size={18} /> : null}
    </Pressable>
  );
}

function FilterPill({
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
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: tokens.layout.touch,
        paddingHorizontal: tokens.space.md,
        borderRadius: tokens.radius.capsule,
        borderWidth: active ? 0 : 1,
        borderColor: tokens.color.separator,
        backgroundColor: active
          ? tokens.color.olive
          : pressed
            ? tokens.color.sage
            : tokens.color.surface,
        alignItems: 'center',
        justifyContent: 'center',
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
