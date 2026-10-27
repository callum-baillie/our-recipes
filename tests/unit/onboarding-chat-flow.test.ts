import { describe, expect, it } from 'vitest';

import {
  acknowledge,
  answerStep,
  applyInterviewTurn,
  buildSteps,
  createInitialState,
  nextStep,
  profileOf,
  reopen,
  remainingTopics,
  sectionStepIds,
  type Answer,
  type ChatState,
} from '@/components/onboarding-chat/flow';

const text = (value: string): Answer => ({ kind: 'text', value });
const choice = (value: string, label = value): Answer => ({ kind: 'choice', value, label });

/** Answers the current step, failing loudly when the script asks something unexpected. */
function say(state: ChatState, expectId: string | RegExp, answer: Answer): ChatState {
  const step = nextStep(state);
  expect(step?.id).toMatch(expectId);
  expect(step!.validate?.(state, answer) ?? null).toBeNull();
  return answerStep(state, step!, answer).state;
}

function identity(state: ChatState): ChatState {
  let next = say(state, 'kitchen.name', text('Fixture kitchen'));
  next = say(next, 'kitchen.icon', { kind: 'icon', value: 'chef-hat' });
  next = say(next, 'kitchen.look', { kind: 'ack', label: 'Looks good' });
  next = say(next, 'p1.name', text('Avery'));
  next = say(next, 'p1.email', text('avery@example.test'));
  next = say(next, 'p1.passphrase', text('synthetic fixture passphrase'));
  next = say(next, 'p1.units', choice('metric'));
  return say(next, 'p1.temperature', choice('C'));
}

describe('onboarding chat script', () => {
  it('walks a person from the kitchen name to review without asking anything twice', () => {
    let state = identity(createInitialState({ mode: 'initial', aiAvailable: false }));
    expect(profileOf(state, 1).profile).toMatchObject({
      displayName: 'Avery',
      units: 'metric',
      temperatureUnit: 'C',
    });
    state = say(state, 'p1.n.start', choice('later'));
    state = say(state, 'p1.g.start', choice('later'));
    state = say(state, 'recipe.choice', choice('example'));
    state = say(state, 'more.1', choice('done'));
    expect(nextStep(state)?.id).toBe('review');
    const asked = buildSteps(state).map((step) => step.id);
    expect(new Set(asked).size).toBe(asked.length);
    expect(state.kitchenName).toBe('Fixture kitchen');
    expect(profileOf(state, 1).nutritionPath).toBe('later');
  });

  it('keeps a typed passphrase out of the transcript', () => {
    const state = identity(createInitialState({ mode: 'initial', aiAvailable: false }));
    const serialized = JSON.stringify(state.messages);
    expect(serialized).not.toContain('synthetic fixture passphrase');
    const echoed = state.messages.find((m) => m.from === 'user' && m.kind === 'text' && m.secret);
    expect(echoed).toMatchObject({ text: '••••••••••', secret: true });
  });

  it('validates sign-in details and rejects a duplicate email across profiles', () => {
    let state = createInitialState({ mode: 'initial', aiAvailable: false });
    state = say(state, 'kitchen.name', text('Fixture'));
    state = say(state, 'kitchen.icon', { kind: 'icon', value: 'chef-hat' });
    state = say(state, 'kitchen.look', { kind: 'ack', label: 'ok' });
    state = say(state, 'p1.name', text('Avery'));
    const email = nextStep(state)!;
    expect(email.validate?.(state, text('not-an-email'))).toBeTruthy();
    state = say(state, 'p1.email', text('avery@example.test'));
    expect(nextStep(state)!.validate?.(state, text('short'))).toMatch(/8 characters/);
  });

  it('asks about extra profiles after the first recipe and returns to review without repeating it', () => {
    let state = identity(createInitialState({ mode: 'initial', aiAvailable: false }));
    state = say(state, 'p1.n.start', choice('later'));
    state = say(state, 'p1.g.start', choice('later'));
    state = say(state, 'recipe.choice', choice('manual'));
    state = say(state, 'more.1', choice('add'));
    expect(state.profiles).toHaveLength(2);
    // The new profile inherits the household's measurement choices instead of asking again.
    expect(profileOf(state, 2).profile).toMatchObject({ units: 'metric', temperatureUnit: 'C' });
    state = say(state, 'p2.name', text('Jon'));
    state = say(state, 'p2.email', text('jon@example.test'));
    expect(nextStep(state)!.validate?.(state, text('avery@example.test'))).toBeNull();
    state = say(state, 'p2.passphrase', text('another synthetic passphrase'));
    state = say(state, 'p2.role', choice('child'));
    expect(profileOf(state, 2).nutrition.profileType).toBe('dependent');
    expect(buildSteps(state).some((s) => s.id === 'p2.type')).toBe(false);
    state = say(state, 'p2.n.start', choice('later'));
    state = say(state, 'p2.g.start', choice('later'));
    state = say(state, 'more.2', choice('done'));
    expect(nextStep(state)?.id).toBe('review');
    expect(buildSteps(state).filter((s) => s.id === 'recipe.choice')).toHaveLength(1);
  });

  it('refuses a duplicate email on a second profile', () => {
    let state = identity(createInitialState({ mode: 'initial', aiAvailable: false }));
    state = say(state, 'p1.n.start', choice('later'));
    state = say(state, 'p1.g.start', choice('later'));
    state = say(state, 'recipe.choice', choice('manual'));
    state = say(state, 'more.1', choice('add'));
    state = say(state, 'p2.name', text('Jon'));
    expect(nextStep(state)!.validate?.(state, text('Avery@Example.test'))).toMatch(
      /different email/,
    );
  });

  it('only asks for role and type in profile mode and never for the kitchen', () => {
    const state = createInitialState({ mode: 'profile', aiAvailable: false });
    const ids = buildSteps(state).map((step) => step.id);
    expect(ids).toContain('p1.role');
    expect(ids).toContain('p1.type');
    expect(ids.some((id) => id.startsWith('kitchen.') || id.startsWith('recipe.'))).toBe(false);
    expect(ids.some((id) => id.startsWith('more.'))).toBe(false);
  });

  describe('nutrition', () => {
    function toNutrition() {
      let state = identity(createInitialState({ mode: 'initial', aiAvailable: false }));
      state = say(state, 'p1.n.start', choice('manual'));
      return state;
    }

    it('collects measurements in canonical units and calculates a pace timeline', () => {
      let state = toNutrition();
      state = say(state, 'p1.n.dob', text('1990-01-01'));
      state = say(state, 'p1.n.ref', choice('female'));
      state = say(state, 'p1.n.height', { kind: 'measure', value: 172.72, label: '5 ft 8 in' });
      state = say(state, 'p1.n.weight', { kind: 'measure', value: 90.7185, label: '200 lb' });
      state = say(state, 'p1.n.activity', choice('light'));
      state = say(state, 'p1.n.life', choice(''));
      state = say(state, 'p1.n.goal', choice('loss'));
      expect(nextStep(state)!.id).toBe('p1.n.target');
      state = say(state, 'p1.n.target', { kind: 'measure', value: 81.6466, label: '180 lb' });
      state = say(state, 'p1.n.pace', choice('moderate'));
      const date = nextStep(state)!;
      expect(date.id).toBe('p1.n.date');
      expect(date.prompt(state).join(' ')).toMatch(/Approximately 19 weeks/);
    });

    it('rejects a loss target above the current weight and a future birthday', () => {
      let state = toNutrition();
      const dob = nextStep(state)!;
      expect(dob.validate?.(state, text('2999-01-01'))).toMatch(/not in the future/);
      state = say(state, 'p1.n.dob', { kind: 'skip' });
      state = say(state, 'p1.n.ref', choice(''));
      state = say(state, 'p1.n.height', { kind: 'skip' });
      state = say(state, 'p1.n.weight', { kind: 'measure', value: 80, label: '80 kg' });
      state = say(state, 'p1.n.activity', choice(''));
      state = say(state, 'p1.n.life', choice(''));
      state = say(state, 'p1.n.goal', choice('loss'));
      const target = nextStep(state)!;
      expect(target.validate?.(state, { kind: 'measure', value: 85, label: '85 kg' })).toMatch(
        /below the current weight/,
      );
    });

    it('skips the weight question once a scale reading supplies it, and never stores the password', () => {
      let state = identity(createInitialState({ mode: 'initial', aiAvailable: false }));
      state = say(state, 'p1.n.start', choice('vesync'));
      state = say(state, 'p1.n.vesync', {
        kind: 'vesync',
        weightKilograms: 82.5,
        measuredAt: '2026-01-02T08:00:00.000Z',
        connectionId: '11111111-1111-4111-8111-111111111111',
        label: 'Imported 181.9 lb from VeSync',
      });
      const ids = buildSteps(state).map((step) => step.id);
      expect(ids).not.toContain('p1.n.weight');
      expect(profileOf(state, 1).nutrition).toMatchObject({
        currentWeightKilograms: 82.5,
        vesyncConnectionId: '11111111-1111-4111-8111-111111111111',
        weightTrackingEnabled: true,
      });
      expect(JSON.stringify(state)).not.toMatch(/password/iu);
    });

    it('turning nutrition into a redo clears just that section', () => {
      let state = toNutrition();
      state = say(state, 'p1.n.dob', { kind: 'skip' });
      const ids = sectionStepIds(state, 'nutrition:1');
      expect(ids[0]).toBe('p1.n.start');
      const reopened = reopen(state, ids);
      expect(nextStep(reopened)!.id).toBe('p1.n.start');
      expect(reopened.done).toContain('p1.name');
      expect(reopened.done).not.toContain('p1.n.dob');
    });
  });

  describe('get-to-know-you', () => {
    function toGoals(aiAvailable: boolean) {
      let state = identity(createInitialState({ mode: 'initial', aiAvailable }));
      state = say(state, 'p1.n.start', choice('later'));
      return say(state, 'p1.g.start', choice('chat'));
    }

    it('asks for AI consent only when the assistant is available, once', () => {
      expect(nextStep(toGoals(false))!.id).toBe('p1.g.focus');
      let state = toGoals(true);
      expect(nextStep(state)!.id).toBe('ai.consent');
      state = say(state, 'ai.consent', choice('yes'));
      expect(state.aiConsent).toBe('yes');
      expect(nextStep(state)!.id).toBe('p1.g.focus');
    });

    it('offers an AI exchange only after consent', () => {
      for (const consent of ['yes', 'no'] as const) {
        let state = toGoals(true);
        state = say(state, 'ai.consent', choice(consent));
        state = say(state, 'p1.g.focus', { kind: 'multi', values: ['cook-more'] });
        const step = nextStep(state)!;
        expect(step.id).toBe('p1.g.motivation');
        const { ask } = answerStep(state, step, text('I want calmer dinners'));
        expect(ask !== null).toBe(consent === 'yes');
      }
    });

    it('lets the assistant skip topics the person already covered and add one follow-up', () => {
      let state = toGoals(true);
      state = say(state, 'ai.consent', choice('yes'));
      state = say(state, 'p1.g.focus', { kind: 'multi', values: [] });
      const step = nextStep(state)!;
      const answered = answerStep(state, step, text('Calmer dinners; I love sweet things'));
      expect(answered.ask).toMatchObject({ topic: 'motivation', profileId: 1 });
      expect(remainingTopics(answered.state, 1)).toContain('taste');
      const next = applyInterviewTurn(
        answered.state,
        answered.ask!,
        {
          reply: 'Calm dinners sound lovely.',
          followUp: { question: 'Which weeknights are hardest?', suggestions: ['Mondays'] },
          noted: [
            { topic: 'taste', value: 'Has a sweet tooth' },
            { topic: 'motivation', value: 'ignored: it is the topic just asked' },
            { topic: 'taste', value: 'duplicate is ignored by the service' },
          ],
        },
        step.id,
      );
      expect(profileOf(next, 1).covered).toEqual(['taste']);
      expect(remainingTopics(next, 1)).not.toContain('taste');
      expect(nextStep(next)!.id).toBe(`${step.id}.more`);
      const follow = say(next, `${step.id}.more`, text('Mondays and Thursdays'));
      expect(profileOf(follow, 1).profile.goalContext?.motivation).toBe(
        'Calmer dinners; I love sweet things Mondays and Thursdays',
      );
      expect(profileOf(follow, 1).profile.goalContext?.kitchenInterview?.taste).toBe(
        'Has a sweet tooth',
      );
    });

    it('stores kitchen interview answers verbatim and acknowledges without the assistant', () => {
      let state = toGoals(false);
      state = say(state, 'p1.g.focus', { kind: 'multi', values: ['cook-more', 'save-money'] });
      state = say(state, 'p1.g.motivation', { kind: 'skip' });
      state = say(state, 'p1.g.challenges', { kind: 'skip' });
      state = say(state, 'p1.g.success', { kind: 'skip' });
      state = say(state, 'p1.g.iv.taste', text('A little of both'));
      state = acknowledge(state);
      expect(state.messages.at(-1)).toMatchObject({ from: 'bot', kind: 'text' });
      expect(profileOf(state, 1).profile.goalContext).toMatchObject({
        focusAreas: ['cook-more', 'save-money'],
        kitchenInterview: { taste: 'A little of both' },
      });
    });
  });
});
