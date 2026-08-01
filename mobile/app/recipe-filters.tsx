import { ProtectedRoute } from '@/auth/protected-route';
import { RecipeFilterSheet } from '@/screens/recipe-filter-sheet';

export default function RecipeFiltersRoute() {
  return (
    <ProtectedRoute>
      <RecipeFilterSheet />
    </ProtectedRoute>
  );
}
