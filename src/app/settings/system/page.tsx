import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AppSettingsForm } from '@/components/app-settings-form';
import { BackupManager } from '@/components/backup-manager';
import { FreshInstallPanel } from '@/components/fresh-install-panel';
import { DiagnosticsExport } from '@/components/diagnostics-export';
import { SettingsPageHeader } from '@/components/settings-page-header';
import { SettingsPane, SettingsRow } from '@/components/settings-primitives';
import { getBackupStorageStatus, listBackups } from '@/lib/services/backup-service';
import { getHouseholdState } from '@/lib/services/household-service';
import { getReleaseStatus } from '@/lib/release';
import { getCatalogStatus } from '@/lib/services/bord-catalog-service';
import { listFoodProviderStatuses } from '@/lib/services/food-data-service';

export const dynamic = 'force-dynamic';

export default async function SystemSettingsPage() {
  const state = getHouseholdState();
  if (!state.household) notFound();
  const release = getReleaseStatus();
  const catalogStatus = await getCatalogStatus();
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
        title="System"
        description="Kitchen identity, installation status, backups, and recovery."
      />
      <AppSettingsForm
        initialKitchenName={state.household.kitchenName}
        initialKitchenIcon={state.household.kitchenIcon}
      />
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
        <SettingsRow title="Bòrd Food API">
          <output>
            {catalogStatus.state.replaceAll('_', ' ')} · {catalogStatus.mode.replaceAll('_', ' ')}
          </output>
        </SettingsRow>
        <SettingsRow title="Store directory">
          <output>{catalogStatus.storeDirectoryEnabled ? 'Enabled' : 'Disabled'}</output>
        </SettingsRow>
        {Object.entries(catalogStatus.packs).map(([name, pack]) => (
          <SettingsRow key={name} title={`Catalog · ${name}`}>
            <output>
              {!pack.enabled
                ? 'Disabled'
                : pack.stale
                  ? 'Stale'
                  : pack.available
                    ? 'Available'
                    : 'Initializing'}
            </output>
          </SettingsRow>
        ))}
        {Object.entries(catalogStatus.sources).map(([name, source]) => (
          <SettingsRow key={name} title={`Source · ${name.replaceAll('_', ' ')}`}>
            <output>
              {!source.enabled
                ? 'Disabled'
                : source.stale
                  ? 'Stale'
                  : source.available
                    ? 'Available'
                    : 'Initializing'}
            </output>
          </SettingsRow>
        ))}
        {catalogStatus.mapAssetsRightsBlocked && (
          <SettingsRow title="Map assets">
            <output>Rights blocked · official links may still be available</output>
          </SettingsRow>
        )}
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
      <BackupManager initialBackups={backups} storage={backupStorage} />
      <FreshInstallPanel />
    </main>
  );
}
