import Link from 'next/link';

import { TagManager } from '@/components/tag-manager';
import { listTags } from '@/lib/services/recipe-service';

export const dynamic = 'force-dynamic';

export default function TagsPage() {
  return (
    <>
      <header className="recipe-page settings-header">
        <div className="recipe-header">
          <Link className="wordmark" href="/">
            <span className="wordmark-mark" aria-hidden="true" />
            <span>Our Recipes</span>
          </Link>
          <Link className="quiet-link" href="/">
            Back to kitchen
          </Link>
        </div>
      </header>
      <TagManager
        initialTags={listTags().map(({ name, color, usageCount }) => ({ name, color, usageCount }))}
      />
    </>
  );
}
