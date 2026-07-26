'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useTransition } from 'react';

import { useToast } from '@/components/toast-provider';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { showToast } = useToast();
  const [retrying, startRetry] = useTransition();

  useEffect(() => {
    showToast('That part of Bòrd could not be loaded. Your saved data was not changed.', 'error');
    console.error(error);
  }, [error, showToast]);

  return (
    <main className="route-state-page">
      <section className="route-state-card" aria-labelledby="route-error-title">
        <span className="route-state-icon route-state-icon-error" aria-hidden="true">
          <AlertTriangle size={26} />
        </span>
        <p className="eyebrow">SOMETHING WENT WRONG</p>
        <h1 id="route-error-title">This view could not be loaded.</h1>
        <p>
          Try the view again. If the problem continues, open System settings and export redacted
          diagnostics.
        </p>
        <div className="route-state-actions">
          <button
            className="primary-button"
            type="button"
            aria-busy={retrying}
            disabled={retrying}
            onClick={() => startRetry(reset)}
          >
            <RefreshCw size={17} aria-hidden="true" />
            {retrying ? 'Trying again…' : 'Try again'}
          </button>
          <Link className="text-button" href="/">
            Return to the kitchen
          </Link>
          <Link className="text-button" href="/settings/system">
            Open diagnostics
          </Link>
        </div>
        {error.digest ? <small>Reference: {error.digest}</small> : null}
      </section>
    </main>
  );
}
