import { describe, expect, it } from 'vitest';

import {
  buildInterviewRequest,
  onboardingInterviewRequestSchema,
  onboardingInterviewTurnSchema,
  redactSensitiveText,
  sanitizeInterviewTurn,
} from '@/lib/domain/onboarding-interview';

const base = {
  topic: 'taste' as const,
  question: 'Do you lean sweet, savory, or a little of both?',
  answer: 'A little of both',
  history: [],
  remaining: ['snacks' as const, 'desserts' as const],
  focusAreas: ['cook-more'],
  dietary: { preferences: ['Vegetarian'], allergies: ['Peanuts'], exclusions: [] },
  followUpsUsed: 0,
};

describe('onboarding interview privacy', () => {
  it('removes known secrets, emails, numbers and "my password is" lines from free text', () => {
    const secrets = ['synthetic fixture passphrase', 'avery@example.test'];
    const text = redactSensitiveText(
      'Email me at avery@example.test, my password is hunter22, call 555 123 4567 or use synthetic fixture passphrase. I love lentils.',
      secrets,
    );
    expect(text).not.toMatch(/avery@example|hunter22|555|synthetic fixture/iu);
    expect(text).toContain('I love lentils.');
  });

  it('keeps ordinary food talk and short numbers intact', () => {
    const text = 'Dinner 3-4 times a week, about 30 minutes, pass on spicy food, 2000 calories';
    expect(redactSensitiveText(text)).toBe(text);
  });

  it('builds a request that carries only the allow-listed fields', () => {
    const request = buildInterviewRequest(
      {
        ...base,
        answer: 'Sweet, and my passphrase is synthetic fixture passphrase',
      },
      ['synthetic fixture passphrase'],
    );
    expect(Object.keys(request).sort()).toEqual(
      [
        'answer',
        'dietary',
        'focusAreas',
        'followUpsUsed',
        'history',
        'question',
        'remaining',
        'topic',
      ].sort(),
    );
    expect(JSON.stringify(request)).not.toContain('synthetic fixture passphrase');
  });

  it('rejects any extra field a modified client might add', () => {
    for (const extra of [
      { email: 'avery@example.test' },
      { passphrase: 'x' },
      { measurements: { weight: 80 } },
      { dateOfBirth: '1990-01-01' },
    ]) {
      expect(onboardingInterviewRequestSchema.safeParse({ ...base, ...extra }).success).toBe(false);
    }
    expect(
      onboardingInterviewRequestSchema.safeParse({
        ...base,
        dietary: { ...base.dietary, weightKilograms: 80 },
      }).success,
    ).toBe(false);
  });

  it('only lets the assistant note topics that are still open and not the one just asked', () => {
    const turn = onboardingInterviewTurnSchema.parse({
      reply: 'Lovely.',
      followUp: { question: 'More?', suggestions: [] },
      noted: [
        { topic: 'taste', value: 'ignored: current topic' },
        { topic: 'snacks', value: 'Fruit' },
        { topic: 'snacks', value: 'duplicate' },
        { topic: 'avoid', value: 'ignored: not remaining' },
      ],
    });
    const cleaned = sanitizeInterviewTurn(turn, {
      topic: 'taste',
      remaining: ['snacks', 'desserts'],
      followUpsUsed: 0,
    });
    expect(cleaned.noted).toEqual([{ topic: 'snacks', value: 'Fruit' }]);
    expect(cleaned.followUp).not.toBeNull();
    expect(
      sanitizeInterviewTurn(turn, { topic: 'taste', remaining: [], followUpsUsed: 2 }).followUp,
    ).toBeNull();
  });
});
