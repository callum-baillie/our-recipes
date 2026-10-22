import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { readKitchenInventory } from '@/lib/services/kitchen-inventory-service';
import { getAiDataPolicy } from '@/lib/services/ai-settings-service';
import { MyKitchen } from '@/components/my-kitchen';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'My Kitchen' };
export default async function MyKitchenPage() {
  const p = await getAuthenticatedSessionPrincipal(
    new Request('http://localhost/my-kitchen', { headers: await headers() }),
  );
  if (!p) redirect('/sign-in');
  const kitchen = readKitchenInventory(p);
  return (
    <MyKitchen
      key={`${p.userId}:${p.profileId}:${kitchen.id}`}
      initial={kitchen}
      actorKey={`${p.userId}:${p.profileId}`}
      sharing={getAiDataPolicy(p.linkedProfileId).shareKitchenEquipment}
    />
  );
}
