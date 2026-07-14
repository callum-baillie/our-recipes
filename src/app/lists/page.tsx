import Link from 'next/link';

import { listShoppingLists } from '@/lib/services/planning-service';

export const dynamic = 'force-dynamic';

export default function ListsPage() {
  const lists = listShoppingLists();
  return (
    <main className="recipe-page">
      <header className="recipe-header">
        <Link className="wordmark" href="/">
          <span className="wordmark-mark">✦</span>
          <span>Our Recipes</span>
        </Link>
        <Link className="primary-button compact" href="/planner">
          Plan meals
        </Link>
      </header>
      <section className="library-heading">
        <div>
          <p className="eyebrow">SHOPPING LISTS</p>
          <h1>From the plan to the pantry.</h1>
          <p className="muted">
            Every generated list stays separate, so changes you make are always yours to keep.
          </p>
        </div>
      </section>
      {lists.length ? (
        <section className="recipe-grid">
          {lists.map((list) => (
            <Link className="recipe-card" href={`/lists/${list.id}`} key={list.id}>
              <p>
                {list.weekStart} — {list.weekEnd}
              </p>
              <h2>{list.name}</h2>
              <span>Open and edit this household shopping list.</span>
            </Link>
          ))}
        </section>
      ) : (
        <section className="empty-library">
          <h2>No shopping lists yet.</h2>
          <p>Plan a few meals, then create a transparent list from their ingredients.</p>
          <Link className="primary-button" href="/planner">
            Open the planner
          </Link>
        </section>
      )}
    </main>
  );
}
