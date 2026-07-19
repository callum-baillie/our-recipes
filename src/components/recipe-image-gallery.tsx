'use client';

import { ImagePlus, LoaderCircle, Pencil, Sparkles, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

import { useToast } from '@/components/toast-provider';
import { ClientHeicConversionError, convertHeicFilesInBrowser } from '@/lib/client/heic-conversion';

type RecipeImageGalleryProps = {
  recipeId: string;
  recipeTitle: string;
  images: Array<{ id: string; altText: string; width: number; height: number }>;
};

export function RecipeImageGallery({ recipeId, recipeTitle, images }: RecipeImageGalleryProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [converting, setConverting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editingPhotos, setEditingPhotos] = useState(false);
  const showEditor = images.length === 0 || editingPhotos;

  async function chooseImage(selected: File | null) {
    if (!selected) {
      setFile(null);
      return;
    }
    setConverting(true);
    setError(null);
    try {
      const converted = await convertHeicFilesInBrowser([selected], 10 * 1024 * 1024);
      setFile(converted.files[0] ?? null);
    } catch (error) {
      setFile(null);
      const message =
        error instanceof ClientHeicConversionError
          ? error.message
          : 'We could not prepare that image safely in this browser.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setConverting(false);
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      const message = 'Choose a JPEG, PNG, or WebP image first.';
      setError(message);
      showToast(message, 'error');
      return;
    }
    setPending(true);
    setError(null);
    const formData = new FormData();
    formData.set('image', file);
    formData.set('altText', altText);
    const response = await fetch(`/api/v1/recipes/${recipeId}/images`, {
      method: 'POST',
      body: formData,
    });
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    setPending(false);
    if (!response.ok) {
      const message = body?.error?.message ?? 'We could not add that photo yet.';
      setError(message);
      showToast(message, 'error');
      return;
    }
    setFile(null);
    setAltText('');
    const input = document.getElementById('recipe-image-upload') as HTMLInputElement | null;
    if (input) input.value = '';
    setEditingPhotos(false);
    showToast('Recipe photo added.', 'success');
    router.refresh();
  }

  async function remove(imageId: string) {
    setPending(true);
    setError(null);
    const response = await fetch(`/api/v1/recipes/${recipeId}/images/${imageId}`, {
      method: 'DELETE',
    });
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    setPending(false);
    if (!response.ok) {
      const message = body?.error?.message ?? 'We could not remove that photo yet.';
      setError(message);
      showToast(message, 'error');
      return;
    }
    showToast('Recipe photo removed.', 'success');
    router.refresh();
  }

  async function generateWithOpenAi() {
    setGenerating(true);
    setError(null);
    const response = await fetch(`/api/v1/recipes/${recipeId}/images/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    setGenerating(false);
    if (!response.ok) {
      const message = body?.error?.message ?? 'OpenAI could not generate a recipe image.';
      setError(message);
      showToast(message, 'error');
      return;
    }
    setEditingPhotos(false);
    showToast('Serving image generated and saved.', 'success');
    router.refresh();
  }

  return (
    <section className="recipe-media" aria-labelledby="recipe-photos-heading">
      <div className="recipe-media-heading">
        <div>
          <p className="eyebrow">LOCAL RECIPE PHOTOS</p>
          <h2 id="recipe-photos-heading">A little visual memory</h2>
        </div>
        <span>{images.length} saved</span>
      </div>
      {images.length > 0 && (
        <div className="recipe-image-grid">
          {images.map((image, index) => (
            <figure key={image.id}>
              <Image
                src={`/api/v1/recipes/${recipeId}/images/${image.id}`}
                alt={image.altText || `Photo ${index + 1} of ${recipeTitle}`}
                width={image.width}
                height={image.height}
                unoptimized
              />
              <figcaption>
                <div className="recipe-image-actions">
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => setEditingPhotos((current) => !current)}
                    aria-expanded={showEditor}
                    aria-controls="recipe-image-editor"
                    aria-label={`Edit recipe photos from photo ${index + 1}`}
                  >
                    <Pencil size={16} aria-hidden="true" />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => void remove(image.id)}
                    disabled={pending}
                    aria-label={`Remove photo ${index + 1}`}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <form
        className="recipe-image-form"
        id="recipe-image-editor"
        hidden={!showEditor}
        onSubmit={(event) => void upload(event)}
      >
        <label htmlFor="recipe-image-upload">
          <span>Add a recipe photo</span>
          <input
            id="recipe-image-upload"
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
            onChange={(event) => void chooseImage(event.target.files?.[0] ?? null)}
          />
        </label>
        <label>
          <span>
            Photo description <em>(optional)</em>
          </span>
          <input
            value={altText}
            maxLength={180}
            onChange={(event) => setAltText(event.target.value)}
            placeholder="e.g. The crispy-edged first batch"
          />
        </label>
        <p>
          JPEG, PNG, WebP, HEIC, or HEIF · 10 MB max · HEIC/HEIF converts in this browser before
          upload, then every accepted photo is stored locally as a cleaned WebP.
        </p>
        <p>
          Or use OpenAI to generate a serving image from this recipe’s title, summary, and
          ingredients. This is a paid external action only when you press the button; the result is
          stored locally after validation.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="text-button" type="submit" disabled={pending || converting || !file}>
          {pending || converting ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <ImagePlus size={16} />
          )}
          {converting ? 'Preparing local conversion' : 'Upload photo'}
        </button>
        <button
          className="text-button"
          type="button"
          onClick={() => void generateWithOpenAi()}
          disabled={generating || pending || converting}
        >
          {generating ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
          Generate serving image with OpenAI
        </button>
      </form>
    </section>
  );
}
