import { useLocalSearchParams } from 'expo-router';
import { ListDetailScreen } from '@/screens/operations-screens';

export default function ListDetail() {
  const { listId } = useLocalSearchParams<{ listId: string }>();
  return <ListDetailScreen listId={listId} />;
}
