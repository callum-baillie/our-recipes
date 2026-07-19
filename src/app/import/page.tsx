import Link from 'next/link';

import { ImportWizard } from '@/components/import-wizard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function ImportPage() {
  return (
    <main className="recipe-page import-page">
      <header className="recipe-header import-page-header">
        <Link className="wordmark" href="/">
          <span className="wordmark-mark" aria-hidden="true" />
          <span>Our Recipes</span>
        </Link>
        <Link className="quiet-link" href="/recipes">
          ← Back to library
        </Link>
      </header>
      <ImportWizard />
    </main>
  );
}
