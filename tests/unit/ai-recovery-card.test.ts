// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import { AiRecoveryRequestCard } from '@/components/chat-ui/recovery-card';
import type { AiRecoveryCard } from '@/lib/domain/ai-recovery';
afterEach(cleanup);
const request: AiRecoveryCard = {
  id: 'request',
  threadId: 'thread',
  kind: 'sharing',
  title: 'Allow context?',
  reason: 'Resolve a name for planning.',
  scope: 'Names and identity',
  status: 'pending',
  canApprove: true,
  canRevoke: false,
  canContinue: false,
  approvedMode: null,
  approvalNote: 'Only these data categories are requested.',
  permanentNote: 'This changes the sharing setting.',
  expiresAt: '2026-11-15T00:00:00Z',
};
it('offers explicit one-time, permanent and decline actions without automatically approving', () => {
  const resolve = vi.fn();
  render(
    createElement(AiRecoveryRequestCard, {
      request,
      busy: false,
      onResolve: resolve,
      onContinue: vi.fn(),
    }),
  );
  expect(resolve).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Allow once' }));
  expect(resolve).toHaveBeenCalledWith('request', 'once');
  fireEvent.click(screen.getByRole('button', { name: 'Always allow' }));
  expect(resolve).toHaveBeenCalledWith('request', 'permanent');
});
it('does not render approval buttons when someone else must consent', () => {
  render(
    createElement(AiRecoveryRequestCard, {
      request: { ...request, canApprove: false, approvalNote: 'The data owner must approve.' },
      busy: false,
      onResolve: vi.fn(),
      onContinue: vi.fn(),
    }),
  );
  expect(screen.queryByRole('button', { name: 'Allow once' })).toBeNull();
  expect(screen.getByText('The data owner must approve.')).toBeTruthy();
});
it('does not allow duplicate submissions while approval is saving', () => {
  const resolve = vi.fn();
  render(
    createElement(AiRecoveryRequestCard, {
      request,
      busy: true,
      onResolve: resolve,
      onContinue: vi.fn(),
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Always allow' }));
  expect(resolve).not.toHaveBeenCalled();
});
