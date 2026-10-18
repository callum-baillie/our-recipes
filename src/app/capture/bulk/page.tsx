import { BulkRecipeImport } from '@/components/bulk-recipe-import';
import { SettingsPageHeader } from '@/components/settings-page-header';
export default function BulkImportPage() {
  return (
    <main className="recipe-page settings-hub">
      <SettingsPageHeader
        eyebrow="ADD RECIPES"
        title="Bulk add recipes"
        description="Import a collection from prompts, public links, or recipe photos. Review every draft before saving."
      />
      <BulkRecipeImport />
    </main>
  );
}
