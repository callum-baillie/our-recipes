// @vitest-environment jsdom
import { createElement, useState, type ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ToastNotice, ToastProvider, useToast } from '@/components/toast-provider';
function Controls() {
  const { showToast, dismissToast } = useToast();
  return createElement(
    'div',
    null,
    createElement('button', { onClick: () => showToast('Saved', 'success') }, 'Normal'),
    createElement(
      'button',
      {
        onClick: () =>
          showToast('Review scans', 'info', {
            key: 'review',
            actions: [{ label: 'Reviewed', onClick: () => dismissToast('review') }],
          }),
      },
      'Sticky',
    ),
  );
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it('expires ordinary feedback while preserving deduplicated action prompts until acted on', () => {
  vi.useFakeTimers();
  render(createElement(ToastProvider, null, createElement(Controls)));
  fireEvent.click(screen.getByText('Sticky'));
  fireEvent.click(screen.getByText('Sticky'));
  expect(screen.getAllByText('Review scans')).toHaveLength(1);
  for (let i = 0; i < 5; i++) fireEvent.click(screen.getByText('Normal'));
  act(() => vi.advanceTimersByTime(10000));
  expect(screen.queryByText('Saved')).toBeNull();
  expect(screen.getByText('Review scans')).toBeTruthy();
  expect(screen.queryByLabelText('Dismiss notification')).toBeNull();
  fireEvent.click(screen.getByText('Reviewed'));
  expect(screen.queryByText('Review scans')).toBeNull();
});
it('moves rich alerts into the shared region and keeps their buttons until acted on', () => {
  vi.useFakeTimers();
  const review = vi.fn();
  function ReviewNotice() {
    const [done, setDone] = useState(false);
    return done
      ? null
      : createElement(
          ToastNotice,
          null,
          'Needs review',
          createElement(
            'button',
            {
              onClick: () => {
                review();
                setDone(true);
              },
            },
            'Review',
          ),
        );
  }
  render(
    createElement(
      ToastProvider,
      null,
      createElement(ToastNotice, null, 'Updated'),
      createElement(ReviewNotice),
    ),
  );
  const region = screen.getByRole('region', { name: 'Notifications' });
  expect(region.contains(screen.getByText('Updated'))).toBe(true);
  act(() => vi.advanceTimersByTime(10000));
  expect(screen.queryByText('Updated')).toBeNull();
  expect(region.contains(screen.getByText('Review'))).toBe(true);
  fireEvent.click(screen.getByText('Review'));
  expect(review).toHaveBeenCalledOnce();
  expect(screen.queryByText('Review')).toBeNull();
});
it('keeps notifications inside an open native modal so actions are not inert', async () => {
  render(
    createElement(
      ToastProvider,
      null,
      createElement('dialog', { open: true }, 'Modal'),
      createElement(Controls),
    ),
  );
  await act(async () => {});
  fireEvent.click(screen.getByText('Sticky'));
  expect(document.querySelector('dialog')!.contains(screen.getByText('Reviewed'))).toBe(true);
  fireEvent.click(screen.getByText('Reviewed'));
  expect(screen.queryByText('Review scans')).toBeNull();
});
it('keeps a notice with expandable details until it is dismissed', () => {
  vi.useFakeTimers();
  render(
    createElement(
      ToastProvider,
      null,
      createElement(
        ToastNotice,
        null,
        'Evidence found',
        createElement('details', null, createElement('summary', null, 'Dates'), 'Observed 2020'),
      ),
    ),
  );
  act(() => vi.advanceTimersByTime(20000));
  expect(screen.getByText('Dates')).toBeTruthy();
  expect(document.querySelector('.toast')?.getAttribute('data-actionable')).toBe('true');
  fireEvent.click(screen.getByLabelText('Dismiss notification'));
  expect(screen.queryByText('Dates')).toBeNull();
});

it('copies an error with safe technical details and keeps it available for review', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  function ErrorControl() {
    const { showToast } = useToast();
    return createElement(
      'button',
      {
        onClick: () =>
          showToast('Limit reached', 'error', {
            details: 'Code: account_request_limit\nReference: safe-id',
          }),
      },
      'Fail',
    );
  }
  render(createElement(ToastProvider, null, createElement(ErrorControl)));
  fireEvent.click(screen.getByText('Fail'));
  fireEvent.click(screen.getByRole('button', { name: 'Copy error details' }));
  await act(async () => {});
  expect(writeText).toHaveBeenCalledWith(
    'Limit reached\n\nCode: account_request_limit\nReference: safe-id',
  );
  expect(screen.getByRole('button', { name: 'Error copied' })).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Dismiss notification'));
  expect(screen.queryByText('Limit reached')).toBeNull();
});
it('offers manual copy when the Clipboard API is unavailable', async () => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error('Unavailable')) },
  });
  render(
    createElement(
      ToastProvider,
      null,
      createElement(
        ToastNotice,
        { tone: 'error' } as ComponentProps<typeof ToastNotice>,
        'Something failed',
      ),
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Copy error details' }));
  await act(async () => {});
  expect((screen.getByLabelText('Error details to copy') as HTMLTextAreaElement).value).toBe(
    'Something failed',
  );
});

it('keeps error copy controls inside an ARIA modal and forwards Escape to its dismiss handler', async () => {
  const onKeyDown = vi.fn();
  render(
    createElement(
      ToastProvider,
      null,
      createElement('div', { role: 'dialog', 'aria-modal': true, onKeyDown }, 'Chat'),
      createElement(
        ToastNotice,
        { tone: 'error' } as ComponentProps<typeof ToastNotice>,
        'Request failed',
      ),
    ),
  );
  await act(async () => {});
  const copy = screen.getByRole('button', { name: 'Copy error details' });
  expect(screen.getByRole('dialog').contains(copy)).toBe(true);
  fireEvent.keyDown(copy, { key: 'Escape' });
  expect(onKeyDown).toHaveBeenCalledOnce();
  expect(onKeyDown.mock.calls[0][0].key).toBe('Escape');
});
