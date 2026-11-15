import { describe, expect, it } from 'vitest';
import { describeChatTool, toolFinishEvent, toolStartEvent } from '@/lib/domain/ai-chat-tools';

describe('chat tool descriptions', () => {
  it('describes known tools in plain language without echoing structured arguments', () => {
    const start = toolStartEvent('c1', 'read_kitchen_context', {
      listId: '00000000-0000-4000-8000-000000000001',
    });
    expect(start).toMatchObject({
      type: 'tool',
      id: 'c1',
      kind: 'read',
      state: 'running',
      title: 'Looking through your pantry and equipment',
    });
    expect(JSON.stringify(start)).not.toContain('00000000');
  });

  it('quotes only a short, single-line recipe search phrase', () => {
    expect(describeChatTool('search_recipes', { query: ' lentil\n stew ' }).running).toBe(
      'Searching your recipes for “lentil stew”',
    );
    const long = describeChatTool('search_recipes', { query: 'x'.repeat(200) }).done;
    expect(long.length).toBeLessThan(80);
    expect(long).toContain('…');
    expect(describeChatTool('search_recipes', {}).done).toBe('Searched your recipes');
  });

  it('falls back by name prefix for tools without a dedicated description', () => {
    expect(describeChatTool('read_something_new', {}).kind).toBe('read');
    expect(describeChatTool('prepare_something_new', {}).kind).toBe('prepare');
  });

  it('reports finished and failed calls with a duration', () => {
    const ok = toolFinishEvent(
      'c2',
      'generate_meal_plan',
      {},
      { ok: true, startedAt: Date.now() - 50 },
    );
    expect(ok).toMatchObject({ state: 'success', kind: 'draft', title: 'Drafted your meal plan' });
    expect(ok.durationMs).toBeGreaterThanOrEqual(50);
    const failed = toolFinishEvent(
      'c3',
      'generate_meal_plan',
      {},
      { ok: false, startedAt: Date.now() },
    );
    expect(failed.state).toBe('error');
    expect(failed.title).toMatch(/^Could not finish/u);
  });
});
