import { useLocalSearchParams } from 'expo-router';
import { CollectionDetailScreen } from '@/screens/recipe-screens';

export default function CollectionDetailRoute() {
  const { collectionId } = useLocalSearchParams<{ collectionId: string }>();
  return <CollectionDetailScreen collectionId={collectionId} />;
}
