import * as React from 'react';
import { useAuth } from '@/auth/auth-context';
import { createExpoRepository } from '@/data/repository';
import { bordReducer, initialState, type BordAction, type BordState } from '@/state/model';

type BordContextValue = {
  state: BordState;
  dispatch: React.Dispatch<BordAction>;
  hydrated: boolean;
};
const BordContext = React.createContext<BordContextValue | null>(null);
const repository = createExpoRepository();

export function BordStore({ children }: React.PropsWithChildren) {
  const { instanceUrl, status, user } = useAuth();
  const [state, dispatch] = React.useReducer(bordReducer, initialState);
  const [hydratedScope, setHydratedScope] = React.useState<string | null>(null);
  const scope =
    status === 'authenticated' && instanceUrl && user
      ? `${encodeURIComponent(instanceUrl)}:${encodeURIComponent(user.id)}`
      : null;
  const hydrated = scope !== null && hydratedScope === scope;
  React.useEffect(() => {
    let cancelled = false;
    dispatch({ type: 'hydrate', state: initialState });
    setHydratedScope(null);
    if (!scope) return;
    repository
      .read(scope)
      .then((stored) => {
        if (cancelled) return;
        if (stored) {
          dispatch({
            type: 'hydrate',
            state: {
              ...initialState,
              ...stored,
              settings: { ...initialState.settings, ...stored.settings },
              mealPlan: stored.mealPlan.filter((item) => item.day != null),
            },
          });
        }
      })
      .catch(() => {
        /* A failed cache read must not prevent online startup. */
      })
      .finally(() => {
        if (!cancelled) setHydratedScope(scope);
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);
  React.useEffect(() => {
    if (!hydrated || !scope) return;
    const timeout = setTimeout(() => {
      void repository.write(scope, state).catch(() => {
        /* Server remains authoritative. */
      });
    }, 300);
    return () => clearTimeout(timeout);
  }, [hydrated, scope, state]);
  return <BordContext value={{ state, dispatch, hydrated }}>{children}</BordContext>;
}
export function useBord() {
  const context = React.use(BordContext);
  if (!context) throw new Error('useBord must be used inside BordStore');
  return context;
}
