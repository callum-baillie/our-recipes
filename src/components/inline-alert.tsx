'use client';
import type { ReactNode } from 'react';
import { ToastNotice } from './toast-provider';

export function InlineAlert({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'success' | 'warning' | 'error';
}) {
  return <ToastNotice tone={tone}>{children}</ToastNotice>;
}
