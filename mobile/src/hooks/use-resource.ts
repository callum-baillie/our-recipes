import * as React from 'react';
import { useAuth } from '@/auth/auth-context';
export function useResource<T>(path: string | null) {
  const { request, instanceUrl, user } = useAuth();
  const [version, setVersion] = React.useState(0);
  const key = `${instanceUrl}:${user?.id}:${path}:${version}`;
  const [result, setResult] = React.useState<{ key: string; data?: T; error?: string } | null>(
    null,
  );
  React.useEffect(() => {
    if (!path) return;
    let active = true;
    void request<T>(path)
      .then((data) => {
        if (active) setResult({ key, data });
      })
      .catch((cause) => {
        if (active)
          setResult({
            key,
            error: cause instanceof Error ? cause.message : 'Could not load data.',
          });
      });
    return () => {
      active = false;
    };
  }, [request, path, key]);
  const reload = React.useCallback(() => setVersion((value) => value + 1), []);
  return {
    data: result?.key === key ? result.data : undefined,
    error: result?.key === key ? result.error : undefined,
    loading: Boolean(path) && result?.key !== key,
    reload,
  };
}
