import { CalendarDays, ChevronLeft, Clock3, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BordLockup } from '@/components/bord-brand';
import { ShoppingListEditor } from '@/components/shopping-list-editor';
import { getShoppingList } from '@/lib/services/planning-service';

import styles from '@/components/shopping-list-editor.module.css';

export const dynamic = 'force-dynamic';

export default async function ShoppingListPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const list = getShoppingList((await params).listId);
  if (!list) notFound();
  const remaining = list.items.filter(
    (item) => !item.checked && !['in_cart', 'sourced'].includes(item.shoppingState),
  ).length;
  const hours = Math.max(0, Math.round((Date.now() - list.updatedAt.getTime()) / 3_600_000));
  const updated = hours < 1 ? 'Just now' : hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
  return (
    <main className={`${styles.page} shopping-list-focus-page`}>
      <header className={styles.mobileHeader}>
        <Link href="/lists" aria-label="Back to all lists"><ChevronLeft /></Link>
        <BordLockup className={styles.mobileBrand} />
        <button type="button" aria-label="More list options"><MoreHorizontal /></button>
      </header>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p>SHOPPING LIST</p>
          <h1>{list.name}</h1>
          <span>{list.weekStart ? `${list.weekStart} — ${list.weekEnd}` : 'Manual household list'}</span>
        </div>
        <div className={styles.heroMeta}>
          <span><Clock3 /> <strong>{remaining} of {list.items.length}</strong><small>remaining</small></span>
          <span><CalendarDays /> <strong>{list.sourceMode === 'manual' ? 'Manual list' : 'From planner'}</strong></span>
          <span><Clock3 /> <strong>Updated</strong><small>{updated}</small></span>
        </div>
        <Link className={styles.allListsLink} href="/lists"><ChevronLeft size={16} /> All lists</Link>
      </section>
      <ShoppingListEditor list={list} />
    </main>
  );
}
