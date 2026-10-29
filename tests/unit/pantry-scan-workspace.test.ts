// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PantryScanWorkspace } from '@/components/pantry-scan-workspace';
import { useCameraScanSession } from '@/lib/client/use-camera-scan-session';
import { useHandheldSession } from '@/lib/client/use-handheld-session';
import { ProductPhotosProvider } from '@/components/product-photos';
import { ToastProvider } from '@/components/toast-provider';
import type { ScanSession, ScanSessionEntry } from '@/lib/domain/scanner-session';

const entry = (id: string, over: Partial<ScanSessionEntry> = {}): ScanSessionEntry => ({
  id,
  time: new Date('2026-10-28T12:00:00Z').toISOString(),
  kind: 'added',
  state: 'saved',
  resolved: false,
  title: `Item ${id}`,
  detail: '',
  barcode: null,
  gtin: null,
  brand: '',
  quantity: 500,
  unit: 'g',
  canUndo: true,
  edited: false,
  batch: {
    id: `b-${id}`,
    version: 1,
    quantity: 500,
    unit: 'g',
    location: 'Pantry',
    status: 'unopened',
    bestBefore: null,
  },
  ...over,
});
const unknown = (id: string) =>
  entry(id, {
    state: 'review',
    kind: 'other',
    title: 'Needs review',
    barcode: '4006381333931',
    batch: null,
    quantity: null,
  });
const session = (entries: ScanSessionEntry[], over: Partial<ScanSession> = {}): ScanSession => ({
  stationId: 'kitchen',
  name: 'Kitchen',
  stale: false,
  readerConnected: true,
  mode: 'add',
  bindingId: 'binding',
  instanceId: 'instance',
  serverTime: Date.now(),
  since: 0,
  entries,
  ...over,
});

let responses: ScanSession[];
let calls = 0;
let posts: Array<{ url: string; body: unknown }>;
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  localStorage.clear();
  responses = [];
  calls = 0;
  posts = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (init?.method === 'POST') posts.push({ url, body });
      if (url === '/api/v1/food-data/barcode-lookups')
        return Response.json({ localProduct: { id: 'p', displayName: 'Beans', brand: 'Heinz' } });
      if (url === '/api/v1/pantry/batches')
        return Response.json({ batch: cameraBatch(1, 1) }, { status: 201 });
      if (url === '/api/v1/pantry/batches/cb' && init?.method !== 'POST')
        return Response.json({ batch: cameraBatch(1, 1) });
      if (url.endsWith('/actions')) return Response.json({ batch: { id: 'cb', version: 2 } });
      if (init?.method === 'POST')
        return Response.json({ product: { id: 'p' }, batch: { id: 'b' } }, { status: 201 });
      return Response.json(responses[Math.min(calls++, responses.length - 1)]);
    }),
  );
});
const cameraBatch = (version: number, quantityRemaining: number) => ({
  id: 'cb',
  version,
  quantityRemaining,
  unit: 'each',
  locationId: 'l1',
  bestBeforeDate: null,
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const poll = () => act(async () => void (await vi.advanceTimersByTimeAsync(1600)));
const locations = [
  { id: 'l1', path: 'Pantry', storageType: 'pantry' },
  { id: 'l2', path: 'Fridge', storageType: 'refrigerator' },
];
const stations = [{ id: 'kitchen', name: 'Kitchen' }];
function Harness() {
  const camera = useCameraScanSession({
    locations,
    products: [
      {
        id: 'p',
        displayName: 'Beans',
        brand: 'Heinz',
        defaultInventoryUnit: 'each',
        defaultPackageAmount: null,
        defaultPackageUnit: '',
      },
    ],
  });
  const handheld = useHandheldSession({ accountId: 'account', stations, active: true });
  return createElement(
    'div',
    null,
    createElement('button', { onClick: () => camera.scan('4006381333931') }, 'camera scan'),
    createElement(PantryScanWorkspace, {
      camera,
      handheld,
      stations,
      locations,
      canEdit: true,
      visible: false,
      onSwitchToSearch: () => undefined,
    }),
  );
}
const mount = () =>
  render(createElement(ProductPhotosProvider, { enabled: false }, createElement(Harness)), {
    wrapper: ToastProvider,
  });
const rows = () => [...document.querySelectorAll('[aria-label="Scanned items"] li')];

it('animates only changes seen after the first load', async () => {
  const a = entry('a');
  responses = [
    session([a]),
    session([a]),
    session([entry('b'), a]),
    session([entry('b', { batch: { ...entry('b').batch!, quantity: 750 } }), a]),
    session([
      entry('b', { batch: { ...entry('b').batch!, quantity: 750, status: 'discarded' } }),
      a,
    ]),
  ];
  mount();
  await poll();
  expect(rows()).toHaveLength(1);
  expect(rows()[0]!.getAttribute('data-motion')).toBeNull();

  await poll();
  expect(rows().map((row) => row.getAttribute('data-motion'))).toEqual(['in', null]);
  expect(document.querySelector('[role=status]')!.textContent).toContain('Scanned Item b');

  await poll();
  expect(rows()[0]!.getAttribute('data-motion')).toBe('bump');

  await poll();
  expect(rows()[0]!.getAttribute('data-motion')).toBe('void');
  expect(rows()[0]!.getAttribute('data-removed')).toBe('true');

  await act(async () => void (await vi.advanceTimersByTimeAsync(2000)));
  expect(rows()[0]!.getAttribute('data-motion')).toBeNull();
});

it('prompts for the first scan, and marks what it showed as reviewed', async () => {
  responses = [session([])];
  mount();
  await poll();
  expect(screen.getByRole('heading', { name: 'Ready when you are' })).toBeTruthy();
  responses = [session([entry('a')])];
  await poll();
  expect(Number(localStorage.getItem('scan-review:account:kitchen'))).toBeGreaterThan(0);
});

it('groups repeat scans of an unrecognised barcode and names them as one product', async () => {
  responses = [session([unknown('x'), unknown('y'), unknown('z')])];
  mount();
  await poll();
  expect(screen.getAllByText('Unrecognised barcode')).toHaveLength(1);
  expect(screen.getByText('scanned 3 times')).toBeTruthy();
  const input = screen.getByLabelText('Product name for barcode 4006381333931');
  fireEvent.change(input, { target: { value: 'Baked beans' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Add 3' }));
  });
  expect(posts).toHaveLength(1);
  expect(posts[0]!.url).toBe('/api/v1/pantry/barcode-products');
  expect(posts[0]!.body).toMatchObject({
    barcode: '4006381333931',
    product: { displayName: 'Baked beans', defaultInventoryUnit: 'package' },
    batch: { quantityRemaining: 3, unit: 'package', locationId: 'l1' },
  });
});

it('hides barcodes that have since been saved as products', async () => {
  responses = [session([{ ...unknown('x'), resolved: true }])];
  mount();
  await poll();
  expect(screen.queryByText('Unrecognised barcode')).toBeNull();
});

it('adds a camera scan straight away and a repeat scan adds another', async () => {
  responses = [session([])];
  mount();
  await poll();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'camera scan' }));
  });
  await act(async () => void (await vi.advanceTimersByTimeAsync(50)));
  expect(posts.map((post) => post.url)).toEqual([
    '/api/v1/food-data/barcode-lookups',
    '/api/v1/pantry/batches',
  ]);
  expect(posts[1]!.body).toMatchObject({ productId: 'p', quantityRemaining: 1, locationId: 'l1' });
  expect(rows()).toHaveLength(1);
  expect(rows()[0]!.textContent).toContain('Beans');
  expect(rows()[0]!.textContent).toContain('Camera');

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'camera scan' }));
  });
  await act(async () => void (await vi.advanceTimersByTimeAsync(50)));
  expect(posts.at(-1)!.url).toBe('/api/v1/pantry/batches/cb/actions');
  expect(posts.at(-1)!.body).toMatchObject({ type: 'correct', quantityRemaining: 2 });
  expect(rows()).toHaveLength(1);
});
