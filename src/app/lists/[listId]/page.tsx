import { CalendarDays, ChevronLeft, Clock3 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BordHeaderLockup } from '@/components/bord-brand';
import { ShoppingListEditor } from '@/components/shopping-list-editor';
import { ShoppingListMobileMenu } from '@/components/shopping-list-mobile-menu';
import { shoppingListSourceKind, shoppingListSourceLabel } from '@/lib/domain/planning';
import { listPantryOptionSummaries } from '@/lib/services/pantry-service';
import { getShoppingList } from '@/lib/services/planning-service';

import styles from '@/components/shopping-list-editor.module.css';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ listId: string }>;
}): Promise<Metadata> {
  const list = getShoppingList((await params).listId);
  return { title: list?.name ?? 'Shopping list' };
}

export default async function ShoppingListPage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string }>;
  searchParams: Promise<{ restored?: string }>;
}) {
  const list = getShoppingList((await params).listId);
  if (!list) notFound();
  const toFind = list.items.filter(
    (item) => item.shoppingState === 'to_buy' || item.shoppingState === 'cant_find',
  ).length;
  const inCart = list.items.filter((item) => item.shoppingState === 'in_cart').length;
  const sourced = list.items.filter((item) => item.shoppingState === 'sourced').length;
  const restored = (await searchParams).restored === '1';
  const source = shoppingListSourceKind(list.sourceMode);
  const updated = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(list.updatedAt);
  return (
    <main className={`${styles.page} shopping-list-focus-page`}>
      <header className={styles.mobileHeader}>
        <Link href="/lists" aria-label="Back to all lists">
          <ChevronLeft />
        </Link>
        <BordHeaderLockup className={styles.mobileBrand} />
        <ShoppingListMobileMenu listId={list.id} listName={list.name} />
      </header>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p>SHOPPING LIST</p>
          <h1>{list.name}</h1>
          <span>
            {list.weekStart ? `${list.weekStart} — ${list.weekEnd}` : 'Manual household list'}
          </span>
        </div>
        <div className={styles.heroMeta}>
          <span>
            <Clock3 /> <strong>{toFind} to find</strong>
            <small>
              {inCart} in cart · {sourced} sourced
            </small>
          </span>
          <span>
            <CalendarDays /> <strong>{shoppingListSourceLabel(source)}</strong>
          </span>
          <span>
            <Clock3 /> <strong>Updated</strong>
            <small>{updated}</small>
          </span>
        </div>
        <Link className={styles.allListsLink} href="/lists">
          <ChevronLeft size={16} /> All lists
        </Link>
      </section>
      {restored ? (
        <p className={styles.restoredNotice} role="status">
          This archived list was restored and updated with the latest plan. Protected and manual
          changes were kept.
        </p>
      ) : null}
      <ShoppingListEditor list={list} initialPantryOptions={listPantryOptionSummaries()} />
    </main>
  );
}
