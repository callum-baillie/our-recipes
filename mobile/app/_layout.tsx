import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { BordStore } from '@/state/bord-store';
import { AuthProvider } from '@/auth/auth-context';
import { SyncProvider } from '@/sync/sync-context';
import { tokens } from '@/theme/tokens';
import { RecipeFilterProvider } from '@/state/recipe-filter-store';

export default function RootLayout() {
  return (
    <AuthProvider>
      <BordStore>
        <RecipeFilterProvider>
          <SyncProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerBackButtonDisplayMode: 'minimal',
                headerTintColor: tokens.color.ink,
                headerStyle: { backgroundColor: tokens.color.paper },
                headerShadowVisible: false,
                contentStyle: { backgroundColor: tokens.color.paper },
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(app)" options={{ headerShown: false }} />
              <Stack.Screen name="security" options={{ headerShown: false }} />
              <Stack.Screen
                name="scanner"
                options={{ headerShown: false, presentation: 'fullScreenModal' }}
              />
              <Stack.Screen
                name="assistant"
                options={{
                  headerShown: false,
                  title: '',
                  presentation: 'transparentModal',
                  animation: 'fade',
                  gestureEnabled: false,
                  contentStyle: { backgroundColor: 'transparent' },
                }}
              />
              <Stack.Screen
                name="recipe-filters"
                options={{
                  headerShown: false,
                  title: '',
                  presentation: 'transparentModal',
                  animation: 'fade',
                  gestureEnabled: false,
                  contentStyle: { backgroundColor: 'transparent' },
                }}
              />
              <Stack.Screen
                name="offline"
                options={{ headerShown: false, presentation: 'fullScreenModal' }}
              />
            </Stack>
          </SyncProvider>
        </RecipeFilterProvider>
      </BordStore>
    </AuthProvider>
  );
}
