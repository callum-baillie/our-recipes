import Link from 'next/link';

import { TagManager } from '@/components/tag-manager';
import { BordIcon } from '@/components/bord-brand';
import { listTags } from '@/lib/services/recipe-service';

export const dynamic = 'force-dynamic';

export default function TagsPage() {
  return (
    <>
      <nav className="recipe-page settings-header" aria-label="Tag settings navigation">
        <div className="recipe-header">
          <Link className="wordmark" href="/">
            <span className="wordmark-mark custom" aria-hidden="true">
              <BordIcon size={21} />
            </span>
            <span>Bòrd</span>
          </Link>
          <Link className="quiet-link" href="/">
            Back to kitchen
          </Link>
        </div>
      </nav>
      <TagManager
        initialTags={listTags().map(({ name, color, usageCount }) => ({ name, color, usageCount }))}
      />
    </>
  );
}
