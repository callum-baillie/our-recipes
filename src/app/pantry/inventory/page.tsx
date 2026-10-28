import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { getPantryDashboard } from '@/lib/services/pantry-service';
import { PantryInventory } from '@/components/pantry-inventory';
import { productImageGtin } from '@/lib/domain/product-image';
export const dynamic = 'force-dynamic';
export default async function PantryInventoryPage() {
  const principal = await getAuthenticatedSessionPrincipal(
    new Request('http://localhost/pantry/inventory', { headers: await headers() }),
  );
  if (!principal) redirect('/sign-in');
  const pantry = getPantryDashboard();
  return (
    <PantryInventory
      canEdit={principal.role !== 'child'}
      batches={pantry.batches.map((batch) => ({
        id: batch.id,
        name: batch.product.displayName,
        gtin: productImageGtin(batch.product.identifiers),
        location: batch.location.path,
        unit: batch.unit,
        quantity: batch.quantityRemaining,
        quantityLabel: batch.quantityLabel,
        version: batch.version,
        expiry: batch.expiry.date,
      }))}
    />
  );
}
