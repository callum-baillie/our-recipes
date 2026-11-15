// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, expect, it } from 'vitest';
import { ChatToolCalls, type ChatToolCall } from '@/components/chat-ui/tool-calls';

afterEach(cleanup);
const calls: ChatToolCall[] = [
  { id: 'a', kind: 'read', state: 'success', title: 'Looked through your pantry', durationMs: 640 },
  { id: 'b', kind: 'draft', state: 'running', title: 'Drafting your meal plan' },
];

it('shows live work with an accessible status per step and opens while running', () => {
  render(createElement(ChatToolCalls, { calls, active: true }));
  const header = screen.getByRole('button', { name: /Working · 2 steps/ });
  expect(header.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByText('Drafting your meal plan')).toBeTruthy();
  expect(screen.getByText(/in progress/)).toBeTruthy();
  expect(screen.getByText('640ms')).toBeTruthy();
});

it('keeps a failed step open and lets the person toggle the group', () => {
  render(
    createElement(ChatToolCalls, {
      calls: [{ id: 'x', kind: 'search', state: 'error', title: 'Could not finish: searching' }],
      active: false,
    }),
  );
  const header = screen.getByRole('button', { name: /Worked through 1 step/ });
  expect(header.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByText(/did not finish/)).toBeTruthy();
  fireEvent.click(header);
  expect(header.getAttribute('aria-expanded')).toBe('false');
});

it('renders nothing without calls', () => {
  const { container } = render(createElement(ChatToolCalls, { calls: [], active: false }));
  expect(container.firstChild).toBeNull();
});
