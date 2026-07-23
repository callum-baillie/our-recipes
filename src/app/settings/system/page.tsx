import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AppSettingsForm } from '@/components/app-settings-form';
import { BackupManager } from '@/components/backup-manager';
import { FreshInstallPanel } from '@/components/fresh-install-panel';
import { DiagnosticsExport } from '@/components/diagnostics-export';
import { AppearanceSettings } from '@/components/theme-toggle';
import { listBackups } from '@/lib/services/backup-service';
import { getHouseholdState } from '@/lib/services/household-service';
import { getReleaseStatus } from '@/lib/release';
import { listFoodProviderStatuses } from '@/lib/services/food-data-service';

export const dynamic = 'force-dynamic';

export default async function SystemSettingsPage() {
  const state = getHouseholdState();
  if (!state.household) notFound();
  const release = getReleaseStatus();
  const foodProviders = listFoodProviderStatuses();
  const backups = (await listBackups()).map((backup) => ({
    ...backup,
    createdAt: backup.createdAt.toISOString(),
  }));
  return (
    <main className="recipe-page settings-hub system-settings-page">
      <section className="settings-intro settings-hub-intro">
        <Link className="quiet-link" href="/settings">
          ← All settings
        </Link>
        <p className="eyebrow">SYSTEM SETTINGS</p>
        <h1>Your kitchen, backed by Bòrd.</h1>
        <p>Kitchen identity, browser appearance, local recovery, and installation-level actions.</p>
      </section>
      <AppSettingsForm
        initialKitchenName={state.household.kitchenName}
        initialKitchenIcon={state.household.kitchenIcon}
      />
      <AppearanceSettings />
      <section className="settings-card" aria-labelledby="release-status-heading">
        <p className="eyebrow">INSTALLATION</p>
        <h2 id="release-status-heading">Release status</h2>
        <dl>
          <div>
            <dt>App</dt>
            <dd>{release.applicationVersion}</dd>
          </div>
          <div>
            <dt>Schema</dt>
            <dd>{release.schemaVersion}</dd>
          </div>
          <div>
            <dt>Migrations</dt>
            <dd>
              {release.migrationStatus} ({release.appliedMigrationCount}/
              {release.expectedMigrationCount})
            </dd>
          </div>
          <div>
            <dt>Database integrity</dt>
            <dd>{release.databaseIntegrity}</dd>
          </div>
        </dl>
      </section>
      <section className="settings-card" aria-labelledby="food-provider-status-heading">
        <p className="eyebrow">FOOD DATA</p>
        <h2 id="food-provider-status-heading">Read-only providers</h2>
        <p>
          Credentials stay in the server environment. Camera scanning also requires a trusted HTTPS
          origin.
        </p>
        <dl>
          {foodProviders.map((provider) => (
            <div key={provider.provider}>
              <dt>
                {provider.provider === 'open_food_facts'
                  ? 'Open Food Facts'
                  : 'USDA FoodData Central'}
              </dt>
              <dd>
                {provider.status.replaceAll('_', ' ')}
                {provider.remaining === null ? '' : ` · ${provider.remaining} upstream remaining`}
              </dd>
            </div>
          ))}
        </dl>
        <p>
          <Link href="/pantry">Open Pantry scanner</Link>
        </p>
      </section>
      <DiagnosticsExport />
      <section id="backups" className="embedded-backup-settings">
        <BackupManager initialBackups={backups} />
      </section>
      <FreshInstallPanel />
    </main>
  );
}
