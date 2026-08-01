import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CollectionDetailManager } from '@/components/collection-detail-manager';
import { getCollection } from '@/lib/services/collection-service';
import { listRecipes } from '@/lib/services/recipe-service';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ collectionId: string }>;
}): Promise<Metadata> {
  const { collectionId } = await params;
  const collection = getCollection(collectionId);
  if (!collection) return {};
  return {
    title: collection.name,
    description:
      collection.description || `Browse the recipes in the ${collection.name} collection.`,
  };
}

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
