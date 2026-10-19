'use client';
import { useRef, useState } from 'react';

/** Each form owns its acknowledged snapshot. Freeze its fields while submitting. */
export function useSettingsSave<T>(initial: T) {
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);
  async function save(action: (snapshot: T) => Promise<T>, success: string) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setMessage('');
    setFailed(false);
    try {
      const acknowledged = await action(values);
      setSaved(acknowledged);
      setValues(acknowledged);
      setMessage(success);
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : 'Check your connection and retry.');
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return {
    values,
    setValues: ((next) => {
      setMessage('');
      setFailed(false);
      setValues(next);
    }) as typeof setValues,
    pending,
    dirty,
    status: pending
      ? 'Saving…'
      : failed
        ? message
        : dirty
          ? 'Unsaved changes'
          : message || 'No unsaved changes',
    save,
  };
}
