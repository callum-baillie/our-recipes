// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('@/components/toast-provider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/toast-provider')>()),
  useToast: () => toast,
}));
import { PwaRegistration } from '@/components/pwa-registration';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('does not describe a first worker installation as an application update', async () => {
  const installing = Object.assign(new EventTarget(), { state: 'installed' });
  const registration = Object.assign(new EventTarget(), {
    active: null,
    waiting: { postMessage: vi.fn() },
    installing,
    update: vi.fn(async () => undefined),
  });
  const workers = Object.assign(new EventTarget(), {
    controller: null,
    register: vi.fn(async () => registration),
  });
  vi.stubEnv('NEXT_PUBLIC_ENABLE_PWA_IN_DEVELOPMENT', 'true');
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', { onLine: true, serviceWorker: workers });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ status: 'ok' })),
  );
  await act(async () => {
    render(createElement(PwaRegistration));
  });
  await act(async () => {
    registration.dispatchEvent(new Event('updatefound'));
    installing.dispatchEvent(new Event('statechange'));
    workers.dispatchEvent(new Event('controllerchange'));
  });
  expect(screen.queryByRole('button', { name: 'Reload when ready' })).toBeNull();
});
it('keeps dirty and clean pages on the update notice until one explicit activation request', async () => {
  const post = vi.fn();
  const registration = Object.assign(new EventTarget(), {
    waiting: null as null | { postMessage: typeof post },
    installing: null,
    update: vi.fn(async () => undefined),
  });
  const workers = Object.assign(new EventTarget(), {
    controller: { postMessage: vi.fn() },
    register: vi.fn(async () => registration),
  });
  vi.stubEnv('NEXT_PUBLIC_ENABLE_PWA_IN_DEVELOPMENT', 'true');
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', { onLine: true, serviceWorker: workers });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ status: 'ok' })),
  );
  render(
    createElement(
      'div',
      null,
      createElement('form', null, createElement('input', { 'aria-label': 'Meaningful draft' })),
      createElement(PwaRegistration),
    ),
  );
  fireEvent.change(screen.getByLabelText('Meaningful draft'), {
    target: { value: 'Keep my entered work' },
  });
  const draft = screen.getByLabelText('Meaningful draft');
  draft.scrollIntoView = vi.fn();
  vi.spyOn(draft, 'getBoundingClientRect').mockReturnValue({
    bottom: 800,
  } as DOMRect);
  draft.focus();
  await act(async () => {
    workers.dispatchEvent(
      new MessageEvent('message', { data: { type: 'BORD_UPDATED', version: 'fixture-v2' } }),
    );
    workers.dispatchEvent(new Event('controllerchange'));
  });
  await screen.findByRole('button', { name: 'Reload when ready' });
  expect((screen.getByLabelText('Meaningful draft') as HTMLInputElement).value).toBe(
    'Keep my entered work',
  );
  expect(post).not.toHaveBeenCalled();
  expect(draft.scrollIntoView).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(draft);
  registration.waiting = { postMessage: post };
  fireEvent.click(screen.getByRole('button', { name: 'Reload when ready' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reloading…' }));
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
});
