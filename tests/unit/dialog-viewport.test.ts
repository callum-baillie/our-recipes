// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DialogViewport } from '@/components/dialog-viewport';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('reveals an already focused modal action after text changes its size', () => {
  let resize = () => {};
  const observe = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe = observe;
      disconnect() {}
    },
  );
  const scroll = vi.fn();
  HTMLElement.prototype.scrollIntoView = scroll;
  render(
    createElement(
      'dialog',
      { open: true },
      createElement('header', null, 'Reviewed food'),
      createElement('button', null, 'Confirm food'),
      createElement(DialogViewport),
    ),
  );
  const action = screen.getByRole('button', { name: 'Confirm food' });
  const dialog = action.closest('dialog')!;
  const header = dialog.querySelector('header')!;
  vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 400 } as DOMRect);
  vi.spyOn(header, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 60 } as DOMRect);
  let bottom = 300;
  vi.spyOn(action, 'getBoundingClientRect').mockImplementation(
    () => ({ top: bottom - 44, bottom }) as DOMRect,
  );
  action.focus();
  expect(observe).toHaveBeenCalledWith(action);
  expect(scroll).not.toHaveBeenCalled();
  bottom = 700;
  resize();
  expect(scroll).toHaveBeenCalledWith({ block: 'center', inline: 'nearest', behavior: 'instant' });
  expect(action).toBe(document.activeElement);
});

it('retains basic dialog focus handling when size observation is unavailable', () => {
  vi.stubGlobal('ResizeObserver', undefined);
  expect(() => render(createElement(DialogViewport))).not.toThrow();
});
