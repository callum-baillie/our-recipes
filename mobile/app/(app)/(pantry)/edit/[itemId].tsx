import { useLocalSearchParams } from 'expo-router';
import { PantryEditScreen } from '@/screens/operations-screens';

export default function PantryEditRoute() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  return <PantryEditScreen itemId={itemId} />;
}
