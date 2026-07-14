import Link from 'next/link';

import { RecipeForm } from '@/components/recipe-form';

export const dynamic = 'force-dynamic';

export default function NewRecipePage() {
  return (
    <main className="recipe-page">
      <header className="recipe-header">
        <Link className="wordmark" href="/">
          <span className="wordmark-mark">✦</span>
          <span>Our Recipes</span>
        </Link>
        <Link className="quiet-link" href="/recipes">
          Back to library
        </Link>
      </header>
      <section className="editor-layout">
        <div>
          <p className="eyebrow">A RECIPE WORTH KEEPING</p>
          <h1>Add it your way.</h1>
          <p className="muted">
            Write the details you use at the stove. You can always revise this shared recipe later.
          </p>
        </div>
        <RecipeForm />
      </section>
    </main>
  );
}
