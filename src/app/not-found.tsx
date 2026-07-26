import { SearchX } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Page not found',
  description: 'The requested Bòrd page could not be found.',
};

export default function NotFoundPage() {
  return (
    <main className="route-state-page">
      <section className="route-state-card" aria-labelledby="not-found-title">
        <span className="route-state-icon" aria-hidden="true">
          <SearchX size={26} />
        </span>
        <p className="eyebrow">NOT FOUND</p>
        <h1 id="not-found-title">That page is no longer at the table.</h1>
        <p>
          The item may have been removed, archived, or opened from an old link. Your other household
          data is still available.
        </p>
        <div className="route-state-actions">
          <Link className="primary-button" href="/">
            Return to the kitchen
          </Link>
          <Link className="text-button" href="/recipes">
            Browse recipes
          </Link>
        </div>
      </section>
    </main>
  );
}
