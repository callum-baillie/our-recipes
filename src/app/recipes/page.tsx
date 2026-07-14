import { cookies } from 'next/headers';
import Link from 'next/link';

import { RecipePortabilityActions } from '@/components/recipe-portability-actions';
import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { recipeLibraryQuerySchema } from '@/lib/domain/recipe';
import { listCollections } from '@/lib/services/collection-service';
import { getHouseholdState } from '@/lib/services/household-service';
import { listRecipeLibrary, listRecipeTags } from '@/lib/services/recipe-service';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

function recipeLibraryUrl(search: URLSearchParams, page: number): string {
  const next = new URLSearchParams(search);
  next.set('page', String(page));
  return `/recipes?${next.toString()}`;
}

export default async function RecipeLibraryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const rawSearch = await searchParams;
  const search = new URLSearchParams(
    Object.entries(rawSearch).flatMap(([key, value]) =>
      typeof value === 'string' && value ? [[key, value]] : [],
    ),
  );
  const query = recipeLibraryQuerySchema.parse(Object.fromEntries(search.entries()));
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  const { profiles } = getHouseholdState();
  const tags = listRecipeTags();
  const collections = listCollections();
  const library = listRecipeLibrary(query, actor.profileId);
  return (
    <main className="recipe-page">
      <header className="recipe-header">
        <Link className="wordmark" href="/">
          <span className="wordmark-mark">✦</span>
          <span>Our Recipes</span>
        </Link>
        <div className="header-actions">
          <RecipePortabilityActions />
          <Link className="primary-button compact" href="/recipes/new">
            Add a recipe
          </Link>
        </div>
      </header>
      <section className="library-heading">
        <div>
          <p className="eyebrow">THE SHARED COOKBOOK</p>
          <h1>Your recipe library</h1>
          <p className="muted">
            {library.total
              ? `${library.total} recipe${library.total === 1 ? '' : 's'} ready for the kitchen.`
              : 'A place for every recipe your household returns to.'}
          </p>
        </div>
        <form className="library-filters">
          <label className="search-filter">
            <span className="sr-only">Search recipes</span>
            <input name="q" defaultValue={query.q} placeholder="Search recipes or ingredients" />
          </label>
          <div className="filter-grid">
            <label>
              <span>Sort</span>
              <select name="sort" defaultValue={query.sort}>
                <option value="recently-updated">Recently updated</option>
                <option value="recently-added">Recently added</option>
                <option value="alphabetical">Alphabetical</option>
                <option value="highest-rated">Your highest rated</option>
                <option value="most-recently-cooked">Most recently cooked</option>
                <option value="shortest-time">Shortest time</option>
              </select>
            </label>
            <label>
              <span>Creator</span>
              <select name="creator" defaultValue={query.creator ?? ''}>
                <option value="">Everyone</option>
                {profiles.map((profile) => (
                  <option value={profile.id} key={profile.id}>
                    {profile.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Tag</span>
              <select name="tag" defaultValue={query.tag ?? ''}>
                <option value="">Any tag</option>
                {tags.map((tag) => (
                  <option value={tag} key={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Collection</span>
              <select name="collection" defaultValue={query.collection ?? ''}>
                <option value="">Any collection</option>
                {collections.map((collection) => (
                  <option value={collection.id} key={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Status</span>
              <select name="status" defaultValue={query.status}>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="trash">Trash</option>
                <option value="all">All statuses</option>
              </select>
            </label>
            <label>
              <span>Category</span>
              <input
                name="category"
                defaultValue={query.category ?? ''}
                placeholder="e.g. Dinner"
              />
            </label>
            <label>
              <span>Cuisine</span>
              <input name="cuisine" defaultValue={query.cuisine ?? ''} placeholder="e.g. Italian" />
            </label>
            <label>
              <span>Maximum minutes</span>
              <input
                name="maxTotalMinutes"
                type="number"
                min="1"
                defaultValue={query.maxTotalMinutes ?? ''}
              />
            </label>
            <div className="filter-checks">
              <label>
                <input
                  name="favorite"
                  type="checkbox"
                  value="true"
                  defaultChecked={Boolean(query.favorite)}
                />{' '}
                Favorites
              </label>
              <label>
                <input
                  name="cooked"
                  type="checkbox"
                  value="true"
                  defaultChecked={Boolean(query.cooked)}
                />{' '}
                Cooked by me
              </label>
            </div>
          </div>
          <div className="filter-actions">
            <button className="primary-button compact" type="submit">
              Apply filters
            </button>
            <Link className="text-button" href="/recipes">
              Reset
            </Link>
          </div>
        </form>
      </section>
      {library.recipes.length ? (
        <>
          <section className="recipe-grid" aria-label="Recipe results">
            {library.recipes.map((recipe) => (
              <Link className="recipe-card" href={`/recipes/${recipe.id}`} key={recipe.id}>
                <p>
                  {recipe.status === 'active'
                    ? recipe.tags.join(' · ') || recipe.category || 'HOUSE RECIPE'
                    : recipe.status}
                </p>
                <h2>{recipe.title}</h2>
                <span>
                  {recipe.summary ||
                    `${recipe.servings} · ${recipe.prepMinutes + recipe.cookMinutes + recipe.restMinutes} min`}
                </span>
                <small>
                  {recipe.createdByName} ·
                  {recipe.personalRating !== null
                    ? ` Your rating ${recipe.personalRating}/5 ·`
                    : ''}
                  {recipe.isFavorite ? ' Favorite ·' : ''}
                  {recipe.lastCookedAt
                    ? `Cooked ${recipe.lastCookedAt.toLocaleDateString()}`
                    : `Revision ${recipe.currentRevision}`}
                </small>
              </Link>
            ))}
          </section>
          {library.totalPages > 1 && (
            <nav className="pagination" aria-label="Recipe library pages">
              {library.page > 1 ? (
                <Link className="text-button" href={recipeLibraryUrl(search, library.page - 1)}>
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span>
                Page {library.page} of {library.totalPages}
              </span>
              {library.page < library.totalPages ? (
                <Link className="text-button" href={recipeLibraryUrl(search, library.page + 1)}>
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      ) : (
        <section className="empty-library">
          <h2>
            {query.q || search.size ? 'Nothing matched those filters.' : 'The recipe box is empty.'}
          </h2>
          <p>
            {query.q || search.size
              ? 'Try a broader search or reset the filters.'
              : 'Start with a recipe your household already loves.'}
          </p>
          {query.q || search.size ? (
            <Link className="text-button" href="/recipes">
              Clear filters
            </Link>
          ) : (
            <Link className="primary-button" href="/recipes/new">
              Add the first recipe
            </Link>
          )}
        </section>
      )}
    </main>
  );
}
