import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AssistantMessage } from '@/components/assistant-message';
import { safeChatHref } from '../../shared/mobile-domain/chat-rendering';
describe('safe assistant message presentation', () => {
  it('renders code as inert text and never loads imported HTML or images', () => {
    const html = renderToStaticMarkup(
      createElement(AssistantMessage, {
        content:
          '```html\n<img src="https://external.test/private" onerror="alert(1)">\n```\n\n<script>evil()</script>',
      }),
    );
    expect(html).toContain('<pre><code>');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
  });
  it('uses semantic lists, emphasis, inline code and deliberate safe links', () => {
    const html = renderToStaticMarkup(
      createElement(AssistantMessage, {
        content:
          '3. **Check** the stock\n4. Review `quantity`\n\n[Open diary](/nutrition?view=diary) and [source](https://example.test/recipe)\n\n[Unsafe](javascript:alert)',
      }),
    );
    expect(html).toContain('<ol start="3">');
    expect(html).toContain('<strong>Check</strong>');
    expect(html).toContain('<code>quantity</code>');
    expect(html).toContain('href="/nutrition?view=diary"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain('href="javascript:');
  });
  it('rejects executable schemes, protocol-relative/credential URLs and unsafe characters', () => {
    for (const href of [
      'javascript:evil()',
      'data:text/html,hi',
      '//external.test',
      '/\\external.test',
      'https://user:secret@example.test',
      'https://example.test/\nprivate',
    ])
      expect(safeChatHref(href)).toBeNull();
    expect(safeChatHref('/recipes/fixture')).toBe('/recipes/fixture');
  });
});
