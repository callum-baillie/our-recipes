import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  LocalOcrError,
  assertLocalOcrModelDirectory,
  localOcrNeedsManualTranscription,
  recognizeLocalEnglishScans,
  resetLocalOcrQueueForTests,
  type LocalOcrWorkerFactory,
} from '@/lib/ocr/local-ocr';

const temporaryRoots: string[] = [];

async function localModelDirectory(): Promise<{ root: string; directory: string }> {
  const root = await mkdtemp(join(tmpdir(), 'our-recipes-ocr-'));
  temporaryRoots.push(root);
  const directory = join(root, '4.0.0');
  await mkdir(directory);
  await writeFile(join(directory, 'eng.traineddata.gz'), Buffer.from([0x1f, 0x8b]));
  return { root, directory };
}

afterEach(async () => {
  resetLocalOcrQueueForTests();
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('local OCR guardrail', () => {
  it('accepts only an existing local model directory inside the approved package root', async () => {
    const { root, directory } = await localModelDirectory();
    await expect(assertLocalOcrModelDirectory(directory, root)).resolves.toBe(directory);
    await expect(
      assertLocalOcrModelDirectory('https://example.test/model', root),
    ).rejects.toMatchObject({
      code: 'unavailable',
    });
    await expect(assertLocalOcrModelDirectory(join(root, 'missing'), root)).rejects.toMatchObject({
      code: 'unavailable',
    });
  });

  it('uses only local worker options and preserves ordered scan text', async () => {
    const { root, directory } = await localModelDirectory();
    const terminate = vi.fn(async () => undefined);
    const recognize = vi
      .fn()
      .mockResolvedValueOnce({ data: { text: 'Tomato soup', confidence: 93, version: '5.5.0' } })
      .mockResolvedValueOnce({
        data: { text: 'Ingredients\n2 tomatoes', confidence: 91, version: '5.5.0' },
      });
    const factory = vi.fn(async () => ({ recognize, terminate }));

    const result = await recognizeLocalEnglishScans([Buffer.from('first'), Buffer.from('second')], {
      workerFactory: factory,
      modelDirectory: directory,
      approvedModelRoot: root,
    });

    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({ langPath: directory, cacheMethod: 'none', gzip: true }),
    );
    expect(result.text).toBe('Tomato soup\n\nIngredients\n2 tomatoes');
    expect(result.provenance.aggregateConfidence).toBe(92);
    expect(recognize).toHaveBeenCalledTimes(2);
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it('returns a retryable busy result when the bounded queue is full', async () => {
    const { root, directory } = await localModelDirectory();
    let releaseRecognition: (() => void) | undefined;
    const recognitionGate = new Promise<void>((resolve) => {
      releaseRecognition = resolve;
    });
    const factory: LocalOcrWorkerFactory = async () => ({
      recognize: async () => {
        await recognitionGate;
        return {
          data: { text: 'Pasta recipe with enough text', confidence: 90, version: '5.5.0' },
        };
      },
      terminate: async () => undefined,
    });
    const input = {
      workerFactory: factory,
      modelDirectory: directory,
      approvedModelRoot: root,
    };
    const first = recognizeLocalEnglishScans([Buffer.from('first')], input);
    await Promise.resolve();
    const second = recognizeLocalEnglishScans([Buffer.from('second')], input);
    const third = recognizeLocalEnglishScans([Buffer.from('third')], input);

    await expect(recognizeLocalEnglishScans([Buffer.from('fourth')], input)).rejects.toMatchObject({
      code: 'busy',
    });
    releaseRecognition?.();
    await expect(Promise.all([first, second, third])).resolves.toHaveLength(3);
  });

  it('terminates a worker when the total OCR deadline elapses', async () => {
    const { root, directory } = await localModelDirectory();
    const terminate = vi.fn(async () => undefined);
    const factory: LocalOcrWorkerFactory = async () => ({
      recognize: async () => new Promise(() => undefined),
      terminate,
    });

    await expect(
      recognizeLocalEnglishScans([Buffer.from('scan')], {
        workerFactory: factory,
        modelDirectory: directory,
        approvedModelRoot: root,
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({ code: 'timeout' } satisfies Pick<LocalOcrError, 'code'>);
    expect(terminate).toHaveBeenCalled();
  });

  it('requires manual transcription for blank, missing, or low-confidence output', () => {
    expect(
      localOcrNeedsManualTranscription({
        text: 'A sufficiently long recipe transcription',
        provenance: {
          modelId: 'test',
          runtimeVersion: '7.0.0',
          dataVersion: '1.0.0',
          engineVersion: '5.5.0',
          aggregateConfidence: 64,
        },
      }),
    ).toBe(true);
    expect(
      localOcrNeedsManualTranscription({
        text: '',
        provenance: {
          modelId: 'test',
          runtimeVersion: '7.0.0',
          dataVersion: '1.0.0',
          engineVersion: null,
          aggregateConfidence: 99,
        },
      }),
    ).toBe(true);
  });
});
