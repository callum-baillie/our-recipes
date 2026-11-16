// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({ default: () => null }));

import { AiActionCard, mealKey, type AiDrawerAction } from '@/components/ai-action-card';
import { SwipeRow } from '@/components/chat-ui/swipe-row';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const recipe = { title: 'Stew', summary: '', servings: 4, ingredientGroups: [] };
const plan: AiDrawerAction = {
  id: 'plan-1',
  kind: 'meal_plan_generate',
  status: 'pending',
  preview: {
    selectedProfileIds: ['a'],
    candidate: {
      entries: [
        {
          plannedFor: '2026-07-20',
          meal: 'lunch',
          title: 'Soup',
          servings: 2,
          existingRecipeId: 'r1',
        },
        { plannedFor: '2026-07-20', meal: 'dinner', title: 'Stew', servings: 4, newRecipeKey: 'k' },
        {
          plannedFor: '2026-07-21',
          meal: 'dinner',
          title: 'Curry',
          servings: 4,
          existingRecipeId: 'r2',
        },
      ],
      newRecipes: [{ key: 'k', recipe }],
    },
    conflicts: [],
  },
};
const setup = (extra: Record<string, unknown> = {}) => {
  const onRevise = vi.fn();
  const onDecide = vi.fn();
  render(createElement(AiActionCard, { action: plan, busy: false, onDecide, onRevise, ...extra }));
  return { onRevise, onDecide };
};

describe('reviewing a drafted plan meal by meal', () => {
  it('keeps single meals and whole days and shows progress', () => {
    setup();
    expect(screen.getByText('0 of 3 kept')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Keep dinner on .*: Stew/ }));
    expect(screen.getByText('1 of 3 kept')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Keep every meal on .*21/ }));
    expect(screen.getByText('2 of 3 kept')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep all' }));
    expect(screen.getByText('3 of 3 kept')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.getByText('0 of 3 kept')).toBeTruthy();
  });

  it('sends a change request only after the undo window, and not if undone', () => {
    const { onRevise } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Not for me, replace dinner .*: Stew/ }));
    expect(screen.getByText('Finding a replacement…')).toBeTruthy();
    act(() => void vi.advanceTimersByTime(1500));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    act(() => void vi.advanceTimersByTime(5000));
    expect(onRevise).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Not for me, replace dinner .*: Stew/ }));
    act(() => void vi.advanceTimersByTime(3100));
    expect(onRevise).toHaveBeenCalledTimes(1);
    expect(onRevise).toHaveBeenCalledWith('plan-1', '2026-07-20', 'dinner');
  });

  it('un-keeps a meal that is being changed and blocks other changes meanwhile', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /^Keep dinner on .*: Stew/ }));
    fireEvent.click(screen.getByRole('button', { name: /Not for me, replace dinner .*: Stew/ }));
    expect(screen.getByText('0 of 3 kept')).toBeTruthy();
    const other = screen.getByRole('button', { name: /Not for me, replace dinner .*: Curry/ });
    expect((other as HTMLButtonElement).disabled).toBe(true);
  });

  it('restores kept meals from lifted state, so a replaced draft keeps earlier choices', () => {
    setup({ keptMeals: new Set([mealKey('2026-07-20', 'lunch', 'Soup')]) });
    expect(screen.getByText('1 of 3 kept')).toBeTruthy();
    const lunch = screen.getByRole('button', { name: /^Keep lunch on .*: Soup/ });
    expect(lunch.getAttribute('aria-pressed')).toBe('true');
  });

  it('still confirms the whole plan regardless of review progress', () => {
    const { onDecide } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm plan' }));
    expect(onDecide).toHaveBeenCalledWith('plan-1', 'confirm', [], { generateImages: false });
  });

  it('offers no review controls once the plan is saved', () => {
    render(
      createElement(AiActionCard, {
        action: { ...plan, status: 'confirmed', result: {} },
        busy: false,
        onDecide: vi.fn(),
        onRevise: vi.fn(),
      }),
    );
    expect(screen.queryByText(/of 3 kept/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Not for me/ })).toBeNull();
  });
});

describe('swipe row gesture', () => {
  const drag = (element: HTMLElement, from: number, to: number, startY = 0, endY = 0) => {
    fireEvent.pointerDown(element, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      clientX: from,
      clientY: startY,
    });
    fireEvent.pointerMove(element, {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: (from + to) / 2,
      clientY: startY,
    });
    fireEvent.pointerMove(element, {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: to,
      clientY: endY,
    });
    fireEvent.pointerUp(element, {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: to,
      clientY: endY,
    });
  };
  const row = (props: Record<string, unknown> = {}) => {
    const onSwipeRight = vi.fn();
    const onSwipeLeft = vi.fn();
    render(
      createElement(
        SwipeRow,
        { onSwipeRight, onSwipeLeft, ...props },
        createElement(
          'div',
          null,
          createElement('p', null, 'Meal body'),
          createElement('button', null, 'Inner'),
        ),
      ),
    );
    return {
      onSwipeRight,
      onSwipeLeft,
      body: screen.getByText('Meal body').parentElement as HTMLElement,
    };
  };

  it('accepts a long drag right and left, and ignores a short one', () => {
    const { onSwipeRight, onSwipeLeft, body } = row();
    drag(body, 100, 260);
    expect(onSwipeRight).toHaveBeenCalledTimes(1);
    drag(body, 260, 100);
    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    drag(body, 100, 130);
    expect(onSwipeRight).toHaveBeenCalledTimes(1);
    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
  });

  it('treats a mostly vertical move as scrolling', () => {
    const { onSwipeRight, body } = row();
    const pointer = { pointerId: 1, pointerType: 'mouse' };
    fireEvent.pointerDown(body, { ...pointer, button: 0, clientX: 100, clientY: 0 });
    fireEvent.pointerMove(body, { ...pointer, clientX: 108, clientY: 40 });
    fireEvent.pointerMove(body, { ...pointer, clientX: 260, clientY: 44 });
    fireEvent.pointerUp(body, { ...pointer, clientX: 260, clientY: 44 });
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('does not start from a control, and does nothing when disabled', () => {
    const { onSwipeRight, body } = row();
    drag(within(body).getByRole('button', { name: 'Inner' }), 100, 260);
    expect(onSwipeRight).not.toHaveBeenCalled();
    cleanup();
    const disabled = row({ disabled: true });
    drag(disabled.body, 100, 260);
    expect(disabled.onSwipeRight).not.toHaveBeenCalled();
  });
});
