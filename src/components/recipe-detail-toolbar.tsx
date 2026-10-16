import Link from 'next/link';
import { ChefHat, Edit3 } from 'lucide-react';
import { KitchenPrintDialog } from './kitchen-print-dialog';
export function RecipeDetailToolbar({ recipeId, title }: { recipeId: string; title: string }) {
  return (
    <div className="recipe-detail-toolbar" role="toolbar" aria-label="Recipe actions">
      <Link className="recipe-toolbar-primary" href={`/recipes/${recipeId}/cook`}>
        <ChefHat size={18} />
        Cook this recipe
      </Link>
      <Link className="recipe-toolbar-button" href={`/recipes/${recipeId}/edit`}>
        <Edit3 size={17} />
        Edit recipe
      </Link>
      <KitchenPrintDialog kind="recipes" recipes={[{ id: recipeId, title }]} />
    </div>
  );
}
