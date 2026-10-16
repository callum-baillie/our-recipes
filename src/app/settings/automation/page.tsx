import Link from 'next/link';
import { SettingsPageHeader } from '@/components/settings-page-header';
import { SettingsPane, SettingsRow, SettingsSubsection } from '@/components/settings-primitives';
import { taskQueueStatus } from '@/lib/services/task-queue-service';
export const dynamic = 'force-dynamic';
export default function TaskQueuePage() {
  const queue = taskQueueStatus();
  return (
    <main className="recipe-page settings-hub">
      <SettingsPageHeader
        eyebrow="BACKGROUND TASKS"
        title="Task queue"
        description="Shared processing infrastructure for recipes, images, and scheduled meal-plan drafts."
      />
      <SettingsPane
        title="Background processing"
        description="Connection and worker configuration is managed on the server."
      >
        <SettingsRow
          title="Queue backend"
          description="Task progress and results remain in the app database."
        >
          <output>{queue.backend === 'redis' ? 'Redis / BullMQ' : 'Built-in SQLite queue'}</output>
        </SettingsRow>
        <SettingsRow title="Worker status">
          <output>
            {process.env.NODE_ENV !== 'production'
              ? 'Inactive in development'
              : queue.enabled
                ? 'Enabled'
                : 'Disabled'}
          </output>
        </SettingsRow>
        <SettingsRow title="Transport status">
          <output>{queue.connected ? 'Available' : 'Waiting for Redis'}</output>
        </SettingsRow>
        <SettingsSubsection
          title="Optional Redis service"
          description="For a separate self-hosted queue transport, use docker-compose.queue.yml and set QUEUE_BACKEND=redis and REDIS_URL in the server environment. Credentials stay on the server."
        />
      </SettingsPane>
      <SettingsPane title="Personal automation">
        <SettingsRow
          title="Schedules & processing preferences"
          description="Choose Direct or Batch processing, schedule meal-plan drafts, and review your background tasks."
        >
          <Link className="text-button" href="/account/automation">
            Open my automation
          </Link>
        </SettingsRow>
      </SettingsPane>
    </main>
  );
}
