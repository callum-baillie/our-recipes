import { Stack } from 'expo-router';
export default function RecipesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="collections" />
      <Stack.Screen name="tags" />
      <Stack.Screen name="import" />
      <Stack.Screen name="capture" />
      <Stack.Screen name="new" />
      <Stack.Screen name="[recipeId]/index" />
      <Stack.Screen name="[recipeId]/edit" />
      <Stack.Screen
        name="[recipeId]/cook"
        options={{ headerShown: false, presentation: 'fullScreenModal' }}
      />
    </Stack>
  );
}
