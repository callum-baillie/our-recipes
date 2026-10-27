import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthenticatedSessionPrincipal } from '@/lib/services/auth-service';
import { listRecipes } from '@/lib/services/recipe-service';
import { getPantryDashboard } from '@/lib/services/pantry-service';
import { PageHeader } from '@/components/page-header';
export const dynamic = 'force-dynamic';
export default async function CardsPage() {
  if (
    !(await getAuthenticatedSessionPrincipal(
      new Request('http://localhost/scanner/cards', { headers: await headers() }),
    ))
  )
    redirect('/sign-in');
  const pantry = getPantryDashboard();
  return (
    <main className="page">
      <PageHeader
        title="Scanner cards"
        description="Print at actual size. A recipe scan records cooking immediately and deducts its ingredients."
        actions={<Link href="/scanner">Station</Link>}
      />
      <p>
        <a href="/api/v1/scanner/cards?kind=controls">Download control cards</a> ·{' '}
        <a href="/api/v1/scanner/cards?kind=locations">Download location cards</a>
      </p>
      <h2>Recipe cards</h2>
      <p>
        Cards include the current recipe revision and saved serving count. Print a new card after
        changing a recipe.
      </p>
      <ul>
        {listRecipes()
          .filter((r) => r.status === 'active')
          .map((r) => (
            <li key={r.id}>
              <a href={`/api/v1/scanner/cards?kind=recipe&id=${r.id}`}>{r.title}</a>
            </li>
          ))}
      </ul>
      <h2>Stock batch labels</h2>
      <ul>
        {pantry.batches.map((b) => (
          <li key={b.id}>
            <a href={`/api/v1/scanner/cards?kind=batch&id=${b.id}`}>
              {b.product.displayName} · {b.location.path} · {b.quantityRemaining} {b.unit}
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
