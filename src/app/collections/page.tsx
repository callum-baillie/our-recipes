import { CollectionManager } from '@/components/collection-manager';
import { listCollections } from '@/lib/services/collection-service';

export const dynamic = 'force-dynamic';

export default function CollectionsPage() {
  return <CollectionManager initialCollections={listCollections()} />;
}
