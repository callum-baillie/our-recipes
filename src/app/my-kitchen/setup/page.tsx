import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { MyKitchen } from '@/components/my-kitchen';
import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { readKitchenInventory } from '@/lib/services/kitchen-inventory-service';
import { readCookingPreferences } from '@/lib/services/cooking-preferences-service';
import { getAiDataPolicy } from '@/lib/services/ai-settings-service';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'My Kitchen setup' };
export default async function KitchenSetupPage() {
  const p = await getAuthenticatedSessionPrincipal(
    new Request('http://localhost/my-kitchen/setup', { headers: await headers() }),
  );
  if (!p) redirect('/sign-in');
  const kitchen = readKitchenInventory(p);
  return (
    <MyKitchen
      key={`${p.userId}:${p.profileId}:${kitchen.id}`}
      initial={kitchen}
      actorKey={`${p.userId}:${p.profileId}`}
      sharing={getAiDataPolicy(p.linkedProfileId).shareKitchenEquipment}
      guided
      personalPreferences={readCookingPreferences(p)}
    />
  );
}
