import { notFound } from 'next/navigation';

import { CollectionDetailManager } from '@/components/collection-detail-manager';
import { getCollection } from '@/lib/services/collection-service';
import { listRecipes } from '@/lib/services/recipe-service';

export const dynamic = 'force-dynamic';

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ collectionId: string }>;
}) {
  const { collectionId } = await params;
  const collection = getCollection(collectionId);
  if (!collection) notFound();
  return (
    <CollectionDetailManager
      initialCollection={collection}
      recipes={listRecipes().map((recipe) => ({ id: recipe.id, title: recipe.title }))}
    />
  );
}
