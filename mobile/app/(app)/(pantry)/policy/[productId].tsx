import { useLocalSearchParams } from 'expo-router';

import { PantryPolicyEditScreen } from '@/screens/operations-screens';

export default function PantryPolicyEditRoute() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  return <PantryPolicyEditScreen productId={productId} />;
}
