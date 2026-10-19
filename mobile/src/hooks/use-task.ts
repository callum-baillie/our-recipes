import * as React from 'react';
export function useTask() {
  const lock = React.useRef(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const run = async (task: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not complete this action.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}
