export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const [{ ensureBackupScheduler }, { startAiSummaryScheduler }, { startAiJobWorker }] =
      await Promise.all([
        import('@/lib/services/backup-service'),
        import('@/lib/services/ai-summary-service'),
        import('@/lib/services/ai-job-service'),
      ]);
    const { ensureIntegrationScheduler } = await import('@/lib/services/integration-scheduler');
    const { createLogger } = await import('@/lib/logger');
    const { APPLICATION_VERSION } = await import('@/lib/release');
    createLogger('server').info('Bòrd server starting', {
      version: APPLICATION_VERSION,
      nodeEnv: process.env.NODE_ENV,
      logLevel: process.env.LOG_LEVEL ?? 'info',
    });
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
    const { createLogger } = await import('@/lib/logger');
    createLogger('server').error('unhandled request error', {
      path: (request.path ?? 'unknown').replace(/\?.*$/u, ''),
      error,
    });
  }
}
