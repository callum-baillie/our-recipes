import { describe, expect, it } from 'vitest';
import { chatQuestion, questionContent, nextDayRange } from '@/lib/domain/ai-chat-prompts';
describe('chat clarification and date context', () => {
  it.each([
    ['2026-11-15', 11, 22, { start: '2026-12-11', end: '2026-12-22' }],
    ['2026-12-23', 11, 22, { start: '2027-01-11', end: '2027-01-22' }],
    ['2026-11-11', 11, 22, { start: '2026-11-11', end: '2026-11-22' }],
    ['2026-11-15', 28, 2, { start: '2026-11-28', end: '2026-12-02' }],
    ['2026-02-01', 31, 31, { start: '2026-03-31', end: '2026-03-31' }],
  ])('resolves %s %s–%s', (today, start, end, expected) =>
    expect(nextDayRange(start, end, today)).toEqual(expected),
  );
  it('rejects impossible days', () => expect(nextDayRange(32, 20, '2026-11-15')).toBeNull());
  it('preserves validated suggested answers on history reload', () => {
    const question = { question: 'Who is eating?', answers: ['Just me', 'Everyone'] };
    expect(chatQuestion(questionContent(question))).toEqual({ text: question.question, question });
    expect(chatQuestion('A normal reply').question).toBeNull();
    expect(chatQuestion('Bad\n<!--bord-question:{}-->').question).toBeNull();
  });
});
