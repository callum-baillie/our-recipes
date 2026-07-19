import { ArchiveRestore, Bot, ChevronRight, Users } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AppSettingsForm } from '@/components/app-settings-form';
import { getAiReadiness } from '@/lib/services/ai-readiness-service';
import { listBackups } from '@/lib/services/backup-service';
import { getHouseholdState } from '@/lib/services/household-service';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const state = getHouseholdState();
  if (!state.household) notFound();
  const [backups, ai] = await Promise.all([listBackups(), Promise.resolve(getAiReadiness())]);
  const latestBackup = backups[0];

  return (
    <main className="recipe-page settings-hub">
      <section className="settings-intro settings-hub-intro">
        <p className="eyebrow">SETTINGS</p>
        <h1>Your kitchen, your way.</h1>
        <p>Manage the shared app, household profiles, AI connection, and local recovery.</p>
      </section>

      <AppSettingsForm
        initialAppName={state.household.appName}
        initialHouseholdName={state.household.name}
      />

      <section className="settings-overview" aria-label="Settings overview">
        <article id="ai" className="settings-overview-card">
          <span className="settings-overview-icon" aria-hidden="true">
            <Bot size={21} />
          </span>
          <div>
            <p className="eyebrow">AI CONNECTION</p>
            <h2>{ai.enabled ? 'OpenAI is ready' : 'OpenAI is not configured'}</h2>
            <p role="status">{ai.message}</p>
            <small>
              Recipe information leaves this server only when someone explicitly starts an AI
              action.
            </small>
          </div>
        </article>

        <Link className="settings-overview-card linked" href="/settings/backups">
          <span className="settings-overview-icon" aria-hidden="true">
            <ArchiveRestore size={21} />
          </span>
          <div>
            <p className="eyebrow">LOCAL BACKUPS</p>
            <h2>{latestBackup ? 'A recovery point is available' : 'No backup created yet'}</h2>
            <p>
              {latestBackup
                ? `Latest backup: ${latestBackup.createdAt.toLocaleString()}`
                : 'Create and verify a local backup of recipes, photos, and household data.'}
            </p>
          </div>
          <ChevronRight size={20} aria-hidden="true" />
        </Link>

        <Link className="settings-overview-card linked" href="/settings/profiles">
          <span className="settings-overview-icon" aria-hidden="true">
            <Users size={21} />
          </span>
          <div>
            <p className="eyebrow">HOUSEHOLD PROFILES</p>
            <h2>
              {state.profiles.length} active profile{state.profiles.length === 1 ? '' : 's'}
            </h2>
            <p>Manage names, colors, units, temperature preferences, and archived profiles.</p>
          </div>
          <ChevronRight size={20} aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
