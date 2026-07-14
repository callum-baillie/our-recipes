import Link from 'next/link';

import { ImportWizard } from '@/components/import-wizard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function ImportPage() {
  return (
    <main className="recipe-page">
      <header className="recipe-header">
        <Link className="wordmark" href="/">
          <span className="wordmark-mark">✦</span>
          <span>Our Recipes</span>
        </Link>
        <Link className="quiet-link" href="/recipes">
          Recipe library
        </Link>
      </header>
      <ImportWizard />
    </main>
  );
}
