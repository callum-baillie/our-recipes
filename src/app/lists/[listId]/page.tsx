import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ShoppingListEditor } from '@/components/shopping-list-editor';
import { getShoppingList } from '@/lib/services/planning-service';

export const dynamic = 'force-dynamic';

export default async function ShoppingListPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const list = getShoppingList((await params).listId);
  if (!list) notFound();
  return (
    <main className="recipe-page">
      <header className="recipe-header">
        <Link className="wordmark" href="/">
          <span className="wordmark-mark">✦</span>
          <span>Our Recipes</span>
        </Link>
        <Link className="quiet-link" href="/lists">
          All lists
        </Link>
      </header>
      <section className="shopping-heading">
        <p className="eyebrow">
          {list.weekStart} — {list.weekEnd}
        </p>
        <h1>{list.name}</h1>
        <p className="muted">
          This is a separate editable copy of the plan’s ingredients. Check, change, reorder, or add
          anything you need.
        </p>
      </section>
      <ShoppingListEditor list={list} />
    </main>
  );
}
