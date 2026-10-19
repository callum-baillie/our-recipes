// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppDialog } from '@/components/app-dialog';
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value() {
      this.open = false;
    },
  });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(
    () => [{ width: 44, height: 44 }] as unknown as DOMRectList,
  );
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(callback, 0),
  );
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('wraps the only enabled control when a fieldset disables the remaining controls', async () => {
  render(
    createElement(
      AppDialog,
      { onClose: vi.fn(), 'aria-label': 'Pending task' },
      createElement('button', null, 'Available link'),
      createElement(
        'fieldset',
        { disabled: true },
        createElement('input', { 'aria-label': 'Unavailable setting' }),
      ),
    ),
  );
  const first = screen.getByRole('button', { name: 'Available link' });
  await waitFor(() => expect(document.activeElement).toBe(first));
  const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  first.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(first);
});
it('includes native summaries and visible fixed controls in the focus boundary', async () => {
  render(
    createElement(
      AppDialog,
      { onClose: vi.fn(), 'aria-label': 'Review' },
      createElement('button', { style: { position: 'fixed' } }, 'Close'),
      createElement('details', null, createElement('summary', null, 'Recipe details')),
    ),
  );
  const first = screen.getByRole('button', { name: 'Close' });
  await waitFor(() => expect(document.activeElement).toBe(first));
  const summary = screen.getByText('Recipe details');
  summary.focus();
  const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  summary.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(first);
});

it('recovers Tab when the active submit button becomes disabled during a request', async () => {
  render(
    createElement(
      AppDialog,
      { onClose: vi.fn(), 'aria-label': 'Pending' },
      createElement('a', { href: '/settings' }, 'Settings'),
      createElement('button', null, 'Generate'),
    ),
  );
  const first = screen.getByRole('link', { name: 'Settings' });
  await waitFor(() => expect(document.activeElement).toBe(first));
  const submit = screen.getByRole('button', { name: 'Generate' }) as HTMLButtonElement;
  submit.focus();
  submit.disabled = true;
  const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  submit.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(first);
});

it('restores focus after a busy render leaves native focus on body', async () => {
  const content = (busy: boolean) =>
    createElement(
      AppDialog,
      { onClose: vi.fn(), 'aria-label': 'Busy task' },
      createElement('a', { href: '/settings' }, 'Settings'),
      createElement('button', { disabled: busy }, 'Generate'),
    );
  const view = render(content(false));
  const first = screen.getByRole('link', { name: 'Settings' });
  await waitFor(() => expect(document.activeElement).toBe(first));
  const submit = screen.getByRole('button', { name: 'Generate' });
  submit.focus();
  submit.blur();
  expect(document.activeElement).toBe(document.body);
  view.rerender(content(true));
  await waitFor(() => expect(document.activeElement).toBe(first));
});

it.each([false, true])(
  'returns focus to the opening control or an explicit handoff destination (%s)',
  async (handoff) => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open task';
    const destination = document.createElement('button');
    destination.textContent = 'Continue in tools';
    document.body.append(trigger, destination);
    trigger.focus();
    const returnFocusRef: { current: HTMLElement | null } = { current: null };
    const view = render(
      createElement(
        AppDialog,
        { onClose: vi.fn(), returnFocusRef, 'aria-label': 'Task handoff' },
        createElement('button', null, 'Inside task'),
      ),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Inside task' })),
    );
    if (handoff) returnFocusRef.current = destination;
    view.unmount();
    await waitFor(() => expect(document.activeElement).toBe(handoff ? destination : trigger));
    trigger.remove();
    destination.remove();
  },
);
