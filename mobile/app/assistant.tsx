import { AssistantScreen } from '@/screens/assistant-offline';
import { ProtectedRoute } from '@/auth/protected-route';

export default function AssistantRoute() {
  return (
    <ProtectedRoute>
      <AssistantScreen />
    </ProtectedRoute>
  );
}
