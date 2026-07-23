import { foodDataJson } from '../_shared';
import { listFoodProviderStatuses } from '@/lib/services/food-data-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET() {
  return foodDataJson({
    providers: listFoodProviderStatuses(),
    camera: { requiresSecureContext: true, permissionPolicy: 'camera=(self)' },
  });
}
