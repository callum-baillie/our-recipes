import { Stack } from 'expo-router';
import { ProtectedRoute } from '@/auth/protected-route';

export default function SettingsLayout() {
  return (
    <ProtectedRoute>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="profiles" />
        <Stack.Screen name="recipes" />
        <Stack.Screen name="meal-plan" />
        <Stack.Screen name="lists" />
        <Stack.Screen name="pantry" />
        <Stack.Screen name="nutrition" />
        <Stack.Screen name="ai" />
        <Stack.Screen name="system" />
        <Stack.Screen name="backups" />
        <Stack.Screen name="api" />
      </Stack>
    </ProtectedRoute>
  );
}
