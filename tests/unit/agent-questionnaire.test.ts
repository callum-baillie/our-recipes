// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { QuestionPrompt } from '@/components/agent-questionnaire';
afterEach(cleanup);
it('offers selectable suggestions and a custom answer, submitting only on Send', () => {
  const submit = vi.fn();
  render(
    createElement(QuestionPrompt, {
      questions: [
        {
          kind: 'single',
          title: 'Who is eating?',
          options: [
            { id: 'all', label: 'Everyone' },
            { id: 'me', label: 'Just me' },
          ],
          allowCustom: true,
        },
      ],
      onSubmit: submit,
      allowSkip: false,
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: /Everyone/ }));
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(submit).toHaveBeenLastCalledWith({ kind: 'single', selectedIds: ['all'] });
  fireEvent.change(screen.getByPlaceholderText('Type your answer'), {
    target: { value: 'Callum and Julia' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(submit).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'Callum and Julia' }));
});

it('selects suggestions with number keys, submits custom text with Enter and locks while busy', () => {
  const submit = vi.fn();
  const props = {
    questions: [
      {
        kind: 'single' as const,
        title: 'Which meals?',
        options: [
          { id: '0', label: 'Dinners only' },
          { id: '1', label: 'Lunch and dinner' },
        ],
        allowCustom: true,
      },
    ],
    allowSkip: false,
    onSubmit: submit,
  };
  const { rerender } = render(createElement(QuestionPrompt, props));
  const second = screen.getByRole('button', { name: /Lunch and dinner/ });
  fireEvent.keyDown(screen.getByRole('button', { name: /Dinners only/ }), { key: '2' });
  expect(second.getAttribute('aria-pressed')).toBe('true');
  const field = screen.getByLabelText('Your answer');
  fireEvent.change(field, { target: { value: 'Weekdays only' } });
  expect(second.getAttribute('aria-pressed')).toBe('false');
  fireEvent.keyDown(field, { key: 'Enter' });
  expect(submit).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'Weekdays only' }));
  rerender(createElement(QuestionPrompt, { ...props, busy: true }));
  expect((screen.getByRole('button', { name: /Sending/ }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect((field as HTMLInputElement).disabled).toBe(true);
});
