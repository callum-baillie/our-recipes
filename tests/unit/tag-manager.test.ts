// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TagManager } from '@/components/tag-manager';
import { ToastProvider } from '@/components/toast-provider';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const tags = [
  { name: 'make-ahead-friendly', color: '#a85032', usageCount: 3 },
  { name: 'weeknight', color: '#536938', usageCount: 2 },
];
function setup() {
  render(createElement(ToastProvider, null, createElement(TagManager, { initialTags: tags })));
}
function row(name: string) {
  return screen.getByText(name, { exact: true, selector: 'strong' }).closest('article')!;
}
it('keeps dirty edits when another editor is declined, and retains the draft on transport failure', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));
  setup();
  fireEvent.click(
    within(row('make-ahead-friendly')).getByRole('button', { name: 'Edit make-ahead-friendly' }),
  );
  fireEvent.change(screen.getByLabelText('Rename make-ahead-friendly'), {
    target: { value: 'new draft' },
  });
  fireEvent.click(within(row('weeknight')).getByRole('button', { name: 'Edit weeknight' }));
  expect(window.confirm).toHaveBeenCalled();
  expect((screen.getByLabelText('Rename make-ahead-friendly') as HTMLInputElement).value).toBe(
    'new draft',
  );
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
  expect((screen.getByLabelText('Rename make-ahead-friendly') as HTMLInputElement).value).toBe(
    'new draft',
  );
  expect(within(row('make-ahead-friendly')).getByRole('alert').textContent).toContain('Offline');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByLabelText('Rename make-ahead-friendly')).toBeNull();
});
it('previews an existing target color and treats a self target as a color edit', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(Response.json({ tag: { ...tags[0], color: '#112233' } }));
  vi.stubGlobal('fetch', fetchMock);
  setup();
  fireEvent.click(within(row('make-ahead-friendly')).getByText('Merge'));
  fireEvent.change(screen.getByLabelText('Merge make-ahead-friendly into'), {
    target: { value: 'weeknight' },
  });
  expect((screen.getByLabelText('Resulting color') as HTMLInputElement).value).toBe('#536938');
  expect(screen.getByText('Merge make-ahead-friendly into weeknight')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Merge make-ahead-friendly into'), {
    target: { value: 'MAKE-AHEAD-FRIENDLY' },
  });
  expect(screen.queryByRole('button', { name: 'Confirm merge' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Resulting color'), { target: { value: '#112233' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/v1/tags/make-ahead-friendly',
    expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ name: 'make-ahead-friendly', color: '#112233' }),
    }),
  );
});
