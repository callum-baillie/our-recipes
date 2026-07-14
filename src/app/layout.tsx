import type { Metadata } from 'next';

import { PwaRegistration } from '@/components/pwa-registration';

import './globals.css';

export const metadata: Metadata = {
  title: 'Our Recipes',
  description: 'A self-hosted household recipe manager.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}
