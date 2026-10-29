import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { listAdminApiKeys } from '@/lib/services/api-key-service';
import { scannerStationList } from '@/lib/services/scanner-station-service';
import { getPantryDashboard } from '@/lib/services/pantry-service';
import { listShoppingLists, getShoppingList } from '@/lib/services/planning-service';
import { CameraScannerSettings } from '@/components/camera-scanner-settings';
import { ScannerStation } from '@/components/scanner-station';
export const dynamic = 'force-dynamic';
export default async function ScannerPage() {
  const principal = await getAuthenticatedSessionPrincipal(
    new Request('http://localhost/scanner', { headers: await headers() }),
  );
  if (!principal) redirect('/sign-in');
  const pantry = getPantryDashboard();
  return (
    <ScannerStation
      canEdit={principal.role !== 'child'}
      canRegister={principal.role === 'admin' && principal.profileId === principal.linkedProfileId}
      stations={scannerStationList(principal).map((s) => ({ id: s.id, name: s.name }))}
      keys={
        principal.role === 'admin'
          ? listAdminApiKeys(principal.userId)
              .filter((k) => k.enabled)
              .map((k) => ({ id: k.id, name: k.name }))
          : []
      }
      products={pantry.products.map((p) => ({
        id: p.id,
        name: p.displayName,
        unit: p.defaultInventoryUnit,
      }))}
      locations={pantry.locations.map((l) => ({ id: l.id, name: l.path }))}
      shopping={listShoppingLists().map((l) => ({
        id: l.id,
        name: l.name,
        items: (getShoppingList(l.id)?.items ?? []).map((i) => ({
          id: i.id,
          name: i.item,
          updatedAt: i.updatedAt.toISOString(),
        })),
      }))}
    >
      <CameraScannerSettings />
      <section className="settings-card">
        <h2>Pantry labels</h2>
        <p>
          Attach a label to a batch, then scan a wall action followed by that label to record
          expiry, freezing, moving or disposal. Each label identifies the exact stock batch.
        </p>
        <a className="text-button" href="/api/v1/scanner/cards?kind=locations">
          Download location labels
        </a>
        <details>
          <summary>Print a batch label</summary>
          <ul>
            {pantry.batches
              .filter((batch) => !['depleted', 'discarded', 'donated'].includes(batch.status))
              .map((batch) => (
                <li key={batch.id}>
                  <a href={`/api/v1/scanner/cards?kind=batch&id=${batch.id}`}>
                    {batch.product.displayName} · {batch.location.path} ·{' '}
                    {batch.quantityRemaining ?? 'unknown amount'} {batch.unit}
                  </a>
                </li>
              ))}
          </ul>
        </details>
      </section>
    </ScannerStation>
  );
}
