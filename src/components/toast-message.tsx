'use client';
import { useEffect } from 'react';
import { useToast } from './toast-provider';
/** Transient feedback. Field validation and actionable decisions stay beside their controls. */
export function ToastMessage({
  message,
  tone = 'info',
}: {
  message: string;
  tone?: 'info' | 'error' | 'success';
}) {
  const { showToast } = useToast();
  useEffect(() => {
    if (message) return showToast(message, tone, { key: `feedback:${tone}:${message}` });
  }, [message, tone, showToast]);
  return null;
}
