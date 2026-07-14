import Link from 'next/link';

import { AiReadinessPanel } from '@/components/ai-readiness-panel';
import { getAiReadiness } from '@/lib/services/ai-readiness-service';

export const dynamic = 'force-dynamic';

export default function AiSettingsPage() {
  return (
    <>
      <header className="recipe-page settings-header">
        <div className="recipe-header">
          <Link className="wordmark" href="/">
            <span className="wordmark-mark">✦</span>
            <span>Our Recipes</span>
          </Link>
          <Link className="quiet-link" href="/">
            Back to kitchen
          </Link>
        </div>
      </header>
      <AiReadinessPanel status={getAiReadiness()} />
    </>
  );
}
