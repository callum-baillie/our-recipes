import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Capture recipe',
  description: 'Create a reviewable recipe draft from pasted text.',
};

export default function CaptureLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
