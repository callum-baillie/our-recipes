import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { scannerStationList } from '@/lib/services/scanner-station-service';
import { ScannerSessionList } from '@/components/scanner-session';
export const dynamic = 'force-dynamic';
export default async function ScanListPage() {
  const principal = await getAuthenticatedSessionPrincipal(
    new Request('http://localhost/scanner/session', { headers: await headers() }),
  );
  if (!principal) redirect('/sign-in');
  return (
    <ScannerSessionList
      canEdit={principal.role !== 'child'}
      stations={scannerStationList(principal).map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
