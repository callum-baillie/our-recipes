export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const [{ ensureBackupScheduler }, { startAiSummaryScheduler }, { startAiJobWorker }] =
      await Promise.all([
        import('@/lib/services/backup-service'),
        import('@/lib/services/ai-summary-service'),
        import('@/lib/services/ai-job-service'),
      ]);
    const { ensureIntegrationScheduler } = await import('@/lib/services/integration-scheduler');
    ensureIntegrationScheduler();
    ensureBackupScheduler();
    startAiSummaryScheduler();
    startAiJobWorker();
  }
}

export async function onRequestError(error: unknown, request: { path?: string }): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { recordApplicationError } = await import('@/lib/application-errors');
    recordApplicationError(error, request.path ?? 'unknown');
  }
}
