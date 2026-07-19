import Link from 'next/link';

import { BackupManager } from '@/components/backup-manager';
import { listBackups } from '@/lib/services/backup-service';

export const dynamic = 'force-dynamic';

export default async function BackupsPage() {
  const backups = (await listBackups()).map((backup) => ({
    ...backup,
    createdAt: backup.createdAt.toISOString(),
  }));
  return (
    <main className="recipe-page backup-page">
      <header className="recipe-header">
        <Link className="wordmark" href="/">
          <span className="wordmark-mark" aria-hidden="true" />
          <span>Our Recipes</span>
        </Link>
        <Link className="quiet-link" href="/recipes">
          Back to cookbook
        </Link>
      </header>
      <BackupManager initialBackups={backups} />
    </main>
  );
}
