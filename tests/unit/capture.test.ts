import { describe, expect, it } from 'vitest';

import { draftFromText } from '@/lib/domain/capture';
import { fetchPublicText, isPublicAddress } from '@/lib/safe-url-fetcher';
import { CaptureCandidateNotFoundError, capturePublicUrl } from '@/lib/services/capture-service';

describe('review-first capture', () => {
  it('creates a draft without persisting a recipe', () => {
    const draft = draftFromText('Tomato soup\nIngredients\n2 tbsp oil\nMethod\n1. Simmer.');
    expect(draft.recipe.title).toBe('Tomato soup');
    expect(draft.provenance.kind).toBe('text');
  });

  it('rejects private and reserved addresses', () => {
    expect(isPublicAddress('127.0.0.1')).toBe(false);
    expect(isPublicAddress('192.168.1.4')).toBe(false);
    expect(isPublicAddress('::1')).toBe(false);
    expect(isPublicAddress('8.8.8.8')).toBe(true);
  });

  it('extracts bounded HTML only after resolving a public address', async () => {
    const result = await fetchPublicText('https://recipes.example.test/soup', {
      lookup: async () => [{ address: '8.8.8.8' }],
      fetchImpl: async () =>
        new Response('<h1>Soup</h1><script>alert(1)</script><p>Ingredients</p>', {
          headers: { 'content-type': 'text/html' },
        }),
    });
    expect(result.text).toContain('Soup');
    expect(result.text).not.toContain('alert');
  });

  it('revalidates redirect destinations', async () => {
    await expect(
      fetchPublicText('https://recipes.example.test/go', {
        lookup: async (host) => [
          { address: host === 'private.example.test' ? '127.0.0.1' : '8.8.8.8' },
        ],
        fetchImpl: async () =>
          new Response(null, {
            status: 302,
            headers: { location: 'https://private.example.test/secret' },
          }),
      }),
    ).rejects.toThrow('private or reserved');
  });

  it('selects one of multiple embedded Schema.org Recipe candidates without a live web request', async () => {
    const html = `
      <script type="application/ld+json">{
        "@context":"https://schema.org",
        "@graph":[
          {"@type":"Recipe","name":"Tomato toast","recipeYield":"2 servings","recipeIngredient":["2 slices bread"],"recipeInstructions":["Toast the bread."]},
          {"@type":"Recipe","name":"Lemon beans","recipeYield":"4 servings","recipeIngredient":["1 can beans"],"recipeInstructions":["Warm the beans."]}
        ]
      }</script>
      <h1>Two recipe page</h1>`;
    const fetchPublicText = async () => ({
      url: 'https://recipes.example.test/two-recipes',
      contentType: 'text/html',
      html,
      text: 'Two recipe page',
    });

    await expect(
      capturePublicUrl('https://recipes.example.test/two-recipes', undefined, {
        fetchPublicText,
      }),
    ).resolves.toEqual({
      candidates: [
        expect.objectContaining({ index: 0, title: 'Tomato toast', source: 'schema-jsonld' }),
        expect.objectContaining({ index: 1, title: 'Lemon beans', source: 'schema-jsonld' }),
      ],
    });
    await expect(
      capturePublicUrl('https://recipes.example.test/two-recipes', 1, { fetchPublicText }),
    ).resolves.toMatchObject({
      draft: {
        recipe: { title: 'Lemon beans', sourceUrl: 'https://recipes.example.test/two-recipes' },
        provenance: { extractionMethod: 'url-jsonld' },
      },
    });
    await expect(
      capturePublicUrl('https://recipes.example.test/two-recipes', 3, { fetchPublicText }),
    ).rejects.toBeInstanceOf(CaptureCandidateNotFoundError);
  });

  it('uses bounded Microdata before an explicit Open Graph/text fallback', async () => {
    const microdata = await capturePublicUrl('https://recipes.example.test/microdata', undefined, {
      fetchPublicText: async () => ({
        url: 'https://recipes.example.test/microdata',
        contentType: 'text/html',
        text: 'Pasta ingredients olive oil method toss',
        html: `
          <article itemscope itemtype="https://schema.org/Recipe">
            <h1 itemprop="name">Microdata pasta</h1>
            <p itemprop="description">A fast bowl.</p>
            <span itemprop="recipeYield">2 servings</span>
            <span itemprop="recipeIngredient">2 tbsp olive oil</span>
            <div itemprop="recipeInstructions">Toss and serve.</div>
          </article>`,
      }),
    });
    expect(microdata).toEqual({
      candidates: [expect.objectContaining({ title: 'Microdata pasta', source: 'microdata' })],
    });

    const fallback = await capturePublicUrl('https://recipes.example.test/open-graph', undefined, {
      fetchPublicText: async () => ({
        url: 'https://recipes.example.test/open-graph',
        contentType: 'text/html',
        text: 'Fallback stew\nIngredients\n1 onion\nMethod\n1. Simmer.',
        html: '<meta property="og:title" content="Open Graph stew"><meta property="og:description" content="A safe fallback.">',
      }),
    });
    expect(fallback).toMatchObject({
      draft: {
        recipe: { title: 'Open Graph stew', summary: 'A safe fallback.' },
        provenance: { extractionMethod: 'url-open-graph' },
      },
    });
  });
});
