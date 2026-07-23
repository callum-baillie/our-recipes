import { ShoppingListsOverview } from '@/components/shopping-lists-overview';
import { listShoppingLists } from '@/lib/services/planning-service';

export const dynamic = 'force-dynamic';

export default function ListsPage() {
  const lists = listShoppingLists(true);
  return (
    <main>
      <ShoppingListsOverview lists={lists} />
    </main>
  );
}
