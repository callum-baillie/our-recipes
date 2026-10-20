import { cookies, headers } from 'next/headers';
import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';

import { ShoppingListsOverview } from '@/components/shopping-lists-overview';
import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { listAiSummaries } from '@/lib/services/ai-summary-service';
import { listShoppingLists } from '@/lib/services/planning-service';

export const dynamic = 'force-dynamic';

export default async function ListsPage() {
  const lists = listShoppingLists(true);
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  const summaryPrincipal = await getAuthenticatedSessionPrincipal(
    new Request('http://localhost/lists', { headers: await headers() }),
  );
  const summary =
    actor.profileId &&
    summaryPrincipal?.linkedProfileId === actor.profileId &&
    summaryPrincipal.profileId === actor.profileId
      ? listAiSummaries(actor.profileId).find((item) => item.domain === 'shopping_lists')
      : null;
  return (
    <main>
      <ShoppingListsOverview
        lists={lists}
        initialAiSummary={
          summary ? { ...summary, createdAt: summary.createdAt.toISOString() } : null
        }
      />
    </main>
  );
}
