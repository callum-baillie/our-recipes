import { PageHeader } from '@/components/page-header';
import { ImportWizard } from '@/components/import-wizard';
import { RecipebookNav } from '@/components/recipebook-nav';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  return (
    <main className="workspace-page import-page" data-width="focused">
      <PageHeader
        className="import-page-heading"
        title="Photos or PDF"
        description="Prepare a review draft from recipe photos or a PDF."
        toolbarRight={<RecipebookNav current="import" />}
      />
      <ImportWizard initialMode={mode === 'jsonld' ? 'jsonld' : 'files'} />
    </main>
  );
}
