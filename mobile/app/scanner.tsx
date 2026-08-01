import { BarcodeScannerScreen } from '@/screens/scanner-screen';
import { ProtectedRoute } from '@/auth/protected-route';

export default function ScannerRoute() {
  return (
    <ProtectedRoute>
      <BarcodeScannerScreen />
    </ProtectedRoute>
  );
}
