import { Alert, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { Recipe } from '@/data/types';
import { Icon, StatusPill } from '@/components/ui';
import { tokens, editorial } from '@/theme/tokens';
import { useBord } from '@/state/bord-store';
import { useServerActions } from '@/data/server-actions';
import { useReducedMotion } from '@/accessibility/use-reduced-motion';

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  const { state } = useBord();
  const actions = useServerActions();
  const favorite = state.favorites.includes(recipe.id);
  const reducedMotion = useReducedMotion();
  return (
    <View
      style={{
        flex: 1,
        minWidth: tokens.layout.recipeMin,
        backgroundColor: tokens.color.surface,
        borderWidth: 1,
        borderColor: tokens.color.separator,
        borderRadius: tokens.radius.card,
        overflow: 'hidden',
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${recipe.title}`}
        onPress={() => router.push(`/(app)/(recipes)/${recipe.id}`)}
        onLongPress={() =>
          Alert.alert(recipe.title, 'Recipe actions', [
            {
              text: favorite ? 'Remove favorite' : 'Add favorite',
              onPress: () =>
                void actions
                  .setFavorite(recipe.id, !favorite)
                  .catch((error) =>
                    Alert.alert(
                      'Favorite not changed',
                      error instanceof Error ? error.message : 'Try again.',
                    ),
                  ),
            },
            { text: 'Cancel', style: 'cancel' },
          ])
        }
        style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
      >
        <Image
          source={recipe.image}
          transition={reducedMotion ? 0 : 160}
          contentFit="cover"
          style={{ width: '100%', height: 126 }}
          accessibilityLabel={`${recipe.title} cover`}
        />
        <View style={{ padding: tokens.space.sm, gap: 6 }}>
          <StatusPill>{recipe.tags[0] ?? recipe.meal}</StatusPill>
          <Text
            selectable
            numberOfLines={2}
            style={[
              editorial,
              { color: tokens.color.ink, fontSize: 18, lineHeight: 19, fontWeight: '700' },
            ]}
          >
            {recipe.title}
          </Text>
          <Text
            selectable
            style={[
              tokens.type.caption,
              { color: tokens.color.inkSecondary, fontVariant: ['tabular-nums'] },
            ]}
          >
            {recipe.minutes} min · serves {recipe.servings}
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={favorite ? 'Remove from favorites' : 'Add to favorites'}
        hitSlop={4}
        onPress={() => {
          void actions
            .setFavorite(recipe.id, !favorite)
            .catch((error) =>
              Alert.alert(
                'Favorite not changed',
                error instanceof Error ? error.message : 'Try again.',
              ),
            );
        }}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          width: tokens.layout.touch,
          height: tokens.layout.touch,
          borderRadius: tokens.layout.touch / 2,
          backgroundColor: 'rgba(255,253,248,.88)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon
          name={favorite ? 'heart.fill' : 'heart'}
          fallback="♥"
          color={favorite ? tokens.color.terracotta : tokens.color.ink}
          size={17}
        />
      </Pressable>
    </View>
  );
}
