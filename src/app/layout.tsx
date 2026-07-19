import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { AppFooter } from '@/components/app-footer';
import { AppHeader } from '@/components/app-header';
import { PwaRegistration } from '@/components/pwa-registration';
import { ToastProvider } from '@/components/toast-provider';
import { getHouseholdState } from '@/lib/services/household-service';

import './globals.css';

export const metadata: Metadata = {
  title: 'Our Recipes',
  description: 'A self-hosted household recipe manager.',
  appleWebApp: {
    capable: true,
    title: 'Our Recipes',
    statusBarStyle: 'default',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/our-recipes-app-icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#536938',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const state = getHouseholdState();
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);

  return (
    <html lang="en">
      <body>
        <ToastProvider>
          {state.household ? (
            <AppHeader
              appName={state.household.appName}
              activeProfileId={actor.profileId}
              profiles={state.profiles}
            />
          ) : null}
          {children}
          <AppFooter />
        </ToastProvider>
        <PwaRegistration />
      </body>
    </html>
  );
}
