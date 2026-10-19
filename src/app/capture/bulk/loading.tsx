import { PageSkeleton } from '@/components/skeleton';

export default function Loading() {
  return <PageSkeleton variant="bulkImport" label="Opening bulk recipe import" />;
}
