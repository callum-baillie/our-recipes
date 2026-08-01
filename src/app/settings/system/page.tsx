import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AppSettingsForm } from '@/components/app-settings-form';
import { BackupManager } from '@/components/backup-manager';
import { FreshInstallPanel } from '@/components/fresh-install-panel';
import { DiagnosticsExport } from '@/components/diagnostics-export';
import { SettingsPageHeader } from '@/components/settings-page-header';
import { SettingsPane, SettingsRow } from '@/components/settings-primitives';
import { AppearanceSettings } from '@/components/theme-toggle';
import { getBackupStorageStatus, listBackups } from '@/lib/services/backup-service';
import { getHouseholdState } from '@/lib/services/household-service';
import { getReleaseStatus } from '@/lib/release';
import { listFoodProviderStatuses } from '@/lib/services/food-data-service';

export const dynamic = 'force-dynamic';

export default async function SystemSettingsPage() {
  const state = getHouseholdState();
  if (!state.household) notFound();
  const release = getReleaseStatus();
  const foodProviders = listFoodProviderStatuses();
  const backupStorage = getBackupStorageStatus();
  const backups = (await listBackups()).map((backup) => ({
    ...backup,
    createdAt: backup.createdAt.toISOString(),
  }));
  return (
    <main className="recipe-page settings-hub system-settings-page">
      <SettingsPageHeader
        eyebrow="SYSTEM SETTINGS"
        title="Your kitchen, backed by Bòrd."
        description="Kitchen identity, browser appearance, local recovery, and installation-level actions."
      />
      <AppSettingsForm
        initialKitchenName={state.household.kitchenName}
        initialKitchenIcon={state.household.kitchenIcon}
      />
      <AppearanceSettings />
      <SettingsPane
        eyebrow="INSTALLATION"
        title="Release status"
        description="Read-only details for this installation and its local database."
      >
        <SettingsRow title="App version">
          <output>{release.applicationVersion}</output>
        </SettingsRow>
        <SettingsRow title="Schema version">
          <output>{release.schemaVersion}</output>
        </SettingsRow>
        <SettingsRow title="Database migrations">
          <output>
            {release.migrationStatus} ({release.appliedMigrationCount}/
            {release.expectedMigrationCount})
          </output>
        </SettingsRow>
        <SettingsRow title="Database integrity">
          <output>{release.databaseIntegrity}</output>
        </SettingsRow>
      </SettingsPane>
      <SettingsPane
        eyebrow="FOOD DATA"
        title="Read-only providers"
        description="Credentials stay in the server environment. Camera scanning also requires a trusted HTTPS origin."
      >
        {foodProviders.map((provider) => (
          <SettingsRow
            key={provider.provider}
            title={
              provider.provider === 'open_food_facts' ? 'Open Food Facts' : 'USDA FoodData Central'
            }
          >
            <output>
              {provider.status.replaceAll('_', ' ')}
              {provider.remaining === null ? '' : ` · ${provider.remaining} upstream remaining`}
            </output>
          </SettingsRow>
        ))}
        <div className="settings-pane-link">
          <Link href="/pantry">Open Pantry scanner</Link>
        </div>
      </SettingsPane>
      <DiagnosticsExport />
      <section id="backups" className="embedded-backup-settings">
        <BackupManager initialBackups={backups} storage={backupStorage} />
      </section>
      <FreshInstallPanel />
    </main>
  );
}
