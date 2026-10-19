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
        <h1 id="not-found-title">Page not found</h1>
        <p>Check the address or return to your kitchen to find what you need.</p>
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
