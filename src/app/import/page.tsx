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
    <main className="recipe-page import-page">
      <PageHeader
        className="import-page-heading"
        title="Import recipes"
        eyebrow="GROW YOUR COOKBOOK"
        description="Bring recipes into your library, then review the details before saving."
        toolbarRight={<RecipebookNav current="import" />}
      />
      <ImportWizard initialMode={mode === 'jsonld' ? 'jsonld' : 'files'} />
    </main>
  );
}
