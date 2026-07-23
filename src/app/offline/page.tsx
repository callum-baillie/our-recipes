import Link from 'next/link';

import { BordIcon } from '@/components/bord-brand';

export default function OfflinePage() {
  return (
    <main className="offline-page">
      <section>
        <span className="wordmark-mark custom" aria-hidden="true">
          <BordIcon size={21} />
        </span>
        <p className="eyebrow">OFFLINE READING</p>
        <h1>The kitchen is out of reach for a moment.</h1>
        <p>
          Previously opened recipes remain available while you reconnect. Changes, new recipes,
          plans, and lists wait for the household network.
        </p>
        <Link className="primary-button" href="/recipes">
          Try the recipe library again
        </Link>
      </section>
    </main>
  );
}
