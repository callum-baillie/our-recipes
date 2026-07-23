import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import Script from 'next/script';

import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { AppFooter } from '@/components/app-footer';
import { AppHeader } from '@/components/app-header';
import { PwaRegistration } from '@/components/pwa-registration';
import { ToastProvider } from '@/components/toast-provider';
import {
  APPEARANCE_COOKIE_KEYS,
  PALETTES,
  parseBrandIcon,
  parseColorMode,
  parsePalette,
} from '@/lib/appearance';
import { getHouseholdState } from '@/lib/services/household-service';
import { startAiSummaryScheduler } from '@/lib/services/ai-summary-service';
import { brandedKitchenTitle, DEFAULT_KITCHEN_NAME, PRODUCT_NAME } from '@/lib/brand';

import './globals.css';
import './themes.css';

export const dynamic = 'force-dynamic';

function iconUrl(palette: string, icon: string, size: number) {
  return `/api/v1/branding/icons/v1/${palette}/${icon}/${size}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const palette = parsePalette(cookieStore.get(APPEARANCE_COOKIE_KEYS.palette)?.value);
  const household = getHouseholdState().household;
  const kitchenIcon = parseBrandIcon(household?.kitchenIcon);
  const kitchenName = household?.kitchenName ?? DEFAULT_KITCHEN_NAME;
  const title = brandedKitchenTitle(kitchenName);
  return {
    applicationName: PRODUCT_NAME,
    title: { default: title, template: `%s · ${title}` },
    description: `${PRODUCT_NAME} is a recipe keeper, meal planner, nutritional advisor, and grocery store helper.`,
    manifest: `/manifest.webmanifest?palette=${palette}&icon=${kitchenIcon}`,
    appleWebApp: { capable: true, title: kitchenName, statusBarStyle: 'default' },
    formatDetection: { telephone: false },
    icons: {
      icon: [
        { url: iconUrl(palette, kitchenIcon, 32), sizes: '32x32', type: 'image/png' },
        { url: iconUrl(palette, kitchenIcon, 192), sizes: '192x192', type: 'image/png' },
      ],
      apple: [{ url: iconUrl(palette, kitchenIcon, 180), sizes: '180x180', type: 'image/png' }],
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const cookieStore = await cookies();
  const palette = parsePalette(cookieStore.get(APPEARANCE_COOKIE_KEYS.palette)?.value);
  const mode = parseColorMode(cookieStore.get(APPEARANCE_COOKIE_KEYS.mode)?.value);
  const colors = PALETTES[palette];
  return {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor:
      mode === 'system'
        ? [
            { media: '(prefers-color-scheme: light)', color: colors.light.primary },
            { media: '(prefers-color-scheme: dark)', color: colors.dark.page },
          ]
        : colors[mode].primary,
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  startAiSummaryScheduler();
  const state = getHouseholdState();
  const cookieStore = await cookies();
  const actor = getActorContext(cookieStore.get(ACTIVE_PROFILE_COOKIE)?.value);
  const palette = parsePalette(cookieStore.get(APPEARANCE_COOKIE_KEYS.palette)?.value);
  const mode = parseColorMode(cookieStore.get(APPEARANCE_COOKIE_KEYS.mode)?.value);
  const kitchenIcon = parseBrandIcon(state.household?.kitchenIcon);
  const kitchenName = state.household?.kitchenName ?? DEFAULT_KITCHEN_NAME;

  return (
    <html
      lang="en"
      data-palette={palette}
      data-theme={mode === 'system' ? undefined : mode}
      data-brand-icon={kitchenIcon}
      suppressHydrationWarning
    >
      <head>
        <Script id="theme-preference" strategy="beforeInteractive">
          {`(function(){try{var r=document.documentElement,p=localStorage.getItem('bord-palette')||localStorage.getItem('our-recipes-palette'),t=localStorage.getItem('bord-theme')||localStorage.getItem('our-recipes-theme');if(/^(green|orange|blue|purple|grayscale)$/.test(p||'')){r.dataset.palette=p;localStorage.setItem('bord-palette',p);document.cookie='bord-palette='+p+'; Path=/; Max-Age=31536000; SameSite=Lax'}if(t==='light'||t==='dark'){r.dataset.theme=t;r.style.colorScheme=t;localStorage.setItem('bord-theme',t);document.cookie='bord-mode='+t+'; Path=/; Max-Age=31536000; SameSite=Lax'}else{delete r.dataset.theme;r.style.colorScheme='light dark';document.cookie='bord-mode=system; Path=/; Max-Age=31536000; SameSite=Lax'}}catch(e){}})();`}
        </Script>
      </head>
      <body>
        <ToastProvider>
          {state.household ? (
            <AppHeader
              kitchenName={state.household.kitchenName}
              activeProfileId={actor.profileId}
              profiles={state.profiles}
              kitchenIcon={kitchenIcon}
            />
          ) : null}
          {children}
          <AppFooter kitchenName={kitchenName} />
          <PwaRegistration />
        </ToastProvider>
      </body>
    </html>
  );
}
