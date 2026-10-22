import { ProtectedRoute } from '@/auth/protected-route';
import { MyKitchenScreen } from '@/screens/my-kitchen-screen';
export default function MyKitchenPage() {
  return (
    <ProtectedRoute>
      <MyKitchenScreen />
    </ProtectedRoute>
  );
}
