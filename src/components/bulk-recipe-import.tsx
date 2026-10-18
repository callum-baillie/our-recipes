'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { FileImage, Plus, Trash2 } from 'lucide-react';
import type { AiBulkSource } from '@/lib/domain/ai-bulk-import';
import { SettingsPane, SettingsField, SettingsActionBar } from './settings-primitives';
import { ButtonSpinner } from './skeleton';
import styles from './bulk-recipe-import.module.css';
export function BulkRecipeImport() {
  const [text, setText] = useState('');
  const [urls, setUrls] = useState('');
  const [images, setImages] = useState<Extract<AiBulkSource, { kind: 'image' }>[]>([]);
  const [paid, setPaid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [job, setJob] = useState<{ id: string; totalItems: number; executionMode: string } | null>(
    null,
  );
  const sources = useMemo<AiBulkSource[]>(
    () => [
      ...text
        .split(/\n\s*\n/u)
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => ({ kind: 'prompt' as const, text: value })),
      ...urls
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean)
        .map((url) => ({ kind: 'url' as const, url })),
      ...images,
    ],
    [text, urls, images],
  );
  async function addFiles(files: File[]) {
    setReading(true);
    setError('');
    try {
      if (images.length + files.length > 20) throw new Error('Choose up to 20 recipe images.');
      const added: typeof images = [];
      for (const file of files) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
          throw new Error('Choose JPG, PNG, or WebP images.');
        if (file.size > 6_000_000)
          throw new Error(`${file.name} is too large. Choose images under 6 MB.`);
        const dataBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
          reader.onerror = () => reject(new Error('Could not read this image.'));
          reader.readAsDataURL(file);
        });
        added.push({
          kind: 'image',
          name: file.name,
          image: { mimeType: file.type as 'image/jpeg', dataBase64 },
        });
      }
      if (
        [...images, ...added].reduce((sum, image) => sum + image.image.dataBase64.length, 0) >
        12_000_000
      )
        throw new Error('Choose images under 9 MB combined.');
      setImages((current) => [...current, ...added]);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not read images.');
    } finally {
      setReading(false);
    }
  }
  async function submit() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/v1/ai/imports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources, confirmPaid: paid }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Could not start recipe import.');
      setJob(body.job);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not start recipe import.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`settings-stack ${styles.root}`}>
      {job ? (
        <SettingsPane
          title={`${job.totalItems} recipes queued`}
          description={`Your recipes are running in the background using ${job.executionMode === 'batch' ? 'Batch processing. Results can take up to 24 hours.' : 'direct processing.'} You can close this page and return to Background tasks to review drafts, failures, or retries.`}
        >
          <Link className="primary-button" href="/account/automation">
            View progress and review drafts
          </Link>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setJob(null);
              setText('');
              setUrls('');
              setImages([]);
              setPaid(false);
            }}
          >
            Start another import
          </button>
        </SettingsPane>
      ) : (
        <>
          <SettingsPane
            title="Recipe prompts or pasted recipes"
            description="Separate each recipe with a blank line. You can combine prompts, links, and photos in one import."
          >
            <SettingsField title="Recipe prompts">
              <textarea
                aria-label="Recipe prompts"
                rows={7}
                placeholder={'A quick chickpea curry\n\nA lemon drizzle cake'}
                value={text}
                disabled={busy}
                onChange={(event) => setText(event.target.value)}
              />
            </SettingsField>
          </SettingsPane>
          <SettingsPane
            title="Recipe links"
            description="One public recipe URL per line. Each link imports one recipe; if a page has several, the first is used."
          >
            <SettingsField title="Recipe URLs">
              <textarea
                aria-label="Recipe URLs"
                rows={4}
                placeholder={'https://example.com/recipe-one\nhttps://example.com/recipe-two'}
                value={urls}
                disabled={busy}
                onChange={(event) => setUrls(event.target.value)}
              />
            </SettingsField>
          </SettingsPane>
          <SettingsPane
            title="Recipe photos"
            description="Each image becomes a separate recipe draft. Choose JPG, PNG, or WebP, up to 6 MB each and 9 MB combined. For several pages of one recipe, use the single-recipe image importer."
          >
            <label className={styles.upload}>
              <FileImage size={20} aria-hidden="true" />
              <span>{reading ? 'Reading images…' : 'Choose recipe images'}</span>
              <input
                aria-label="Recipe images"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={busy || reading}
                onChange={(event) => {
                  void addFiles(Array.from(event.target.files ?? []));
                  event.target.value = '';
                }}
              />
            </label>
            <ul className={styles.images}>
              {images.map((image, index) => (
                <li key={`${image.name}-${index}`}>
                  <span>{image.name}</span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove ${image.name}`}
                    disabled={busy}
                    onClick={() =>
                      setImages((current) => current.filter((_, position) => position !== index))
                    }
                  >
                    <Trash2 size={18} />
                  </button>
                </li>
              ))}
            </ul>
          </SettingsPane>
          <SettingsPane
            title={`${sources.length} recipes ready to import`}
            description="Choose 2–20 recipes. Bulk imports use Batch by default. You’ll review the drafts before saving anything to your cookbook."
          >
            <SettingsField
              title="Allow this paid AI import"
              description="Send these sources and your permitted context to OpenAI. This can incur charges."
            >
              <input
                type="checkbox"
                aria-label="Allow this paid AI import"
                checked={paid}
                disabled={busy}
                onChange={(event) => setPaid(event.target.checked)}
              />
            </SettingsField>
            <Link href="/account/ai">Change my models and processing preferences</Link>
          </SettingsPane>
          <SettingsActionBar>
            <button
              type="button"
              className="primary-button"
              disabled={busy || reading || !paid || sources.length < 2 || sources.length > 20}
              onClick={() => void submit()}
            >
              {busy ? (
                <>
                  <ButtonSpinner /> Preparing import…
                </>
              ) : (
                <>
                  <Plus size={18} /> Import {sources.length} recipes
                </>
              )}
            </button>
          </SettingsActionBar>
        </>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
