import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { offlineDestination } from '@/components/kitchen-connection';
const source = readFileSync('public/sw.js', 'utf8');
const appVersion = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string })
  .version;
function worker(update = true) {
  const handlers = new Map<string, (event: Record<string, unknown>) => void>();
  const client = {
    id: 'open-client',
    url: 'https://kitchen.test/recipes/fixture',
    navigate: vi.fn(),
    postMessage: vi.fn(),
  };
  const entries = new Map<string, Response>();
  entries.set(
    '/offline',
    new Response('<html><script src="/_next/static/offline-fixture.js"></script></html>'),
  );
  const deleted: string[] = [];
  const current = {
    match: vi.fn(async (request: { url?: string } | string) =>
      entries.get(typeof request === 'string' ? request : (request.url ?? '')),
    ),
    put: vi.fn(),
    add: vi.fn(async () => undefined),
    addAll: vi.fn(async () => undefined),
  };
  const cache = {
    open: vi.fn(async () => current),
    keys: vi.fn(async () => [
      'bord-read-previous',
      'our-recipes-read-legacy',
      'unrelated-cache',
      `bord-read-${appVersion}`,
    ]),
    delete: vi.fn(async (name: string) => {
      deleted.push(name);
      return true;
    }),
    match: vi.fn(async () => entries.get('/offline')),
  };
  const self = {
    registration: { active: update ? {} : undefined },
    location: { origin: 'https://kitchen.test' },
    clients: { claim: vi.fn(), matchAll: vi.fn(async () => [client]) },
    skipWaiting: vi.fn(),
    addEventListener: (type: string, handler: (event: Record<string, unknown>) => void) =>
      handlers.set(type, handler),
  };
  const fetch = vi.fn(async () => {
    throw new TypeError('Fixture offline');
  });
  const context = createContext({
    self,
    caches: cache,
    fetch,
    URL,
    Request: class extends Request {
      constructor(input: string, init?: RequestInit) {
        super(new URL(input, 'https://kitchen.test'), init);
      }
    },
    Response,
    Headers,
    Map,
    Promise,
  });
  runInContext(source, context);
  async function event(type: string, extra: Record<string, unknown> = {}) {
    let promise: Promise<unknown> | undefined;
    handlers.get(type)!({
      ...extra,
      waitUntil: (work: Promise<unknown>) => {
        promise = work;
      },
    });
    await promise;
  }
  return { handlers, self, client, cache, current, deleted, entries, fetch, event };
}
describe('read-only service-worker updates', () => {
  it('waits for an explicit update activation and never navigates open forms', async () => {
    const w = worker();
    await w.event('install');
    expect(w.current.addAll).toHaveBeenCalledWith([
      'https://kitchen.test/_next/static/offline-fixture.js',
    ]);
    expect(w.self.skipWaiting).not.toHaveBeenCalled();
    await w.event('activate');
    expect(w.client.navigate).not.toHaveBeenCalled();
    expect(w.client.postMessage).toHaveBeenCalledWith({
      type: 'BORD_UPDATED',
      version: appVersion,
    });
    expect(w.deleted).toEqual([]);
    await w.event('message', { data: { type: 'SKIP_WAITING' } });
    expect(w.self.skipWaiting).toHaveBeenCalledTimes(1);
  });
  it('retains old caches until every window acknowledges the loaded build, and keeps auth clearing', async () => {
    const w = worker();
    await w.event('message', {
      data: { type: 'BORD_CLIENT_READY', version: 'previous' },
      source: { id: 'open-client' },
    });
    expect(w.deleted).toEqual([]);
    await w.event('message', {
      data: { type: 'BORD_CLIENT_READY', version: appVersion },
      source: { id: 'open-client' },
    });
    expect(w.deleted).toEqual(['bord-read-previous', 'our-recipes-read-legacy']);
    w.deleted.length = 0;
    await w.event('message', { data: { type: 'CLEAR_AUTH_CACHES' } });
    expect(w.deleted).toContain(`bord-read-${appVersion}`);
    expect(w.deleted).not.toContain('unrelated-cache');
  });
  it('serves an eligible cached recipe but never claims an offline catalogue or handles writes', async () => {
    const w = worker(false);
    w.entries.set('/offline', new Response('Offline note'));
    w.entries.set('https://kitchen.test/recipes/fixture', new Response('Cached recipe'));
    async function navigate(path: string) {
      let response: Promise<Response> | undefined;
      w.handlers.get('fetch')!({
        request: {
          method: 'GET',
          url: `https://kitchen.test${path}`,
          mode: 'navigate',
          headers: new Headers(),
        },
        respondWith: (value: Promise<Response>) => {
          response = value;
        },
      });
      return response!;
    }
    expect(await (await navigate('/recipes/fixture')).text()).toBe('Cached recipe');
    const library = await navigate('/recipes');
    expect(library.headers.get('X-Bord-Offline')).toBe('1');
    expect(await library.text()).toBe('Offline note');
    const respond = vi.fn();
    w.handlers.get('fetch')!({
      request: { method: 'POST', url: 'https://kitchen.test/api/v1/recipes' },
      respondWith: respond,
    });
    expect(respond).not.toHaveBeenCalled();
  });
  it('restricts retry destinations to same-origin pages and prevents offline loops', () => {
    expect(offlineDestination('https://elsewhere.test/recipes', 'https://kitchen.test')).toBe(
      '/recipes',
    );
    expect(offlineDestination('/offline?returnTo=/offline', 'https://kitchen.test')).toBe(
      '/recipes',
    );
    expect(offlineDestination('/api/v1/recipes', 'https://kitchen.test')).toBe('/recipes');
    expect(offlineDestination('/recipes/soup?view=full#method', 'https://kitchen.test')).toBe(
      '/recipes/soup?view=full#method',
    );
  });
});
