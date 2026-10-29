'use client';

import Link from 'next/link';
import { Camera, Radio, ScanBarcode, WifiOff } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { PhotoCredit } from './product-image';
import { SessionItemRow, UnnamedCard, type Location } from './scan-session-cards';
import { AsyncSkeleton } from './skeleton';
import type { useCameraScanSession } from '@/lib/client/use-camera-scan-session';
import type { useHandheldSession } from '@/lib/client/use-handheld-session';
import styles from './pantry-scan-workspace.module.css';

const BarcodeScanner = dynamic(
  () => import('@/components/barcode-scanner').then((module) => module.BarcodeScanner),
  {
    ssr: false,
    loading: () => <AsyncSkeleton label="Opening barcode scanner" variant="scanner" />,
  },
);

type Camera = ReturnType<typeof useCameraScanSession>;
type Handheld = ReturnType<typeof useHandheldSession>;

/**
 * One list for everything scanned this visit. The camera and a handheld scanner feed it the same
 * way: each scan lands in the pantry at once and is adjusted afterwards, on the same card.
 */
export function PantryScanWorkspace({
  camera,
  handheld,
  stations,
  locations,
  canEdit,
  visible,
  onSwitchToSearch,
}: {
  camera: Camera;
  handheld: Handheld;
  stations: Array<{ id: string; name: string }>;
  locations: Location[];
  canEdit: boolean;
  /** Only the visible workspace may hold the camera. */
  visible: boolean;
  onSwitchToSearch: () => void;
}) {
  const [open, setOpen] = useState('');
  const [cameraOn, setCameraOn] = useState(false);

  const items = [...camera.items, ...handheld.items].sort(
    (a, b) => Date.parse(b.time) - Date.parse(a.time),
  );
  const unnamed = [
    ...camera.unnamed.map((entry) => ({ ...entry, source: 'camera' as const })),
    ...handheld.unnamed.map((entry) => ({ ...entry, source: 'handheld' as const })),
  ];
  const total = camera.count + handheld.liveCount;
  const hasAny = items.length > 0 || unnamed.length > 0 || handheld.meals.length > 0;

  return (
    <div className={styles.workspace} data-handheld-open={handheld.enabled || undefined}>
      <aside className={styles.sources} aria-label="Scanners">
        <section className={styles.panel} data-kind="camera" data-camera={cameraOn || undefined}>
          <header>
            <h2>
              <Camera size={16} aria-hidden="true" /> Phone camera
            </h2>
            {locations.length > 0 && (
              <label className={styles.where}>
                <span>Add to</span>
                <select
                  value={camera.locationId}
                  onChange={(event) => camera.setLocationId(event.target.value)}
                >
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.path}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </header>
          {visible && canEdit ? (
            <BarcodeScanner
              flush
              rapid
              onDetected={camera.scan}
              onActiveChange={setCameraOn}
              onSearchRequest={onSwitchToSearch}
            />
          ) : null}
          {!canEdit && <p className={styles.note}>Choose a household profile to add stock.</p>}
          <p className={styles.note}>
            Each scan is added straight away; scan again to add another. Adjust anything from the
            list. For nutrition and package details, use{' '}
            <button type="button" onClick={onSwitchToSearch}>
              Search
            </button>
            .
          </p>
        </section>

        {handheld.enabled && (
          <section className={styles.panel} data-kind="handheld" aria-label="Handheld scanner">
            <header>
              <h2>
                <ScanBarcode size={16} aria-hidden="true" /> Handheld scanner
              </h2>
              {stations.length > 1 && (
                <select
                  aria-label="Scanner"
                  value={handheld.stationId}
                  onChange={(event) => handheld.setStationId(event.target.value)}
                >
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </header>
            <p className={styles.status} data-live={handheld.offline ? undefined : 'true'}>
              <span aria-hidden="true" />
              <strong>{handheld.stationName}</strong>
              <span>{handheld.state}</span>
            </p>
            <p className={styles.note}>
              {handheld.offline
                ? 'Plug the scanner in and make sure the companion is running. Scans appear in the list the moment it reconnects.'
                : 'Just scan. Items are added even when this page is closed.'}
            </p>
          </section>
        )}
      </aside>

      <section className={styles.list} aria-labelledby="scan-session-title">
        <header>
          <h2 id="scan-session-title">
            This session
            {total > 0 && (
              <span className={styles.count} key={total}>
                {total}
              </span>
            )}
          </h2>
          <div>
            {handheld.since && (
              <button type="button" onClick={handheld.showEarlier}>
                Earlier scans
              </button>
            )}
            <button
              type="button"
              disabled={!hasAny}
              onClick={() => {
                camera.clear();
                if (handheld.enabled) handheld.startNew();
              }}
            >
              New list
            </button>
          </div>
        </header>

        <p className="visually-hidden" role="status" aria-live="polite">
          {handheld.announcement}
        </p>

        {!hasAny ? (
          <div className={styles.prompt} data-offline={handheld.enabled && handheld.offline}>
            {handheld.enabled && handheld.offline && !cameraOn ? (
              <WifiOff size={30} aria-hidden="true" />
            ) : (
              <Radio size={30} aria-hidden="true" />
            )}
            <h3>Ready when you are</h3>
            <p>
              {handheld.enabled
                ? 'Scan with your handheld scanner, or open the camera. Everything you scan shows up here as it is added.'
                : 'Open the camera and scan a barcode. Everything you scan shows up here as it is added.'}
            </p>
            {!handheld.enabled && <Link href="/settings/scanner">Connect a handheld scanner</Link>}
          </div>
        ) : (
          <>
            {unnamed.length > 0 && (
              <ul className={styles.stack} aria-label="Barcodes to name">
                {unnamed.map((entry) => (
                  <li key={`${entry.source}:${entry.barcode}`}>
                    <UnnamedCard
                      barcode={entry.barcode}
                      count={entry.count}
                      source={entry.source}
                      locations={locations}
                      canEdit={canEdit}
                      onSaved={(saved) =>
                        entry.source === 'camera'
                          ? camera.adopt(entry.barcode, saved)
                          : void handheld.refresh()
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
            {handheld.meals.length > 0 && (
              <ul className={styles.stack} aria-label="Meals to review">
                {handheld.meals.map((entry) => (
                  <li key={entry.id} className={styles.meal}>
                    <span>{entry.detail}</span>
                    <Link href={entry.recipeHref!}>Review this meal</Link>
                  </li>
                ))}
              </ul>
            )}
            {items.length > 0 && (
              <ul className={styles.stack} aria-label="Scanned items">
                {items.map((item) => (
                  <SessionItemRow
                    key={item.key}
                    item={item}
                    locations={locations}
                    canEdit={canEdit}
                    expanded={open === item.key}
                    pending={handheld.busy === item.key}
                    onToggle={() => setOpen(open === item.key ? '' : item.key)}
                    onRemove={() =>
                      item.source === 'camera'
                        ? void camera.remove(item.key)
                        : handheld.remove(item.key)
                    }
                    onChanged={() =>
                      item.source === 'camera' ? camera.refresh(item.key) : handheld.refresh()
                    }
                  />
                ))}
              </ul>
            )}
          </>
        )}
        {items.some((item) => item.gtin) && <PhotoCredit className={styles.credit} />}
      </section>
    </div>
  );
}
