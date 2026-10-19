export type WorkflowState = 'to_buy' | 'in_cart' | 'cant_find' | 'sourced';
export function shoppingWorkflowState(item: {
  checked: boolean;
  shoppingState: WorkflowState;
}): WorkflowState {
  return item.checked
    ? 'sourced'
    : item.shoppingState === 'sourced'
      ? 'to_buy'
      : item.shoppingState;
}
/** Workflow totals and trip review always use the complete list, independently of search. */
export function shoppingWorkflow<T extends { checked: boolean; shoppingState: WorkflowState }>(
  items: T[],
) {
  const byState = (state: WorkflowState) =>
    items.filter((item) => shoppingWorkflowState(item) === state);
  return {
    toBuy: byState('to_buy'),
    inCart: byState('in_cart'),
    cantFind: byState('cant_find'),
    sourced: byState('sourced'),
  };
}
/** Swap visible neighbours while keeping the complete-list reorder contract and hidden positions. */
export function moveShoppingItem<T extends { id: string; position: number }>(
  items: T[],
  visible: T[],
  id: string,
  direction: -1 | 1,
): T[] | null {
  const index = visible.findIndex((item) => item.id === id);
  const neighbour = visible[index + direction];
  if (index < 0 || !neighbour) return null;
  const ordered = [...items].sort((a, b) => a.position - b.position);
  const from = ordered.findIndex((item) => item.id === id);
  const to = ordered.findIndex((item) => item.id === neighbour.id);
  if (from < 0 || to < 0) return null;
  [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
  return ordered.map((item, position) => ({ ...item, position }));
}
