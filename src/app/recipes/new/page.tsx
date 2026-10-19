import { PageHeader } from '@/components/page-header';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { RecipeForm } from '@/components/recipe-form';
import { emptyRecipeInput } from '@/lib/domain/recipe';
import { getAppPreferences } from '@/lib/services/app-preferences-service';

export const dynamic = 'force-dynamic';

export default function NewRecipePage() {
  const preferences = getAppPreferences().recipes;
  return (
    <main className="recipe-page">
      <section className="editor-layout">
        <RecipeForm
          initial={{ ...emptyRecipeInput, servings: `${preferences.defaultServings} servings` }}
          intro={
            <PageHeader
              title="New recipe"
              description="Start with ingredients and method. Add optional details when useful."
              leading={
                <Link className="quiet-link editor-back-link" href="/recipes">
                  <ArrowLeft size={16} aria-hidden="true" />
                  Back to recipes
                </Link>
              }
            />
          }
        />
      </section>
    </main>
  );
}
