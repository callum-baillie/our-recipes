import 'server-only';
import { logger } from '@/lib/logger';
import { Queue, Worker } from 'bullmq';
import { runDueAiJobs } from './ai-job-service';
import { enqueueScheduledPlans } from './task-scheduler-service';
declare global {
  var bordTaskQueueState: { queue?: Queue; worker?: Worker; connected: boolean } | undefined;
}
const state = (globalThis.bordTaskQueueState ??= { connected: false });
function connection() {
  const raw = process.env.REDIS_URL;
  if (!raw) throw new Error('REDIS_URL is required for the Redis queue backend.');
  const url = new URL(raw);
  if (!['redis:', 'rediss:'].includes(url.protocol))
    throw new Error('Use a redis or rediss connection URL.');
  const db = Number(url.pathname.slice(1) || 0);
  if (!Number.isSafeInteger(db) || db < 0) throw new Error('Choose a valid Redis database index.');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: decodeURIComponent(url.username) || undefined,
    password: decodeURIComponent(url.password) || undefined,
    db,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}
export function taskQueueStatus() {
  return {
    backend: process.env.QUEUE_BACKEND === 'redis' ? 'redis' : 'sqlite',
    enabled: process.env.AI_WORKER_ENABLED !== 'false',
    connected: process.env.QUEUE_BACKEND === 'redis' ? state.connected : true,
  };
}
export async function startTaskQueue() {
  if (state.worker || process.env.AI_WORKER_ENABLED === 'false') return;
  const config = connection();
  state.queue = new Queue('bord-tasks', {
    connection: { ...config, maxRetriesPerRequest: 1, enableOfflineQueue: false },
    defaultJobOptions: { removeOnComplete: 20, removeOnFail: 50 },
  });
  state.queue.on('error', () => {
    state.connected = false;
  });
  state.worker = new Worker(
    'bord-tasks',
    async () => {
      enqueueScheduledPlans();
      await runDueAiJobs();
    },
    { connection: config, concurrency: 1 },
  );
  state.worker.on('ready', () => {
    state.connected = true;
  });
  state.worker.on('error', () => {
    state.connected = false;
  });
  state.worker.on('failed', (_job, error) => {
    logger
      .child('tasks')
      .error('Task queue tick failed; durable task state remains in SQLite.', { error });
  });
  const schedule = () =>
    state
      .queue!.upsertJobScheduler(
        'bord-task-tick',
        { every: 10000 },
        {
          name: 'process-durable-tasks',
          data: {},
          opts: { removeOnComplete: 20, removeOnFail: 50 },
        },
      )
      .catch(() => {
        setTimeout(() => void schedule(), 10000).unref?.();
      });
  await schedule();
}
export async function wakeTaskQueue() {
  await startTaskQueue();
  if (state.queue)
    await state.queue
      .add(
        'wake',
        {},
        {
          jobId: `wake-${Math.floor(Date.now() / 5000)}`,
          removeOnComplete: true,
          removeOnFail: 20,
        },
      )
      .catch(() => undefined);
}
