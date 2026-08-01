import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import {
  AppHeader,
  Body,
  Button,
  EditorialText,
  EmptyState,
  Eyebrow,
  Icon,
  Screen,
  Surface,
} from '@/components/ui';
import { RecipeCard } from '@/components/recipe-card';
import { useBord } from '@/state/bord-store';
import { tokens } from '@/theme/tokens';
import { useAuth } from '@/auth/auth-context';
import { useSync } from '@/sync/sync-context';

export function HomeScreen() {
  const { state } = useBord();
  const { user } = useAuth();
  const { refresh, refreshing } = useSync();
  const { width } = useWindowDimensions();
  const recipes = state.recipes;
  const next = recipes.find((recipe) => recipe.id === state.mealPlan[0]?.recipeId) ?? recipes[0];
  return (
    <Screen>
      <AppHeader title="Home" />
      <View style={{ gap: 5 }}>
        <Eyebrow>BÒRD · THE SHARED COOKBOOK</Eyebrow>
        <EditorialText variant="display">
          Welcome to the kitchen{user?.name ? `, ${user.name.split(/\s+/u)[0]}` : ''}.
        </EditorialText>
        <Body muted>
          Keep the recipes you actually cook, plan the week around them, and share one calm kitchen
          notebook.
        </Body>
      </View>
      {next ? (
        <Surface elevated style={{ gap: tokens.space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Eyebrow>UP NEXT</Eyebrow>
              <EditorialText variant="section">{next.title}</EditorialText>
              <Text selectable style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
                {next.minutes} min · {next.meal.toLowerCase()}
              </Text>
            </View>
            <Image
              source={next.image}
              contentFit="cover"
              style={{ width: 96, height: 96, borderRadius: tokens.radius.control }}
              accessibilityLabel={`${next.title} cover`}
            />
          </View>
          <Button label="View meal plan" onPress={() => router.push('/(app)/(plan)')} />
        </Surface>
      ) : (
        <EmptyState
          icon="books.vertical"
          title="Your cookbook is ready"
          detail="Add or import a recipe to start planning meals."
          action={
            <Button
              label="Add a recipe"
              icon="plus"
              onPress={() => router.push('/(app)/(recipes)/new')}
            />
          }
        />
      )}
      <View style={{ gap: tokens.space.sm }}>
        <EditorialText variant="section">Quick actions</EditorialText>
        <View
          style={{
            flexDirection: width < 360 ? 'column' : 'row',
            gap: tokens.space.xs,
          }}
        >
          <Quick
            title="Add recipe"
            icon="plus"
            onPress={() => router.push('/(app)/(recipes)/new')}
          />
          <Quick title="Plan week" icon="calendar" onPress={() => router.push('/(app)/(plan)')} />
          <Quick
            title="Scan pantry"
            icon="barcode.viewfinder"
            onPress={() => router.push('/scanner?target=pantry')}
          />
        </View>
      </View>
      <View style={{ gap: tokens.space.sm }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <EditorialText variant="section">Recent recipes</EditorialText>
          <Button label="See all" tone="quiet" onPress={() => router.push('/(app)/(recipes)')} />
        </View>
        <View
          style={{
            flexDirection: width < 375 ? 'column' : 'row',
            gap: tokens.space.sm,
          }}
        >
          {recipes.slice(0, 2).map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </View>
      </View>
      <Surface
        style={{ backgroundColor: state.offline ? tokens.color.paperMuted : tokens.color.sage }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm }}>
          <Icon
            name={state.offline ? 'wifi.slash' : 'checkmark.icloud'}
            fallback="✓"
            color={tokens.color.olive}
          />
          <View style={{ flex: 1 }}>
            <Text style={[tokens.type.footnote, { color: tokens.color.ink, fontWeight: '800' }]}>
              {state.offline ? 'Showing the latest saved copy' : 'Your kitchen is up to date'}
            </Text>
            <Text style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
              {state.offline
                ? 'Editing is paused until Bòrd can reconnect.'
                : 'Offline copies are ready for a trip to the store.'}
            </Text>
          </View>
          <Button
            label={state.offline ? 'View' : refreshing ? 'Refreshing…' : 'Refresh'}
            tone="quiet"
            disabled={refreshing}
            onPress={() => (state.offline ? router.push('/offline') : void refresh())}
          />
        </View>
      </Surface>
    </Screen>
  );
}
function Quick({ title, icon, onPress }: { title: string; icon: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.72 : 1 })}
    >
      <Surface style={{ flex: 1, minHeight: 92, padding: tokens.space.sm }}>
        <Icon name={icon} fallback="+" color={tokens.color.olive} />
        <Text style={[tokens.type.caption, { color: tokens.color.ink, fontWeight: '800' }]}>
          {title}
        </Text>
      </Surface>
    </Pressable>
  );
}
