'use client';

import { ToastNotice } from './toast-provider';

import { useRef, useState } from 'react';
import { BordIcon } from './bord-brand';
import {
  checkKitchenConnection,
  offlineDestination,
  setKitchenConnection,
} from './kitchen-connection';
export function OfflineRecovery() {
  const [status, setStatus] = useState('');
  const [checking, setChecking] = useState(false);
  const lock = useRef(false);
  async function retry() {
    if (lock.current) return;
    lock.current = true;
    setChecking(true);
    setStatus('Checking the Bòrd server…');
    const current = new URL(window.location.href);
    const target = offlineDestination(
      current.pathname === '/offline'
        ? (current.searchParams.get('returnTo') ?? '/recipes')
        : `${current.pathname}${current.search}${current.hash}`,
      current.origin,
    );
    const controller = new AbortController();
    let timer: number | undefined;
    try {
      if (!(await checkKitchenConnection())) throw new Error('Unavailable');
      timer = window.setTimeout(() => controller.abort(), 8000);
      const response = await fetch(target, {
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'X-Bord-Recovery-Check': '1' },
      });
      if (!response.ok || response.headers.get('X-Bord-Offline') === '1')
        throw new Error('Unavailable');
      setStatus('Bòrd is available. Opening your page…');
      // Full navigation retries the requested page without resubmitting any write.
      window.location.assign(target);
    } catch {
      setKitchenConnection('unavailable');
      setStatus(
        'The Bòrd server is still unavailable. Check the network and that Bòrd is running, then try again. No changes have been queued.',
      );
    } finally {
      window.clearTimeout(timer);
      lock.current = false;
      setChecking(false);
    }
  }
  return (
    <main className="offline-page">
      <section>
        <span className="wordmark-mark custom" aria-hidden="true">
          <BordIcon size={21} />
        </span>
        <p className="eyebrow">CONNECTION UNAVAILABLE</p>
        <h1>We can’t reach the Bòrd server.</h1>
        <p>
          Some recipe pages cached on this device may still be readable. Changes need a connection
          and are not queued.
        </p>
        <button
          className="primary-button"
          type="button"
          disabled={checking}
          onClick={() => void retry()}
        >
          {checking ? 'Checking…' : 'Try again'}
        </button>
        {status && <ToastNotice>{status}</ToastNotice>}
      </section>
    </main>
  );
}
