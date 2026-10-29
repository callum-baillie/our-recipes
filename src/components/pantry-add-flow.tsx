'use client';

import {
  ArrowLeft,
  Camera,
  Check,
  PenLine,
  ScanBarcode,
  Search,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { FoodCatalogPicker } from './food-catalog-picker';
import { PantryManualEntry } from './pantry-manual-entry';
import { PantryScanWorkspace } from './pantry-scan-workspace';
import { useToast } from './toast-provider';
import {
  useCameraScanSession,
  type PantryProductSummary,
} from '@/lib/client/use-camera-scan-session';
import { useHandheldSession } from '@/lib/client/use-handheld-session';
import styles from './pantry-add-flow.module.css';

export type AddMode = 'scan' | 'search' | 'manual';

type Location = { id: string; path: string; storageType: string };

const COPY: Record<AddMode, string> = {
  scan: 'Scan with your phone camera or a handheld scanner. Every scan goes straight into your pantry and appears below as it is added.',
  search:
    'Look up a product by name or barcode and check the match, nutrition and package size before it is added.',
  manual: 'For anything without a barcode: say what it is, how much, and where it lives.',
};

export function PantryAddFlow({
  accountId,
  profileId,
  canEdit,
  locations,
  products,
  stations,
  initialMode,
}: {
  accountId: string;
  profileId: string;
  canEdit: boolean;
  locations: Location[];
  products: PantryProductSummary[];
  stations: Array<{ id: string; name: string }>;
  initialMode: AddMode;
}) {
  const { showToast } = useToast();
  const [mode, setModeState] = useState<AddMode>(initialMode);
  const [lookup, setLookup] = useState('');
  const [added, setAdded] = useState<Array<{ id: number; label: string; count: number }>>([]);
  const [saving, setSaving] = useState(false);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const nextId = useRef(0);

  const camera = useCameraScanSession({ locations, products });
  const handheld = useHandheldSession({ accountId, stations, active: mode === 'scan' });

  const modes: Array<{ id: AddMode; label: string; icon: LucideIcon }> = [
    { id: 'scan', label: 'Scan', icon: stations.length ? ScanBarcode : Camera },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'manual', label: 'Manual', icon: PenLine },
  ];

  function setMode(next: AddMode) {
    setModeState(next);
    // Keep the address honest so a refresh or a shared link lands on the same method.
    window.history.replaceState(null, '', `/pantry/add?mode=${next}`);
  }

  function record(label: string, count = 1) {
    setAdded((current) => [{ id: ++nextId.current, label, count }, ...current].slice(0, 12));
  }

  function onKeyDown(event: KeyboardEvent, index: number) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const target =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? modes.length - 1
          : (index + step + modes.length) % modes.length;
    setMode(modes[target]!.id);
    tabs.current[target]?.focus();
  }

  const total = added.reduce((sum, item) => sum + item.count, 0) + camera.count;

  const tray: ReactNode =
    added.length > 0 ? (
      <section className={styles.tray} aria-label="Added this visit">
        <h2>Added this visit</h2>
        <ul>
          {added.map((item) => (
            <li key={item.id}>
              <Check size={14} aria-hidden="true" />
              <span>{item.label}</span>
              {item.count > 1 && <small>×{item.count}</small>}
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.back} href="/pantry" aria-label="Back to pantry">
          <ArrowLeft size={18} aria-hidden="true" /> Pantry
        </Link>
        <div className={styles.title}>
          <h1>Add to pantry</h1>
          <p key={mode}>{COPY[mode]}</p>
        </div>
        <Link
          className="primary-button"
          href="/pantry"
          aria-disabled={saving}
          onClick={(event) => saving && event.preventDefault()}
        >
          {total > 0 ? <Check size={17} aria-hidden="true" /> : null}
          {total > 0 ? `Done · ${total} added` : 'Done'}
        </Link>
      </header>

      <div className={styles.modes} role="tablist" aria-label="How to add">
        {modes.map(({ id, label, icon: Icon }, index) => (
          <button
            key={id}
            ref={(node) => {
              tabs.current[index] = node;
            }}
            id={`add-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={mode === id}
            aria-controls={`add-panel-${id}`}
            tabIndex={mode === id ? 0 : -1}
            onClick={() => setMode(id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <Icon size={17} aria-hidden="true" />
            <span>{label}</span>
            {id === 'scan' && camera.count + handheld.liveCount > 0 && (
              <small>{camera.count + handheld.liveCount}</small>
            )}
          </button>
        ))}
      </div>

      {/* The scan list stays mounted so scans are not lost while another method is open. */}
      <div
        id="add-panel-scan"
        role="tabpanel"
        aria-labelledby="add-tab-scan"
        className={styles.stage}
        hidden={mode !== 'scan'}
      >
        <PantryScanWorkspace
          camera={camera}
          handheld={handheld}
          stations={stations}
          locations={locations}
          canEdit={canEdit}
          visible={mode === 'scan'}
          onSwitchToSearch={() => setMode('search')}
        />
      </div>

      {mode === 'search' && (
        <div
          id="add-panel-search"
          role="tabpanel"
          aria-labelledby="add-tab-search"
          className={`${styles.stage} ${styles.split}`}
        >
          <div className={styles.card}>
            <h2 className="visually-hidden">Find a product</h2>
            <FoodCatalogPicker
              context="pantry"
              embedded
              activeTab="search"
              onTabChange={(tab) => setMode(tab === 'scan' ? 'scan' : 'search')}
              defaultQuery={lookup}
              locations={locations}
              disabled={!canEdit || !locations.length}
              searchSuggestions={products.map((product) => product.displayName)}
              onSavingChange={setSaving}
              onManualRequest={() => setMode('manual')}
              onImported={(product) => {
                showToast(`${product.displayName} added to your pantry.`, 'success');
                record(product.displayName);
              }}
            />
          </div>
          <aside className={styles.side}>
            {tray ?? (
              <section className={styles.tips} aria-label="Search tips">
                <h2>Tips</h2>
                <ul>
                  <li>Type a barcode to find that exact product.</li>
                  <li>Pick a result to check its nutrition and package size first.</li>
                  <li>Items you add stay listed here so you can keep going.</li>
                </ul>
              </section>
            )}
          </aside>
        </div>
      )}

      {mode === 'manual' && (
        <div
          id="add-panel-manual"
          role="tabpanel"
          aria-labelledby="add-tab-manual"
          className={styles.stage}
        >
          <PantryManualEntry
            accountId={accountId}
            profileId={profileId}
            canEdit={canEdit}
            locations={locations}
            products={products}
            onAdded={record}
            onFindFood={(query) => {
              setLookup(query);
              setMode('search');
            }}
            tray={tray}
          />
        </div>
      )}
    </div>
  );
}
