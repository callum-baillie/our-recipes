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
            <>
              <Link className="quiet-link editor-back-link" href="/recipes">
                <ArrowLeft size={16} aria-hidden="true" />
                Back to recipe book
              </Link>
              <div className="editor-title-copy">
                <p className="eyebrow">A RECIPE WORTH KEEPING</p>
                <h1>Add it your way.</h1>
                <p className="muted">
                  Write the details you use at the stove. You can always revise this shared recipe
                  later.
                </p>
              </div>
            </>
          }
        />
      </section>
    </main>
  );
}
