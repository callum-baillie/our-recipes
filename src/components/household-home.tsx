import {
  ArchiveRestore,
  BookOpenText,
  CalendarDays,
  ChefHat,
  ShoppingBasket,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';

import { ProfileSwitcher } from '@/components/profile-switcher';
import type { HouseholdState } from '@/lib/services/household-service';

type HouseholdHomeProps = HouseholdState & { activeProfileId: string | null };

export function HouseholdHome({ household, profiles, activeProfileId }: HouseholdHomeProps) {
  if (!household) return null;
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0];
  const name = activeProfile?.displayName ?? 'there';

  return (
    <main className="home-page">
      <header className="home-header">
        <Link className="wordmark" href="/">
          <span className="wordmark-mark">✦</span>
          <span>{household.appName}</span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link className="active" href="/recipes">
            Library
          </Link>
          <Link href="/planner">Planner</Link>
          <Link href="/lists">Lists</Link>
          <Link href="/settings/backups">Backups</Link>
          <Link href="/settings/profiles">Profiles</Link>
          <Link href="/settings/ai">AI status</Link>
          <Link href="/tags">Tags</Link>
          <Link href="/collections">Collections</Link>
          <Link href="/import">Import</Link>
        </nav>
        <ProfileSwitcher activeProfileId={activeProfileId} profiles={profiles} />
      </header>

      <section className="home-hero" aria-labelledby="home-title">
        <div>
          <p className="eyebrow">{household.name.toUpperCase()} · THE SHARED COOKBOOK</p>
          <h1 id="home-title">Welcome to the kitchen, {name}.</h1>
          <p>
            Start with a recipe worth keeping. This foundation is ready for the recipes, plans, and
            lists you build together next.
          </p>
          <div className="home-actions">
            <Link className="primary-button" href="/recipes/new">
              <BookOpenText size={17} aria-hidden="true" /> Add a recipe
            </Link>
            <Link className="text-button" href="/capture">
              Capture a recipe
            </Link>
            <Link className="text-button" href="/import">
              Import a scan or PDF
            </Link>
          </div>
        </div>
        <aside className="trust-card" aria-label="Household profile notice">
          <span className="trust-icon">
            <Sparkles size={19} aria-hidden="true" />
          </span>
          <div>
            <strong>Shared, not secured</strong>
            <p>
              Profiles personalize this local household app; they are not passwords or access
              control.
            </p>
          </div>
        </aside>
      </section>

      <section className="next-steps" aria-labelledby="next-steps-title">
        <div className="section-heading">
          <p className="eyebrow">YOUR KITCHEN IS READY</p>
          <h2 id="next-steps-title">A calm place to grow into</h2>
        </div>
        <div className="step-list">
          <article id="library">
            <span>
              <BookOpenText size={23} aria-hidden="true" />
            </span>
            <h3>Recipe library</h3>
            <p>Capture trusted recipes, keep the original source, and make them your own.</p>
          </article>
          <article id="planner">
            <span>
              <CalendarDays size={23} aria-hidden="true" />
            </span>
            <h3>Meal planning</h3>
            <p>Turn a week of ideas into a workable plan around the people at your table.</p>
          </article>
          <article id="lists">
            <span>
              <ShoppingBasket size={23} aria-hidden="true" />
            </span>
            <h3>Shopping lists</h3>
            <p>Build editable lists from your plans, then take the essentials with you.</p>
          </article>
          <article>
            <span>
              <ArchiveRestore size={23} aria-hidden="true" />
            </span>
            <h3>Backups</h3>
            <p>Keep a verified local recovery point for the recipes and photos you treasure.</p>
          </article>
        </div>
      </section>

      <footer className="home-footer">
        <ChefHat size={16} aria-hidden="true" /> Built for a trusted household network.
      </footer>
    </main>
  );
}
