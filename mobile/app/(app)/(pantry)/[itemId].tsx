import { useLocalSearchParams } from 'expo-router';
import { PantryDetailScreen } from '@/screens/operations-screens';

export default function PantryDetail() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  return <PantryDetailScreen itemId={itemId ?? ''} />;
}
