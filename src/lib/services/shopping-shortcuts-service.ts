import 'server-only';
import { and, desc, eq, or } from 'drizzle-orm';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import { shoppingListItems } from '@/lib/db/schema';
import { addShoppingListItem, getShoppingList, PlanningNotFoundError } from './planning-service';
const key = (name: string) => name.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
export function recentShoppingItems() {
  ensureDatabase();
  const rows = getDatabase()
    .select()
    .from(shoppingListItems)
    .where(or(eq(shoppingListItems.checked, true), eq(shoppingListItems.shoppingState, 'sourced')))
    .orderBy(desc(shoppingListItems.updatedAt))
    .limit(500)
    .all();
  const seen = new Map<
    string,
    { item: string; quantity: number | null; unit: string; timesBought: number }
  >();
  for (const row of rows) {
    const identity = key(row.item);
    const value = seen.get(identity);
    if (value) value.timesBought++;
    else
      seen.set(identity, {
        item: row.item,
        quantity: row.quantity,
        unit: row.unit,
        timesBought: 1,
      });
  }
  return [...seen.values()].slice(0, 30);
}
export function addShoppingNames(listId: string, names: string[], profileId: string) {
  ensureDatabase();
  return getDatabase().transaction(() => {
    if (!getShoppingList(listId)) throw new PlanningNotFoundError('Shopping list not found.');
    const existing = getDatabase()
      .select()
      .from(shoppingListItems)
      .where(and(eq(shoppingListItems.listId, listId), eq(shoppingListItems.checked, false)))
      .all();
    const seen = new Set(existing.map((item) => key(item.item)));
    const added = [];
    let skipped = 0;
    for (const name of names) {
      if (seen.has(key(name))) {
        skipped++;
        continue;
      }
      seen.add(key(name));
      added.push(
        addShoppingListItem(
          listId,
          { item: name, quantity: '', unit: '', note: '', checked: false, shoppingState: 'to_buy' },
          profileId,
        ),
      );
    }
    return { items: added, skipped };
  });
}
