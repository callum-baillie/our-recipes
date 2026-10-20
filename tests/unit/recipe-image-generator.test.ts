// @vitest-environment jsdom
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { RecipeImageGenerator } from '@/components/recipe-image-generator';
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('next/image', () => ({
  default: (input: Record<string, unknown>) => {
    const props = { ...input };
    delete props.unoptimized;
    return createElement('img', props);
  },
}));
let host: HTMLDivElement;
let root: Root;
const recipeId = 'a7c24f93-dd9a-4737-aa2b-89ded1c9d303';
const policy = {
  enabled: true,
  model: 'gpt-image-2',
  quality: 'low' as const,
  size: '1024x1024' as const,
  allowOverrides: true,
};
const ready = {
  id: '9d807dd4-621b-4265-8420-c9f2cbaf1583',
  recipeId,
  sourceRevision: 1,
  status: 'ready',
  altText: 'AI-generated soup',
  width: 8,
  height: 8,
  model: 'gpt-image-2',
  quality: 'low',
  size: '1024x1024',
  promptVersion: 'fixture',
  imageId: null,
  createdAt: '2026-10-19T00:00:00Z',
};
const button = (name: string) =>
  Array.from(host.querySelectorAll('button')).find((node) => node.textContent === name)!;
async function click(name: string) {
  await act(async () => {
    button(name).click();
  });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  sessionStorage.clear();
  refresh.mockClear();
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    callback();
    return 1;
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () =>
    root.render(
      createElement(RecipeImageGenerator, {
        recipeId,
        revision: 1,
        profileId: 'owner-profile',
        policy,
      }),
    ),
  );
}
describe('recipe image preview UI', () => {
  it('requires review before accepting, freezes submitted controls and keeps existing outcome distinct', async () => {
    let release!: (value: Response) => void;
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValueOnce(
        Response.json({ candidate: { ...ready, status: 'accepted', imageId: 'saved-image' } }),
      );
    vi.stubGlobal('fetch', fetch);
    await render();
    await click('Generate preview with OpenAI');
    expect(host.textContent).toContain('Preparing a preview');
    expect(refresh).not.toHaveBeenCalled();
    expect(Array.from(host.querySelectorAll('select')).every((node) => node.disabled)).toBe(true);
    const sent = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(sent).toMatchObject({
      preview: true,
      expectedRevision: 1,
      quality: 'low',
      size: '1024x1024',
    });
    await act(async () => {
      release(Response.json({ candidate: { ...ready, id: sent.operationId } }));
    });
    expect(host.textContent).toContain('This photo has not been added');
    expect(refresh).not.toHaveBeenCalled();
    await click('Add reviewed photo');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('other recipe photos are still saved');
  });
  it('retains uncertain intent across remount and retries the exact operation rather than inventing another', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Network lost'))
      .mockResolvedValueOnce(Response.json({ candidate: ready }));
    vi.stubGlobal('fetch', fetch);
    await render();
    await click('Generate preview with OpenAI');
    const original = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(button('Retry the same request')).toBeTruthy();
    expect(button('Generate preview with OpenAI')).toBeUndefined();
    await click('Retry the same request');
    expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual(original);
    expect(fetch.mock.calls[1]![0]).toContain('/images/generate');
    await act(async () => root.unmount());
    root = createRoot(host);
    await render();
    expect(host.textContent).toContain('earlier image request');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('recovers a definite pre-generation policy rejection without trapping the draft', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: { message: 'Sharing is disabled' } }, { status: 403 }),
        ),
    );
    await render();
    await click('Generate preview with OpenAI');
    expect(host.textContent).toContain('Sharing is disabled');
    expect(button('Generate preview with OpenAI').disabled).toBe(false);
    expect(sessionStorage.length).toBe(0);
  });
});
