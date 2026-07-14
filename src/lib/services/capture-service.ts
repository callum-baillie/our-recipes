import { load, type CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';

import { type CaptureCandidate, type CaptureDraft, draftFromText } from '@/lib/domain/capture';
import { JsonLdValidationError } from '@/lib/domain/jsonld';
import { recipeInputSchema } from '@/lib/domain/recipe';
import { fetchPublicText } from '@/lib/safe-url-fetcher';
import {
  createJsonLdDraft,
  findJsonLdCandidates,
  type JsonLdDraft,
} from '@/lib/services/jsonld-service';

type PublicTextFetcher = typeof fetchPublicText;

type StructuredCandidate = {
  candidate: CaptureCandidate;
  draft: CaptureDraft;
};

export class CaptureCandidateNotFoundError extends Error {}

function sourceDetails(url: string) {
  return { url, name: new URL(url).hostname };
}

function compactText(value: string, max: number): string {
  return value.replace(/\s+/gu, ' ').trim().slice(0, max);
}

function durationMinutes(value: string): number | null {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/iu.exec(value.trim());
  if (!match) return null;
  const minutes =
    Number(match[1] ?? 0) * 1_440 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return Number.isSafeInteger(minutes) && minutes <= 10_080 ? minutes : null;
}

function draftFromStructuredValues(
  values: {
    title: string;
    summary?: string;
    servings?: string;
    prepTime?: string;
    cookTime?: string;
    category?: string;
    cuisine?: string;
    keywords?: string[];
    ingredients: string[];
    steps: string[];
  },
  source: { url: string; name: string },
  extractionMethod: 'url-microdata' | 'url-open-graph',
  warnings: string[],
): CaptureDraft {
  const text = [values.title, 'Ingredients', ...values.ingredients, 'Method', ...values.steps].join(
    '\n',
  );
  const basic = draftFromText(text, source);
  const prepMinutes = values.prepTime ? durationMinutes(values.prepTime) : null;
  const cookMinutes = values.cookTime ? durationMinutes(values.cookTime) : null;
  if (values.prepTime && prepMinutes === null)
    warnings.push('Prep time was not a supported ISO 8601 duration and needs review.');
  if (values.cookTime && cookMinutes === null)
    warnings.push('Cook time was not a supported ISO 8601 duration and needs review.');
  return {
    ...basic,
    recipe: recipeInputSchema.parse({
      ...basic.recipe,
      title: compactText(values.title, 160),
      summary: compactText(values.summary ?? '', 800),
      servings: compactText(values.servings ?? '', 80) || basic.recipe.servings,
      prepMinutes: prepMinutes ?? 0,
      cookMinutes: cookMinutes ?? 0,
      category: compactText(values.category ?? '', 80),
      cuisine: compactText(values.cuisine ?? '', 80),
      tags: (values.keywords ?? [])
        .map((tag) => compactText(tag, 40))
        .filter(Boolean)
        .slice(0, 20),
      sourceName: source.name,
      sourceUrl: source.url,
    }),
    provenance: {
      ...basic.provenance,
      extractionMethod,
      warnings,
      extractionNotice:
        'This deterministic page metadata is a draft. Review every field before adding it to the shared cookbook.',
    },
  };
}

function jsonLdDraftForUrl(
  draft: JsonLdDraft,
  source: { url: string; name: string },
): CaptureDraft {
  return {
    recipe: recipeInputSchema.parse({
      ...draft.recipe,
      sourceName: source.name,
      sourceUrl: source.url,
    }),
    provenance: {
      kind: 'url',
      sourceUrl: source.url,
      sourceName: source.name,
      extractionMethod: 'url-jsonld',
      warnings: draft.warnings,
      extractionNotice:
        'This embedded Schema.org Recipe is a draft. Review every field before adding it to the shared cookbook.',
    },
    originalText: '',
  };
}

function jsonLdCandidates(
  html: string,
  source: { url: string; name: string },
): StructuredCandidate[] {
  const $ = load(html);
  const documents: unknown[] = [];
  let jsonCharacters = 0;
  $('script[type="application/ld+json" i]').each((_, element) => {
    if (documents.length >= 20) return;
    const raw = $(element).text().trim();
    if (!raw || raw.length > 50_000 || jsonCharacters + raw.length > 350_000) return;
    try {
      documents.push(JSON.parse(raw));
      jsonCharacters += raw.length;
    } catch {
      // Invalid script blocks are ignored; they cannot become recipe candidates.
    }
  });
  if (!documents.length) return [];
  const combined = JSON.stringify(documents);
  let candidates;
  try {
    candidates = findJsonLdCandidates(combined);
  } catch (error) {
    if (error instanceof JsonLdValidationError) return [];
    throw error;
  }
  return candidates.flatMap((candidate) => {
    try {
      const draft = createJsonLdDraft(combined, candidate.index);
      return [
        {
          candidate: {
            index: candidate.index,
            title: candidate.title,
            summary: candidate.summary,
            source: 'schema-jsonld' as const,
            warnings: candidate.warnings,
          },
          draft: jsonLdDraftForUrl(draft, source),
        },
      ];
    } catch {
      return [];
    }
  });
}

function elementValue($: CheerioAPI, element: Element): string {
  const node = $(element);
  return compactText(
    node.attr('content') ??
      node.attr('datetime') ??
      node.attr('href') ??
      node.attr('src') ??
      node.text(),
    2_000,
  );
}

function microdataValues($: CheerioAPI, root: Element, property: string, max = 80): string[] {
  return $(root)
    .find(`[itemprop~="${property}"]`)
    .toArray()
    .map((element) => elementValue($, element))
    .filter(Boolean)
    .slice(0, max);
}

function microdataCandidates(
  html: string,
  source: { url: string; name: string },
): StructuredCandidate[] {
  const $ = load(html);
  const roots = $('[itemscope][itemtype]')
    .toArray()
    .filter((element) =>
      /(^|\s)(?:https?:\/\/schema\.org\/)?Recipe(?:\s|$)/iu.test($(element).attr('itemtype') ?? ''),
    )
    .slice(0, 20);
  return roots.flatMap((root, index) => {
    const title = microdataValues($, root, 'name', 1)[0] ?? '';
    if (!title) return [];
    const ingredients = microdataValues($, root, 'recipeIngredient');
    const steps = microdataValues($, root, 'recipeInstructions');
    const warnings: string[] = [];
    if (!ingredients.length) warnings.push('This Microdata Recipe had no structured ingredients.');
    if (!steps.length) warnings.push('This Microdata Recipe had no structured method steps.');
    const draft = draftFromStructuredValues(
      {
        title,
        summary: microdataValues($, root, 'description', 1)[0],
        servings: microdataValues($, root, 'recipeYield', 1)[0],
        prepTime: microdataValues($, root, 'prepTime', 1)[0],
        cookTime: microdataValues($, root, 'cookTime', 1)[0],
        category: microdataValues($, root, 'recipeCategory', 1)[0],
        cuisine: microdataValues($, root, 'recipeCuisine', 1)[0],
        keywords: microdataValues($, root, 'keywords', 20).flatMap((value) => value.split(',')),
        ingredients: ingredients.length ? ingredients : ['Review ingredients'],
        steps: steps.length ? steps : ['Review and write the cooking method.'],
      },
      source,
      'url-microdata',
      warnings,
    );
    return [
      {
        candidate: {
          index,
          title: draft.recipe.title,
          summary: draft.recipe.summary,
          source: 'microdata' as const,
          warnings,
        },
        draft,
      },
    ];
  });
}

function openGraphDraft(
  html: string,
  text: string,
  source: { url: string; name: string },
): CaptureDraft {
  const $ = load(html);
  const title = compactText(
    $('meta[property="og:title" i], meta[name="og:title" i]').first().attr('content') ?? '',
    160,
  );
  const summary = compactText(
    $('meta[property="og:description" i], meta[name="description" i]').first().attr('content') ??
      '',
    800,
  );
  const draft = draftFromText(text, source);
  return {
    ...draft,
    recipe: recipeInputSchema.parse({
      ...draft.recipe,
      ...(title ? { title } : {}),
      ...(summary ? { summary } : {}),
    }),
    provenance: {
      ...draft.provenance,
      extractionMethod: title || summary ? 'url-open-graph' : 'url-text',
      warnings: [
        title || summary
          ? 'No structured Recipe markup was found; title and summary came from Open Graph metadata.'
          : 'No structured Recipe markup was found; this draft uses bounded extracted page text.',
      ],
      extractionNotice:
        'This page-derived draft is not a saved recipe. Review every field before adding it to the shared cookbook.',
    },
  };
}

export async function capturePublicUrl(
  input: string,
  candidateIndex?: number,
  dependencies: { fetchPublicText?: PublicTextFetcher } = {},
): Promise<{ candidates: CaptureCandidate[] } | { draft: CaptureDraft }> {
  const fetched = await (dependencies.fetchPublicText ?? fetchPublicText)(input);
  const source = sourceDetails(fetched.url);
  if (!fetched.html) return { draft: draftFromText(fetched.text, source) };
  const structured = jsonLdCandidates(fetched.html, source);
  const candidates = structured.length ? structured : microdataCandidates(fetched.html, source);
  if (!candidates.length) return { draft: openGraphDraft(fetched.html, fetched.text, source) };
  if (candidateIndex === undefined)
    return { candidates: candidates.map((entry) => entry.candidate) };
  const selected = candidates.find((entry) => entry.candidate.index === candidateIndex);
  if (!selected)
    throw new CaptureCandidateNotFoundError(
      'Choose one of the recipe candidates shown for this page.',
    );
  return { draft: { ...selected.draft, originalText: fetched.text } };
}
