import Link from 'next/link';

import { ImportWizard } from '@/components/import-wizard';
import { BordIcon } from '@/components/bord-brand';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function ImportPage() {
  return (
    <main className="recipe-page import-page">
      <header className="recipe-header import-page-header">
        <Link className="wordmark" href="/">
          <span className="wordmark-mark custom" aria-hidden="true">
            <BordIcon size={21} />
          </span>
          <span>Bòrd</span>
        </Link>
        <Link className="quiet-link" href="/recipes">
          ← Back to library
        </Link>
      </header>
      <ImportWizard />
    </main>
  );
}
