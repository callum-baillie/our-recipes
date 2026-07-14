import { lstat, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

import Tesseract from 'tesseract.js';

import {
  LOCAL_OCR_MODEL,
  localOcrModelProvenance,
  type LocalOcrModelProvenance,
} from '@/lib/ocr/model-manifest';

const MAX_ACTIVE_OCR_JOBS = 1;
const MAX_QUEUED_OCR_JOBS = 2;
export const LOCAL_OCR_TIMEOUT_MS = 45_000;
export const MIN_LOCAL_OCR_CONFIDENCE = 65;

type OcrWorker = {
  recognize(image: Buffer): Promise<{
    data: { text: string; confidence: number | null; version: string };
  }>;
  terminate(): Promise<unknown>;
};

export type LocalOcrWorkerOptions = {
  langPath: string;
  cacheMethod: 'none';
  gzip: true;
  logger: () => void;
  errorHandler: () => void;
};

export type LocalOcrWorkerFactory = (options: LocalOcrWorkerOptions) => Promise<OcrWorker>;

export type LocalOcrResult = {
  text: string;
  provenance: LocalOcrModelProvenance;
};

export type LocalOcrFailureCode = 'busy' | 'timeout' | 'unavailable';

export class LocalOcrError extends Error {
  constructor(readonly code: LocalOcrFailureCode) {
    super(code);
  }
}

const packageRequire = createRequire(resolve(process.cwd(), 'package.json'));
const waitQueue: Array<() => void> = [];
let activeJobs = 0;

function isInside(root: string, candidate: string): boolean {
  const difference = relative(root, candidate);
  return difference === '' || (!difference.startsWith('..') && !difference.includes(':'));
}

export async function assertLocalOcrModelDirectory(
  directory: string,
  approvedRoot: string,
): Promise<string> {
  const isWindowsDrivePath = /^[a-z]:[\\/]/i.test(directory);
  if (!isAbsolute(directory) || (!isWindowsDrivePath && /^[a-z][a-z\d+.-]*:/i.test(directory))) {
    throw new LocalOcrError('unavailable');
  }

  let resolvedDirectory: string;
  let resolvedRoot: string;
  try {
    [resolvedDirectory, resolvedRoot] = await Promise.all([
      realpath(directory),
      realpath(approvedRoot),
    ]);
    const asset = resolve(resolvedDirectory, LOCAL_OCR_MODEL.data.assetFile);
    const assetInfo = await lstat(asset);
    if (!assetInfo.isFile() || !isInside(resolvedRoot, asset)) {
      throw new Error('invalid local OCR model asset');
    }
  } catch {
    throw new LocalOcrError('unavailable');
  }

  if (!isInside(resolvedRoot, resolvedDirectory)) {
    throw new LocalOcrError('unavailable');
  }
  return resolvedDirectory;
}

export async function resolveLocalOcrModelDirectory(): Promise<string> {
  let packageRoot: string;
  try {
    packageRoot = dirname(packageRequire.resolve('@tesseract.js-data/eng/package.json'));
  } catch {
    throw new LocalOcrError('unavailable');
  }
  return assertLocalOcrModelDirectory(
    resolve(packageRoot, LOCAL_OCR_MODEL.data.assetDirectory),
    packageRoot,
  );
}

export function localOcrWorkerOptions(langPath: string): LocalOcrWorkerOptions {
  return {
    langPath,
    cacheMethod: 'none',
    gzip: true,
    logger: () => {},
    errorHandler: () => {},
  };
}

const defaultWorkerFactory: LocalOcrWorkerFactory = async (options) =>
  Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, options) as Promise<OcrWorker>;

async function acquireOcrSlot(): Promise<() => void> {
  if (activeJobs < MAX_ACTIVE_OCR_JOBS) {
    activeJobs += 1;
    return releaseOcrSlot;
  }
  if (waitQueue.length >= MAX_QUEUED_OCR_JOBS) {
    throw new LocalOcrError('busy');
  }
  await new Promise<void>((resolveWaiter) => waitQueue.push(resolveWaiter));
  return releaseOcrSlot;
}

function releaseOcrSlot(): void {
  const next = waitQueue.shift();
  if (next) {
    next();
    return;
  }
  activeJobs = Math.max(0, activeJobs - 1);
}

function boundedText(value: string): string {
  return value
    .replace(/\u0000/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 100_000);
}

function roundedConfidence(value: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function terminateQuietly(worker: OcrWorker | undefined): Promise<void> {
  await worker?.terminate().catch(() => undefined);
}

export async function recognizeLocalEnglishScans(
  images: Buffer[],
  options: {
    workerFactory?: LocalOcrWorkerFactory;
    modelDirectory?: string;
    approvedModelRoot?: string;
    timeoutMs?: number;
  } = {},
): Promise<LocalOcrResult> {
  if (images.length === 0 || images.length > 4) throw new LocalOcrError('unavailable');

  const release = await acquireOcrSlot();
  let worker: OcrWorker | undefined;
  let timedOut = false;
  const timeoutMs = options.timeoutMs ?? LOCAL_OCR_TIMEOUT_MS;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    const modelDirectory = options.modelDirectory
      ? await assertLocalOcrModelDirectory(
          options.modelDirectory,
          options.approvedModelRoot ?? options.modelDirectory,
        )
      : await resolveLocalOcrModelDirectory();
    const workerFactory = options.workerFactory ?? defaultWorkerFactory;

    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        void terminateQuietly(worker);
        reject(new LocalOcrError('timeout'));
      }, timeoutMs);
    });
    const execute = async (): Promise<LocalOcrResult> => {
      worker = await workerFactory(localOcrWorkerOptions(modelDirectory));
      if (timedOut) {
        await terminateQuietly(worker);
        throw new LocalOcrError('timeout');
      }
      const pages = [] as Array<{ text: string; confidence: number | null; version: string }>;
      for (const image of images) {
        const result = await worker.recognize(image);
        if (timedOut) throw new LocalOcrError('timeout');
        pages.push(result.data);
      }
      const confidence = roundedConfidence(
        pages.length === 0
          ? null
          : pages.reduce((total, page) => total + (page.confidence ?? 0), 0) / pages.length,
      );
      return {
        text: boundedText(pages.map((page) => page.text).join('\n\n')),
        provenance: localOcrModelProvenance(
          confidence,
          pages.map((page) => page.version).find((version) => version.length > 0) ?? null,
        ),
      };
    };
    return await Promise.race([execute(), timeout]);
  } catch (error) {
    if (error instanceof LocalOcrError) throw error;
    throw new LocalOcrError('unavailable');
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    await terminateQuietly(worker);
    release();
  }
}

export function localOcrNeedsManualTranscription(result: LocalOcrResult): boolean {
  return (
    result.text.length < 20 ||
    result.provenance.aggregateConfidence === null ||
    result.provenance.aggregateConfidence < MIN_LOCAL_OCR_CONFIDENCE
  );
}

export function resetLocalOcrQueueForTests(): void {
  activeJobs = 0;
  waitQueue.splice(0, waitQueue.length);
}
