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
    <main className="workspace-page" data-width="focused">
      <CaptureWizard initialKind={initialKind} />
    </main>
  );
}
