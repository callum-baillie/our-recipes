import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { c as createTar } from 'tar';

import { getDataDirectory } from '@/lib/config';
import {
  MAX_PORTABLE_RECIPE_EXPORT_BYTES,
  MAX_PORTABLE_RECIPE_EXPORT_FILE_BYTES,
  MAX_PORTABLE_RECIPE_EXPORT_IMAGES,
  MAX_PORTABLE_RECIPE_EXPORT_MANIFEST_BYTES,
  MAX_PORTABLE_RECIPE_EXPORT_RECIPES,
  PORTABLE_RECIPE_EXPORT_FORMAT,
  PORTABLE_RECIPE_EXPORT_VERSION,
  PortableRecipeExportError,
  portableRecipeExportManifestSchema,
  type PortableRecipeExportManifest,
} from '@/lib/domain/recipe-export';
import { recipeAsJsonLd } from '@/lib/services/jsonld-service';
import { listRecipesForPortableExport } from '@/lib/services/recipe-service';
import { readRegularRecipeImage } from '@/lib/storage/recipe-image-storage';

const EXPORT_DOWNLOAD_NAME = 'bord-portable-recipes.tar.gz';
const MAX_ARCHIVE_OVERHEAD_BYTES =
  (MAX_PORTABLE_RECIPE_EXPORT_RECIPES + MAX_PORTABLE_RECIPE_EXPORT_IMAGES + 1) * 2_048;

export type PreparedPortableRecipeExport = {
  archivePath: string;
  bytes: number;
  downloadName: string;
  cleanup: () => Promise<void>;
};

type StagedFile = PortableRecipeExportManifest['files'][number];

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function stageDirectoryPrefix(): string {
  return join(/* turbopackIgnore: true */ getDataDirectory(), '.portable-recipe-export-');
}

function pathInside(root: string, candidate: string): boolean {
  const pathRelativeToRoot = relative(root, candidate);
  return (
    Boolean(pathRelativeToRoot) &&
    !pathRelativeToRoot.startsWith('..') &&
    !pathRelativeToRoot.includes(':')
  );
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' &&
    Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP'
  );
}

function archivePathForRecipe(index: number): string {
  return `recipes/${String(index + 1).padStart(5, '0')}.jsonld`;
}

function addBytes(
  totalBytes: number,
  bytes: number,
  maximumFileBytes = MAX_PORTABLE_RECIPE_EXPORT_FILE_BYTES,
  limitMessage = 'One portable export file exceeds the 10 MB safety limit.',
): number {
  if (bytes > maximumFileBytes) {
    throw new PortableRecipeExportError(limitMessage);
  }
  const nextTotal = totalBytes + bytes;
  if (nextTotal > MAX_PORTABLE_RECIPE_EXPORT_BYTES) {
    throw new PortableRecipeExportError('The portable export exceeds the 1 GB safety limit.');
  }
  return nextTotal;
}

async function writeStagedFile(
  stagingDirectory: string,
  archivePath: string,
  bytes: Uint8Array,
): Promise<void> {
  const destination = resolve(stagingDirectory, archivePath);
  if (!pathInside(stagingDirectory, destination)) {
    throw new PortableRecipeExportError('The portable export could not be staged safely.');
  }
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes, { flag: 'wx' });
}

async function assertStagedRegularFiles(
  stagingDirectory: string,
  archivePaths: readonly string[],
): Promise<void> {
  for (const archivePath of archivePaths) {
    const candidate = resolve(stagingDirectory, archivePath);
    if (!pathInside(stagingDirectory, candidate)) {
      throw new PortableRecipeExportError('The portable export contains an unsafe staged path.');
    }
    const details = await lstat(candidate);
    if (!details.isFile() || details.isSymbolicLink()) {
      throw new PortableRecipeExportError(
        'The portable export can contain only generated regular files.',
      );
    }
  }
}

function snapshotAt(recipes: ReturnType<typeof listRecipesForPortableExport>): string {
  const latest = recipes.reduce<Date | null>(
    (value, entry) => (!value || entry.recipe.updatedAt > value ? entry.recipe.updatedAt : value),
    null,
  );
  return (latest ?? new Date(0)).toISOString();
}

export async function createPortableRecipeExport(): Promise<PreparedPortableRecipeExport> {
  const stagingDirectory = await mkdtemp(stageDirectoryPrefix());
  const archivePath = `${stagingDirectory}.tar.gz`;
  const cleanup = async () => {
    await Promise.all([
      rm(archivePath, { force: true }),
      rm(stagingDirectory, { recursive: true, force: true }),
    ]);
  };

  try {
    const recipes = listRecipesForPortableExport();
    if (recipes.length > MAX_PORTABLE_RECIPE_EXPORT_RECIPES) {
      throw new PortableRecipeExportError(
        'The recipe library exceeds the 10,000-recipe export limit.',
      );
    }

    const files: StagedFile[] = [];
    const exportedImagePaths = new Set<string>();
    const recipeMappings: PortableRecipeExportManifest['recipes'] = [];
    let totalBytes = 0;

    for (const [index, entry] of recipes.entries()) {
      const imagePaths: string[] = [];
      const jsonLdImages: Array<{ path: string; altText: string }> = [];

      for (const image of entry.images) {
        const imageBytes = await readRegularRecipeImage(image.storageKey);
        if (!isWebp(imageBytes)) {
          throw new PortableRecipeExportError(
            'A recipe image is unavailable or is not a normalized WebP file.',
          );
        }
        const imageHash = sha256(imageBytes);
        const imageArchivePath = `images/${imageHash}.webp`;
        if (!exportedImagePaths.has(imageArchivePath)) {
          if (exportedImagePaths.size >= MAX_PORTABLE_RECIPE_EXPORT_IMAGES) {
            throw new PortableRecipeExportError(
              'The portable export exceeds the 50,000-image safety limit.',
            );
          }
          totalBytes = addBytes(totalBytes, imageBytes.byteLength);
          await writeStagedFile(stagingDirectory, imageArchivePath, imageBytes);
          files.push({
            path: imageArchivePath,
            mediaType: 'image/webp',
            bytes: imageBytes.byteLength,
            sha256: imageHash,
          });
          exportedImagePaths.add(imageArchivePath);
        }
        imagePaths.push(imageArchivePath);
        jsonLdImages.push({ path: `../${imageArchivePath}`, altText: image.altText });
      }

      const documentPath = archivePathForRecipe(index);
      const documentBytes = Buffer.from(
        `${JSON.stringify(recipeAsJsonLd(entry.recipe, { images: jsonLdImages }), null, 2)}\n`,
        'utf8',
      );
      totalBytes = addBytes(totalBytes, documentBytes.byteLength);
      await writeStagedFile(stagingDirectory, documentPath, documentBytes);
      files.push({
        path: documentPath,
        mediaType: 'application/ld+json',
        bytes: documentBytes.byteLength,
        sha256: sha256(documentBytes),
      });
      recipeMappings.push({ document: documentPath, images: [...new Set(imagePaths)] });
    }

    files.sort((left, right) => left.path.localeCompare(right.path));
    const manifest = portableRecipeExportManifestSchema.parse({
      format: PORTABLE_RECIPE_EXPORT_FORMAT,
      version: PORTABLE_RECIPE_EXPORT_VERSION,
      snapshotAt: snapshotAt(recipes),
      recipeCount: recipes.length,
      imageCount: exportedImagePaths.size,
      files,
      recipes: recipeMappings,
    });
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    totalBytes = addBytes(
      totalBytes,
      manifestBytes.byteLength,
      MAX_PORTABLE_RECIPE_EXPORT_MANIFEST_BYTES,
      'The portable export manifest exceeds the 16 MB safety limit.',
    );
    await writeStagedFile(stagingDirectory, 'manifest.json', manifestBytes);

    const archiveEntries = ['manifest.json', ...files.map((file) => file.path)].sort(
      (left, right) => left.localeCompare(right),
    );
    await assertStagedRegularFiles(stagingDirectory, archiveEntries);
    await createTar(
      {
        cwd: stagingDirectory,
        file: archivePath,
        gzip: true,
        portable: true,
        noMtime: true,
        strict: true,
      },
      archiveEntries,
    );
    const archiveDetails = await stat(archivePath);
    if (
      !archiveDetails.isFile() ||
      archiveDetails.size > MAX_PORTABLE_RECIPE_EXPORT_BYTES + MAX_ARCHIVE_OVERHEAD_BYTES
    ) {
      throw new PortableRecipeExportError('The portable export archive exceeds its safety limit.');
    }

    return {
      archivePath,
      bytes: archiveDetails.size,
      downloadName: EXPORT_DOWNLOAD_NAME,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    if (error instanceof PortableRecipeExportError) throw error;
    throw new PortableRecipeExportError('The portable export could not be created safely.');
  }
}
