'use client';
import { useState, type ReactNode } from 'react';
import { productImagePath } from '@/lib/domain/product-image';
import { useProductPhotos } from './product-photos';
import styles from './product-image.module.css';

// A barcode with no photo is remembered for this page session so lists never re-request it.
const unavailable = new Set<string>();

/**
 * A square product photo matched on an exact barcode. The fallback (usually the category icon)
 * is always rendered beneath, so a missing, slow or blocked photo never leaves a gap. The photo
 * is decorative: the product name is always shown beside it.
 */
export function ProductImage({
  gtin,
  fallback,
  className,
  eager = false,
}: {
  gtin: string | null | undefined;
  fallback: ReactNode;
  className?: string;
  eager?: boolean;
}) {
  const enabled = useProductPhotos();
  const wanted = enabled && gtin && !unavailable.has(gtin) ? gtin : null;
  return (
    <span
      className={`${styles.frame}${className ? ` ${className}` : ''}`}
      data-has-photo={wanted ? 'true' : 'false'}
    >
      <span className={styles.fallback} aria-hidden="true">
        {fallback}
      </span>
      {wanted && <Photo key={wanted} gtin={wanted} eager={eager} />}
    </span>
  );
}

function Photo({ gtin, eager }: { gtin: string; eager: boolean }) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  if (state === 'failed') return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin proxy; next/image would re-fetch it
    <img
      className={styles.photo}
      data-state={state}
      src={productImagePath(gtin)}
      alt=""
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      referrerPolicy="no-referrer"
      onLoad={() => setState('ready')}
      onError={() => {
        unavailable.add(gtin);
        setState('failed');
      }}
    />
  );
}

/** Required by the photos' CC BY-SA 3.0 licence wherever they are shown. */
export function PhotoCredit({ className }: { className?: string }) {
  if (!useProductPhotos()) return null;
  return (
    <p className={`${styles.credit}${className ? ` ${className}` : ''}`}>
      Product photos from{' '}
      <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer noopener">
        Open Food Facts
      </a>{' '}
      contributors,{' '}
      <a
        href="https://creativecommons.org/licenses/by-sa/3.0/"
        target="_blank"
        rel="noreferrer noopener"
      >
        CC BY-SA 3.0
      </a>
      . Resized and converted to JPEG.
    </p>
  );
}
