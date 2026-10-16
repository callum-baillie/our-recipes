import Link from 'next/link';
import { Printer } from 'lucide-react';
type PrintProps =
  | { kind: 'recipes'; recipes: { id: string; title: string }[]; browse?: boolean }
  | { kind: 'meal-plan'; start: string; end: string }
  | { kind: 'shopping-list'; listId: string }
  | { kind: 'pantry' };
/** Shared entry point retained for compatibility; options live in the print workspace. */
export function KitchenPrintDialog(props: PrintProps) {
  const query = new URLSearchParams({ kind: props.kind });
  if (props.kind === 'recipes' && !props.browse)
    query.set('recipes', props.recipes.map((recipe) => recipe.id).join(','));
  if (props.kind === 'meal-plan') {
    query.set('start', props.start);
    query.set('end', props.end);
  }
  if (props.kind === 'shopping-list') query.set('list', props.listId);
  return (
    <Link className="text-button print-workspace-link" href={`/print?${query}`}>
      <Printer size={17} aria-hidden="true" />
      Export / print
    </Link>
  );
}
