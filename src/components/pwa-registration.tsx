'use client';

import { useEffect } from 'react';

export function PwaRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

    const shouldRegister =
      process.env.NODE_ENV === 'production' ||
      process.env.NEXT_PUBLIC_ENABLE_PWA_IN_DEVELOPMENT === 'true';

    if (!shouldRegister) {
      void navigator.serviceWorker
        .getRegistrations()
        .then(async (registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        )
        .then((results) => {
          if (results.some(Boolean)) window.location.reload();
        });
      return;
    }

    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch(() => {
        // Offline reading is an enhancement; the household workflow remains usable online.
      });
  }, []);

  return null;
}
