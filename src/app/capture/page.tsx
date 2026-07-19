import Link from 'next/link';

import { CaptureWizard } from '@/components/capture-wizard';

export const dynamic = 'force-dynamic';

export default async function CapturePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const initialKind = mode === 'url' ? 'url' : 'text';

  return (
    <main className="recipe-page">
      <header className="recipe-header">
        <Link className="wordmark" href="/">
          <span className="wordmark-mark" aria-hidden="true" />
          <span>Our Recipes</span>
        </Link>
        <Link className="quiet-link" href="/recipes">
          Recipe library
        </Link>
      </header>
      <CaptureWizard initialKind={initialKind} />
    </main>
  );
}
