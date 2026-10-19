'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type NutritionTaskFeedback = {
  phase: 'pending' | 'success' | 'error' | 'uncertain';
  message: string;
};

/** One synchronous mutation lock; feedback belongs to the submitted task and profile. */
export function useNutritionRequest(scope: string) {
  const [feedbackState, setFeedbackState] = useState<{
    scope: string;
    values: Record<string, NutritionTaskFeedback>;
  }>({ scope, values: {} });
  const feedback = feedbackState.scope === scope ? feedbackState.values : {};
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const lock = useRef(false);
  const owner = useRef(scope);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    owner.current = scope;
  }, [scope]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const blocked = useRef(new Set<string>());
  const uncertain = useRef(new Set<string>());

  function message(task: string, phase: NutritionTaskFeedback['phase'], text: string) {
    if (mounted.current && owner.current === scope)
      setFeedbackState((current) => ({
        scope,
        values: {
          ...(current.scope === scope ? current.values : {}),
          [task]: { phase, message: text },
        },
      }));
  }
  async function send<T extends object = Record<string, unknown>>(
    task: string,
    url: string,
    body: unknown,
    options: { replay?: boolean; readOnly?: boolean; pending?: string } = {},
  ): Promise<T | null> {
    if (lock.current || blocked.current.has(`${scope}:${task}`)) return null;
    lock.current = true;
    const submittedOwner = scope;
    const current = () => mounted.current && owner.current === submittedOwner;
    setBusyTask(task);
    message(task, 'pending', options.pending ?? 'Saving…');
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!current()) return null;
      if (!response.ok && response.status < 500) {
        message(task, 'error', data?.error?.message ?? 'Check the entered values and try again.');
        return null;
      }
      if (!response.ok || !data) throw new Error('Unconfirmed outcome');
      uncertain.current.delete(`${submittedOwner}:${task}`);
      message(task, 'success', 'Saved.');
      return data as T;
    } catch {
      if (current()) {
        if (!options.readOnly) uncertain.current.add(`${submittedOwner}:${task}`);
        if (!options.replay && !options.readOnly) blocked.current.add(`${submittedOwner}:${task}`);
        message(
          task,
          options.readOnly ? 'error' : 'uncertain',
          options.readOnly
            ? 'The preview could not be loaded. Your inputs are retained; try again.'
            : options.replay
              ? 'The result is not confirmed. Your input is retained; retrying this exact request uses the same operation key.'
              : 'The result is not confirmed. Your input is retained. Check the diary or saved data before trying again; refresh this page after checking.',
        );
      }
      return null;
    } finally {
      lock.current = false;
      if (mounted.current) setBusyTask(null);
    }
  }
  return {
    feedback,
    busyTask,
    pending: busyTask !== null,
    isPending: () => lock.current,
    send,
    message,
    isUncertain: (task: string) => uncertain.current.has(`${scope}:${task}`),
    isBlocked: (task: string) => blocked.current.has(`${scope}:${task}`),
  };
}
