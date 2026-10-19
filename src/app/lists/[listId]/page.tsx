import { cookies } from 'next/headers';
import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { getProfile } from '@/lib/services/household-service';
import { PageHeader } from '@/components/page-header';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BordHeaderLockup } from '@/components/bord-brand';
import { instacartConfigured } from '@/lib/services/instacart-service';
import { ShoppingListEditor } from '@/components/shopping-list-editor';
import { ShoppingListMobileMenu } from '@/components/shopping-list-mobile-menu';
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
  const restored = (await searchParams).restored === '1';
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  const locale = actor.profileId ? getProfile(actor.profileId)?.locale : undefined;
  return (
    <main className={`${styles.page} shopping-list-focus-page`}>
      <header className={styles.mobileHeader}>
        <BordHeaderLockup className={styles.mobileBrand} />
        <ShoppingListMobileMenu listId={list.id} listName={list.name} />
      </header>
      <PageHeader
        className={styles.listPageHeader}
        density="compact"
        title={list.name}
        description={
          <>
            {list.weekStart
              ? `${new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(`${list.weekStart}T12:00:00`))} — ${new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(`${list.weekEnd}T12:00:00`))}`
              : 'A list for this shopping trip'}
            {list.isAutomaticRestockTarget ? ' · Next shop' : ''}
          </>
        }
      />

      {restored ? (
        <p className={styles.restoredNotice} role="status">
          This archived list was restored and updated with the latest plan. Protected and manual
          changes were kept.
        </p>
      ) : null}
      <ShoppingListEditor
        list={list}
        initialPantryOptions={listPantryOptionSummaries()}
        instacartEnabled={instacartConfigured()}
      />
    </main>
  );
}
