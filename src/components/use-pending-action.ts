'use client';

import { useRef, useState } from 'react';

/** Covers the entire request, including failures, and rejects duplicate submissions synchronously. */
export function usePendingAction(onError: (message: string) => void) {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);

  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setPending(true);
    try {
      return await action();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Check your connection and try again.');
      return undefined;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return { pending, run };
}
