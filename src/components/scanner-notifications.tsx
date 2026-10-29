'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { ScanSession } from '@/lib/domain/scanner-session';
import { useToast } from './toast-provider';
import { HANDHELD_HREF } from '@/lib/client/scanner-activity';

export function ScannerNotifications({ accountId }: { accountId: string }) {
  const { showToast, dismissToast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    const controller = new AbortController();
    const shown = new Set<string>();
    let busy = false;
    async function check() {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const response = await fetch('/api/v1/scanner/stations', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) return;
        const { stations } = (await response.json()) as { stations: Array<{ id: string }> };
        for (const station of stations) {
          const response = await fetch(
            `/api/v1/scanner/stations/${encodeURIComponent(station.id)}/session`,
            { cache: 'no-store', signal: controller.signal },
          );
          if (!response.ok) continue;
          const session = (await response.json()) as ScanSession;
          if (controller.signal.aborted) return;
          for (const entry of session.entries) {
            if (
              !entry.recipeHref ||
              (entry.state !== 'review' && !/review|missing portions/i.test(entry.detail))
            )
              continue;
            const recipeKey = `scan-meal-review:${accountId}:${entry.id}`;
            shown.add(recipeKey);
            let handled = false;
            try {
              handled = localStorage.getItem(recipeKey) === 'reviewed';
            } catch {
              /* Storage is optional. */
            }
            if (!handled)
              showToast(entry.detail, 'info', {
                key: recipeKey,
                actions: [
                  {
                    label: 'Review meal',
                    onClick: () => {
                      try {
                        localStorage.setItem(recipeKey, 'reviewed');
                      } catch {
                        /* Storage is optional. */
                      }
                      dismissToast(recipeKey);
                      router.push(entry.recipeHref!);
                    },
                  },
                ],
              });
          }
          const latest = session.entries
            .map((e) => Date.parse(e.time))
            .filter(Number.isFinite)
            .sort((a, b) => b - a)[0];
          const key = `scan-review:${accountId}:${station.id}`;
          shown.add(key);
          if (!latest) {
            dismissToast(key);
            continue;
          }
          let reviewed = 0;
          try {
            reviewed = Number(localStorage.getItem(key)) || 0;
          } catch {
            /* Storage is optional. */
          }
          // The handheld tab marks scans as seen itself; here only the page matters.
          if (pathname === '/pantry/add' && document.querySelector('[data-handheld-open]')) {
            try {
              localStorage.setItem(key, String(latest));
            } catch {
              /* Storage is optional. */
            }
            dismissToast(key);
          } else if (latest > reviewed) {
            showToast(`Review your recent pantry scan session · ${session.name}`, 'info', {
              key,
              actions: [
                {
                  label: 'Review scans',
                  onClick: () => {
                    dismissToast(key);
                    router.push(HANDHELD_HREF);
                  },
                },
              ],
            });
          }
        }
      } catch {
        /* Retry on the next foreground refresh. */
      } finally {
        busy = false;
      }
    }
    void check();
    const timer = setInterval(() => void check(), 30000);
    const wake = () => void check();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('bord:scan-reviewed', wake);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('bord:scan-reviewed', wake);
      for (const key of shown) dismissToast(key);
    };
  }, [accountId, pathname, router, showToast, dismissToast]);
  return null;
}
