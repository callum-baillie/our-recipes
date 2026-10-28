// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ScannerSessionList } from '@/components/scanner-session';
import { ProductPhotosProvider } from '@/components/product-photos';
import type { ScanSession, ScanSessionEntry } from '@/lib/domain/scanner-session';

const entry = (id: string, over: Partial<ScanSessionEntry> = {}): ScanSessionEntry => ({
  id,
  time: new Date('2026-10-28T12:00:00Z').toISOString(),
  kind: 'added',
  state: 'saved',
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
  },
  ...over,
});
const session = (entries: ScanSessionEntry[]): ScanSession => ({
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
});

let responses: ScanSession[];
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  localStorage.clear();
  responses = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(responses[Math.min(calls++, responses.length - 1)])),
  );
});
let calls = 0;
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  calls = 0;
});
const poll = () => act(async () => void (await vi.advanceTimersByTimeAsync(1100)));
const counter = () => document.querySelector('[aria-label="Register display"] strong')?.textContent;
const rows = () => [...document.querySelectorAll('[aria-label="Scanned items"] > li')];

it('polls about once a second and animates only changes seen after the first load', async () => {
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
  render(
    createElement(
      ProductPhotosProvider,
      { enabled: false },
      createElement(ScannerSessionList, {
        stations: [{ id: 'kitchen', name: 'Kitchen' }],
        canEdit: true,
      }),
    ),
  );
  await poll();
  expect(rows()).toHaveLength(1);
  expect(rows()[0]!.getAttribute('data-motion')).toBeNull();
  expect(counter()).toBe('1');

  await poll();
  expect(rows().map((row) => row.getAttribute('data-motion'))).toEqual(['in', null]);
  expect(document.querySelector('[role=status]')!.textContent).toContain('Added Item b');
  expect(counter()).toBe('2');

  await poll();
  expect(rows()[0]!.getAttribute('data-motion')).toBe('bump');
  expect(rows()[0]!.textContent).toContain('750 g');

  await poll();
  expect(rows()[0]!.getAttribute('data-motion')).toBe('void');
  expect(rows()[0]!.getAttribute('data-state')).toBe('removed');
  expect(rows()[0]!.textContent).toContain('Void');
  expect(counter()).toBe('1');

  await act(async () => void (await vi.advanceTimersByTimeAsync(2000)));
  expect(rows()[0]!.getAttribute('data-motion')).toBeNull();
});
