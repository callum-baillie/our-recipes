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
      <RecipebookNav current="import" />
      <ImportWizard initialMode={mode === 'jsonld' ? 'jsonld' : 'files'} />
    </main>
  );
}
