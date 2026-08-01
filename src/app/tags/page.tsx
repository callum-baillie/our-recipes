import { TagManager } from '@/components/tag-manager';
import { listTags } from '@/lib/services/recipe-service';

export const dynamic = 'force-dynamic';

export default function TagsPage() {
  return (
    <TagManager
      initialTags={listTags().map(({ name, color, usageCount }) => ({ name, color, usageCount }))}
    />
  );
}
