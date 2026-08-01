import { SecurityScreen } from '@/screens/auth-screens';
import { ProtectedRoute } from '@/auth/protected-route';

export default function SecurityRoute() {
  return (
    <ProtectedRoute>
      <SecurityScreen />
    </ProtectedRoute>
  );
}
