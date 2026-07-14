import Link from 'next/link';

import { CollectionManager } from '@/components/collection-manager';
import { listCollections } from '@/lib/services/collection-service';

export const dynamic = 'force-dynamic';

export default function CollectionsPage() {
  return (
    <>
      <header className="recipe-page settings-header">
        <div className="recipe-header">
          <Link className="wordmark" href="/">
            <span className="wordmark-mark">✦</span>
            <span>Our Recipes</span>
          </Link>
          <Link className="quiet-link" href="/recipes">
            Back to library
          </Link>
        </div>
      </header>
      <CollectionManager initialCollections={listCollections()} />
    </>
  );
}
