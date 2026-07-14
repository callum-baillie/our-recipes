import Link from 'next/link';

import { CaptureWizard } from '@/components/capture-wizard';

export const dynamic = 'force-dynamic';

export default function CapturePage() {
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
      <CaptureWizard />
    </main>
  );
}
