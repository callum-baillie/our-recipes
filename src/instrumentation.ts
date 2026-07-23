export async function register() {}

export async function onRequestError(error: unknown, request: { path?: string }): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { recordApplicationError } = await import('@/lib/application-errors');
  recordApplicationError(error, request.path ?? 'unknown');
}
