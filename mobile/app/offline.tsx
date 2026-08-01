import { OfflineScreen } from '@/screens/assistant-offline';
import { ProtectedRoute } from '@/auth/protected-route';

export default function OfflineRoute() {
  return (
    <ProtectedRoute>
      <OfflineScreen />
    </ProtectedRoute>
  );
}
