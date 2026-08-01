import { router } from 'expo-router';
import { Button, EmptyState, Screen } from '@/components/ui';
export default function NotFound() {
  return (
    <Screen>
      <EmptyState
        icon="map"
        title="This page isn’t in the cookbook."
        detail="Return to Home and choose another kitchen task."
        action={<Button label="Go home" onPress={() => router.replace('/(app)/(recipes)/home')} />}
      />
    </Screen>
  );
}
