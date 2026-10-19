import { PrintWorkspace } from '@/components/print-workspace';
import { listRecipes } from '@/lib/services/recipe-service';
import { listShoppingLists } from '@/lib/services/planning-service';
import { listSupermarketProfiles } from '@/lib/services/list-settings-service';
import { listPantryLocations } from '@/lib/services/pantry-service';
export const metadata = { title: 'Export & print' };
export const dynamic = 'force-dynamic';
export default async function PrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const query = Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
  return (
    <PrintWorkspace
      initial={query}
      recipes={listRecipes().map(({ id, title, servings }) => ({ id, title, servings }))}
      lists={listShoppingLists().map(({ id, name }) => ({ id, name }))}
      stores={listSupermarketProfiles().map(({ id, name, locationLabel }) => ({
        id,
        name: [name, locationLabel].filter(Boolean).join(' · '),
      }))}
      locations={listPantryLocations().map(({ id, path }) => ({ id, name: path }))}
    />
  );
}
