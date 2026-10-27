/**
 * The onboarding conversation as plain data. Everything here is pure: the chat component
 * renders `ChatState`, asks `nextStep` what to say, and applies the person's answer with
 * `answerStep`. Keeping the script free of React makes the branching (nutrition paths,
 * extra profiles, AI follow-ups) testable and keeps secrets out of anything but state.
 */
import type { BrandIconId } from '@/lib/appearance';
import { brandIconLabel, parseBrandIcon } from '@/lib/appearance';
import { DEFAULT_KITCHEN_NAME } from '@/lib/brand';
import { profileCredentialsSchema, type ProfileCredentialsInput } from '@/lib/domain/auth';
import {
  kitchenInterviewMaxLength,
  kitchenInterviewQuestions,
  kitchenInterviewSuggestions,
  type KitchenInterviewTopic,
} from '@/lib/domain/kitchen-interview-questions';
import {
  nutritionOnboardingGuidance,
  onboardingPaces,
  onboardingTimeline,
} from '@/lib/domain/nutrition-onboarding-guidance';
import { type AppRole } from '@/lib/domain/permissions';
import {
  defaultProfileGoalContext,
  profileGoalFocusOptions,
  type ProfileGoalContext,
  type ProfileGoalFocus,
} from '@/lib/domain/profile-goals';
import {
  defaultOnboardingNutrition,
  defaultProfileInput,
  onboardingNutritionSchema,
  type FirstRecipeChoice,
  type OnboardingNutritionInput,
  type ProfileInput,
} from '@/lib/domain/setup';
import type { InterviewTopic } from '@/lib/domain/onboarding-interview';
import {
  type OnboardingInterviewTurn,
  scriptedAcknowledgement,
} from '@/lib/domain/onboarding-interview';

export const profileColors = ['#A85032', '#5B713E', '#D1863A', '#466F75', '#76558C', '#9B5C70'];
export const maximumSetupProfiles = 12;
const kilogramsPerPound = 1 / 2.2046226218;

export type ChatMode = 'initial' | 'profile';

export type ChatProfile = {
  localId: number;
  role: AppRole;
  profile: ProfileInput;
  credentials: ProfileCredentialsInput;
  nutrition: OnboardingNutritionInput;
  nutritionPath: 'unset' | 'vesync' | 'manual' | 'later';
  goalsPath: 'unset' | 'chat' | 'later';
  /** Topics the assistant found already answered in the person's own words. */
  covered: InterviewTopic[];
  followUps: Partial<Record<InterviewTopic, number>>;
  qa: Array<{ topic: InterviewTopic; question: string; answer: string }>;
};

export type ChatMessage =
  | { id: number; from: 'bot'; kind: 'text'; text: string }
  | { id: number; from: 'bot'; kind: 'review' }
  | { id: number; from: 'user'; kind: 'text'; text: string; secret?: boolean };

export type DynamicStep = {
  id: string;
  afterStepId: string;
  profileId: number;
  topic: InterviewTopic;
  question: string;
  suggestions: string[];
};

export type ChatState = {
  mode: ChatMode;
  aiAvailable: boolean;
  aiConsent: 'unknown' | 'yes' | 'no';
  kitchenName: string;
  brandIcon: BrandIconId;
  firstRecipeChoice: FirstRecipeChoice;
  importMode: 'url' | 'text' | 'json';
  profiles: ChatProfile[];
  nextProfileId: number;
  done: string[];
  dynamic: DynamicStep[];
  messages: ChatMessage[];
  nextMessageId: number;
  /** Step whose prompt is already in the transcript. */
  presented: string | null;
  /** Furthest progress reached, so the bar never moves backwards as branches open. */
  progress: number;
};

export type ChoiceOption = {
  value: string;
  label: string;
  description?: string;
  /** Optional lucide icon name resolved by the renderer. */
  icon?: string;
};

export type InputSpec =
  | {
      kind: 'text';
      name: string;
      label: string;
      inputType: 'text' | 'email' | 'password' | 'date' | 'textarea';
      placeholder?: string;
      autoComplete?: string;
      maxLength?: number;
      minLength?: number;
      optional?: boolean;
      skipLabel?: string;
      initial?: string;
      hint?: string;
      suggestions?: string[];
    }
  | { kind: 'choice'; label: string; options: ChoiceOption[]; layout: 'chips' | 'cards' }
  | {
      kind: 'multi';
      label: string;
      options: ChoiceOption[];
      max?: number;
      customLabel?: string;
      doneLabel: string;
      emptyLabel: string;
      initial: string[];
    }
  | {
      kind: 'measure';
      measure: 'height' | 'weight';
      label: string;
      units: 'metric' | 'imperial';
      skipLabel?: string;
      suggestions?: Array<{ label: string; kilograms: number }>;
    }
  | { kind: 'widget'; widget: 'icon' | 'look' | 'vesync' }
  | { kind: 'review' };

export type Answer =
  | { kind: 'text'; value: string }
  | { kind: 'choice'; value: string; label: string }
  | { kind: 'multi'; values: string[] }
  | { kind: 'measure'; value: number; label: string }
  | { kind: 'skip' }
  | { kind: 'icon'; value: BrandIconId }
  | { kind: 'ack'; label: string }
  | {
      kind: 'vesync';
      weightKilograms: number;
      bodyFatPercent?: number;
      measuredAt: string;
      connectionId: string;
      label: string;
    };

export type AiAsk = {
  profileId: number;
  topic: InterviewTopic;
  question: string;
  answer: string;
};

export type Step = {
  id: string;
  profileId?: number;
  topic?: InterviewTopic;
  prompt: (state: ChatState) => string[];
  input: (state: ChatState) => InputSpec;
  validate?: (state: ChatState, answer: Answer) => string | null;
  apply: (state: ChatState, answer: Answer) => ChatState;
  /** Extra things the assistant says once the answer is in, before the next question. */
  after?: (state: ChatState, answer: Answer) => string[];
  echo?: (state: ChatState, answer: Answer) => { text: string; secret?: boolean };
  /** A free-text answer worth sending to the assistant, when the person agreed to that. */
  ask?: (state: ChatState, answer: Answer) => AiAsk | null;
};

/* ------------------------------------------------------------------ */
/* State helpers                                                        */
/* ------------------------------------------------------------------ */

export function createProfile(
  localId: number,
  regional: { locale: string; timezone: string },
  colorIndex: number,
  defaults?: Pick<ProfileInput, 'units' | 'temperatureUnit'>,
): ChatProfile {
  return {
    localId,
    role: 'parent',
    profile: {
      ...defaultProfileInput,
      ...regional,
      ...defaults,
      color: profileColors[colorIndex % profileColors.length]!,
      goalContext: {
        ...defaultProfileGoalContext,
        focusAreas: [...defaultProfileGoalContext.focusAreas],
      },
    },
    credentials: { email: '', passphrase: '' },
    nutrition: { ...defaultOnboardingNutrition },
    nutritionPath: 'unset',
    goalsPath: 'unset',
    covered: [],
    followUps: {},
    qa: [],
  };
}

export function createInitialState(options: {
  mode: ChatMode;
  aiAvailable: boolean;
  regional?: { locale: string; timezone: string };
}): ChatState {
  const regional = options.regional ?? {
    locale: defaultProfileInput.locale,
    timezone: defaultProfileInput.timezone,
  };
  return {
    mode: options.mode,
    aiAvailable: options.aiAvailable,
    aiConsent: 'unknown',
    kitchenName: DEFAULT_KITCHEN_NAME,
    brandIcon: parseBrandIcon(null),
    firstRecipeChoice: 'example',
    importMode: 'url',
    profiles: [createProfile(1, regional, 0)],
    nextProfileId: 2,
    done: [],
    dynamic: [],
    messages: [],
    nextMessageId: 1,
    presented: null,
    progress: 0,
  };
}

export function pushMessage(
  state: ChatState,
  message: Omit<ChatMessage, 'id'> & Record<string, unknown>,
): ChatState {
  return {
    ...state,
    messages: [...state.messages, { ...message, id: state.nextMessageId } as ChatMessage],
    nextMessageId: state.nextMessageId + 1,
  };
}

export function profileOf(state: ChatState, id: number): ChatProfile {
  return state.profiles.find((item) => item.localId === id) ?? state.profiles[0]!;
}

export function updateProfile(
  state: ChatState,
  id: number,
  change: (profile: ChatProfile) => ChatProfile,
): ChatState {
  return {
    ...state,
    profiles: state.profiles.map((item) => (item.localId === id ? change(item) : item)),
  };
}

function withNutrition(
  state: ChatState,
  id: number,
  patch: Partial<OnboardingNutritionInput>,
): ChatState {
  return updateProfile(state, id, (item) => ({
    ...item,
    nutrition: { ...item.nutrition, ...patch },
  }));
}

const goalTopics = ['motivation', 'challenges', 'successVision'] as const;
type GoalTopic = (typeof goalTopics)[number];
const isGoalTopic = (topic: InterviewTopic): topic is GoalTopic =>
  (goalTopics as readonly string[]).includes(topic);

function topicMaxLength(topic: InterviewTopic): number {
  return isGoalTopic(topic) ? 800 : kitchenInterviewMaxLength(topic as KitchenInterviewTopic);
}

export function topicValue(item: ChatProfile, topic: InterviewTopic): string {
  const context = item.profile.goalContext ?? defaultProfileGoalContext;
  return isGoalTopic(topic)
    ? context[topic]
    : (context.kitchenInterview?.[topic as KitchenInterviewTopic] ?? '');
}

function setTopicValue(item: ChatProfile, topic: InterviewTopic, value: string): ChatProfile {
  const context: ProfileGoalContext = item.profile.goalContext ?? defaultProfileGoalContext;
  const text = value.trim().slice(0, topicMaxLength(topic));
  const goalContext: ProfileGoalContext = isGoalTopic(topic)
    ? { ...context, [topic]: text }
    : {
        ...context,
        kitchenInterview: {
          taste: '',
          snacks: '',
          desserts: '',
          routine: '',
          favorites: '',
          avoid: '',
          ...context.kitchenInterview,
          [topic]: text,
        },
      };
  return { ...item, profile: { ...item.profile, goalContext } };
}

function appendQa(item: ChatProfile, topic: InterviewTopic, question: string, answer: string) {
  const existing = item.qa.find((entry) => entry.topic === topic);
  return existing
    ? item.qa.map((entry) =>
        entry.topic === topic
          ? { ...entry, answer: `${entry.answer} ${answer}`.slice(0, 800) }
          : entry,
      )
    : [...item.qa, { topic, question, answer: answer.slice(0, 800) }];
}

function recordTopicAnswer(
  state: ChatState,
  id: number,
  topic: InterviewTopic,
  question: string,
  answer: string,
  mode: 'set' | 'append',
): ChatState {
  return updateProfile(state, id, (item) => {
    const previous = topicValue(item, topic);
    const next = mode === 'append' && previous ? `${previous} ${answer}` : answer;
    return { ...setTopicValue(item, topic, next), qa: appendQa(item, topic, question, answer) };
  });
}

export function applyInterviewTurn(
  state: ChatState,
  ask: AiAsk,
  turn: OnboardingInterviewTurn,
  parentStepId: string,
): ChatState {
  let next = pushMessage(state, { from: 'bot', kind: 'text', text: turn.reply });
  const open = remainingTopics(next, ask.profileId);
  for (const noted of turn.noted) {
    // Only unasked topics, never the one just answered, and never over something already said.
    if (noted.topic === ask.topic || !open.includes(noted.topic)) continue;
    if (topicValue(profileOf(next, ask.profileId), noted.topic).trim()) continue;
    next = updateProfile(next, ask.profileId, (profile) => ({
      ...setTopicValue(profile, noted.topic, noted.value),
      covered: [...new Set([...profile.covered, noted.topic])],
    }));
  }
  if (turn.followUp) {
    next = updateProfile(next, ask.profileId, (profile) => ({
      ...profile,
      followUps: { ...profile.followUps, [ask.topic]: (profile.followUps[ask.topic] ?? 0) + 1 },
    }));
    next = {
      ...next,
      dynamic: [
        ...next.dynamic,
        {
          id: `${parentStepId}.more`,
          afterStepId: parentStepId,
          profileId: ask.profileId,
          topic: ask.topic,
          question: turn.followUp.question,
          suggestions: turn.followUp.suggestions,
        },
      ],
    };
  }
  return next;
}

export function acknowledge(state: ChatState): ChatState {
  return pushMessage(state, {
    from: 'bot',
    kind: 'text',
    text: scriptedAcknowledgement(state.messages.length),
  });
}

/* ------------------------------------------------------------------ */
/* Formatting                                                           */
/* ------------------------------------------------------------------ */

export function formatWeight(kilograms: number, units: 'metric' | 'imperial'): string {
  return units === 'imperial'
    ? `${(kilograms / kilogramsPerPound).toLocaleString('en-US', { maximumFractionDigits: 1 })} lb`
    : `${kilograms.toLocaleString('en-US', { maximumFractionDigits: 1 })} kg`;
}

function firstName(item: ChatProfile): string {
  return item.profile.displayName.trim().split(/\s+/u)[0] || 'there';
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function issueFor(nutrition: OnboardingNutritionInput, paths: string[]): string | null {
  const parsed = onboardingNutritionSchema.safeParse(nutrition);
  if (parsed.success) return null;
  return (
    parsed.error.issues.find((issue) => paths.includes(String(issue.path[0])))?.message ?? null
  );
}

function guidanceFor(item: ChatProfile) {
  return nutritionOnboardingGuidance(item.nutrition, today());
}

function canSuggestPace(item: ChatProfile): boolean {
  const guidance = guidanceFor(item);
  const value = item.nutrition;
  return (
    guidance.bmi !== null &&
    (value.nutritionGoalType !== 'loss' ||
      (guidance.canSuggestLoss &&
        (value.targetWeightKilograms === null ||
          value.targetWeightKilograms >= guidance.range!.min)))
  );
}

function timelineFor(item: ChatProfile) {
  if (!canSuggestPace(item)) return null;
  const value = item.nutrition;
  return onboardingTimeline(
    value.currentWeightKilograms,
    value.targetWeightKilograms,
    value.weightGoalPace,
    value.nutritionGoalType,
    today(),
  );
}

const textAnswer = (answer: Answer): string => (answer.kind === 'text' ? answer.value.trim() : '');
const choiceAnswer = (answer: Answer): string => (answer.kind === 'choice' ? answer.value : '');

const activityChoices: ChoiceOption[] = [
  {
    value: 'sedentary',
    label: 'Mostly seated',
    description: 'Mostly sitting, with little exercise.',
  },
  {
    value: 'light',
    label: 'Lightly active',
    description: 'Some walking or light exercise, about 1–3 days a week.',
  },
  {
    value: 'moderate',
    label: 'Moderately active',
    description: 'Regular movement and exercise, about 3–5 days a week.',
  },
  {
    value: 'active',
    label: 'Very active',
    description: 'A physical job or hard exercise on most days.',
  },
  {
    value: 'very_active',
    label: 'Highly active',
    description: 'A very physical job combined with demanding training.',
  },
];

const goalChoices: ChoiceOption[] = [
  {
    value: 'none',
    label: 'Understand my nutrition',
    description: 'Track food without a weight goal.',
  },
  { value: 'maintain', label: 'Maintain my weight', description: 'Focus on a consistent routine.' },
  {
    value: 'loss',
    label: 'Lose weight',
    description: 'Choose a measured pace and a first milestone.',
  },
  { value: 'gain', label: 'Gain weight', description: 'Build towards a gradual weight gain.' },
  {
    value: 'custom',
    label: 'Use my own plan',
    description: 'Set detailed targets later in settings.',
  },
];

export const firstRecipeChoices: Array<ChoiceOption & { value: FirstRecipeChoice }> = [
  {
    value: 'example',
    label: 'Use Example recipe',
    description: 'Start with our complete Traditional Scottish Stovies recipe.',
    icon: 'book',
  },
  {
    value: 'ai',
    label: 'AI generate',
    description: 'Describe what you want and review an AI-generated recipe before saving.',
    icon: 'wand',
  },
  {
    value: 'import',
    label: 'Import (From URL or Paste/JSON)',
    description: 'Bring in a recipe you already trust from another source.',
    icon: 'import',
  },
  {
    value: 'manual',
    label: 'Manual',
    description: 'Build your first recipe from a blank, structured recipe form.',
    icon: 'pencil',
  },
];

const dietOptions = (values: string[]): ChoiceOption[] =>
  values.map((value) => ({ value, label: value }));

/* ------------------------------------------------------------------ */
/* Steps                                                                */
/* ------------------------------------------------------------------ */

const NUTRITION = (id: number) => `p${id}.n.`;
const GOALS = (id: number) => `p${id}.g.`;

function profileSteps(state: ChatState, index: number): Step[] {
  const item = state.profiles[index]!;
  const id = item.localId;
  const initialFirst = state.mode === 'initial' && index === 0;
  const steps: Step[] = [];
  const name = () => firstName(profileOf(state, id));

  steps.push({
    id: `p${id}.name`,
    profileId: id,
    prompt: () =>
      state.mode === 'profile'
        ? ['Who’s joining the kitchen? What should I call them?']
        : initialFirst
          ? ['Now your profile. What should I call you?']
          : ['Who else cooks here? What’s their name?'],
    input: () => ({
      kind: 'text',
      name: 'displayName',
      label: 'Display name',
      inputType: 'text',
      autoComplete: initialFirst ? 'name' : 'off',
      maxLength: 80,
      placeholder: 'Your name',
      hint: 'Shown in the profile switcher and household activity.',
    }),
    validate: (_s, answer) => (textAnswer(answer) ? null : 'Add a display name to continue.'),
    apply: (s, answer) =>
      updateProfile(s, id, (p) => ({
        ...p,
        profile: { ...p.profile, displayName: textAnswer(answer).slice(0, 80) },
      })),
  });

  steps.push({
    id: `p${id}.email`,
    profileId: id,
    prompt: () => [
      initialFirst
        ? `Lovely to meet you, ${name()}. What email will you sign in with?`
        : `What email will ${name()} sign in with?`,
    ],
    input: () => ({
      kind: 'text',
      name: 'email',
      label: 'Email',
      inputType: 'email',
      autoComplete: initialFirst ? 'email' : 'off',
      placeholder: 'name@example.com',
      hint: 'Used for full sign-in and account recovery. It is never sent to the assistant.',
    }),
    validate: (s, answer) => {
      const parsed = profileCredentialsSchema.shape.email.safeParse(textAnswer(answer));
      if (!parsed.success) return parsed.error.issues[0]?.message ?? 'Enter a valid email address.';
      const clash = s.profiles.some(
        (other) =>
          other.localId !== id &&
          other.credentials.email.trim().toLocaleLowerCase('en-US') === parsed.data,
      );
      return clash ? 'Every profile needs a different email address.' : null;
    },
    apply: (s, answer) =>
      updateProfile(s, id, (p) => ({
        ...p,
        credentials: { ...p.credentials, email: textAnswer(answer) },
      })),
  });

  steps.push({
    id: `p${id}.passphrase`,
    profileId: id,
    prompt: () => [
      initialFirst
        ? 'Now choose a passphrase of at least 8 characters. It protects sign-in; I won’t show it again, and it never goes to the assistant.'
        : `Set a passphrase for ${name()} (at least 8 characters).`,
    ],
    input: () => ({
      kind: 'text',
      name: 'passphrase',
      label: 'Passphrase',
      inputType: 'password',
      autoComplete: 'new-password',
      minLength: 8,
      maxLength: 128,
      placeholder: 'At least 8 characters',
    }),
    validate: (_s, answer) => {
      const parsed = profileCredentialsSchema.shape.passphrase.safeParse(
        answer.kind === 'text' ? answer.value : '',
      );
      return parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Check the passphrase.');
    },
    apply: (s, answer) =>
      updateProfile(s, id, (p) => ({
        ...p,
        credentials: { ...p.credentials, passphrase: answer.kind === 'text' ? answer.value : '' },
      })),
    echo: () => ({ text: '••••••••••', secret: true }),
  });

  if (!initialFirst) {
    steps.push({
      id: `p${id}.role`,
      profileId: id,
      prompt: () => [`What kind of access should ${name()} have?`],
      input: () => ({
        kind: 'choice',
        label: 'Access role',
        layout: 'cards',
        options: [
          {
            value: 'admin',
            label: 'Admin',
            description: 'Full access, including profiles, settings, backups, and API keys.',
          },
          {
            value: 'parent',
            label: 'Parent',
            description: 'Can manage shared recipes, plans, lists, collections, and pantry items.',
          },
          {
            value: 'child',
            label: 'Child',
            description: 'Can view shared content and manage only their own personal entries.',
          },
        ],
      }),
      apply: (s, answer) => {
        const role = choiceAnswer(answer) as AppRole;
        return updateProfile(s, id, (p) => ({
          ...p,
          role,
          nutrition: role === 'child' ? { ...p.nutrition, profileType: 'dependent' } : p.nutrition,
        }));
      },
      after: () => [
        'Roles control permissions. A password can switch to an equal or lower role; moving up needs a full sign-in.',
      ],
    });
    if (item.role !== 'child') {
      steps.push({
        id: `p${id}.type`,
        profileId: id,
        prompt: () => [
          `Is ${name()} an adult, or a dependent — someone whose meals and nutrition are managed with support?`,
        ],
        input: () => ({
          kind: 'choice',
          label: 'Profile type',
          layout: 'cards',
          options: [
            {
              value: 'adult',
              label: 'Adult',
              description:
                'A personal profile for regular planning, recipe history, and Nutrition.',
            },
            {
              value: 'dependent',
              label: 'Dependent',
              description: 'Intended for supervised use; it is not a security lock.',
            },
          ],
        }),
        apply: (s, answer) =>
          withNutrition(s, id, { profileType: choiceAnswer(answer) as 'adult' | 'dependent' }),
      });
    }
  }

  if (index === 0) {
    steps.push({
      id: `p${id}.units`,
      profileId: id,
      prompt: () => ['Which measurements do you cook with?'],
      input: () => ({
        kind: 'choice',
        label: 'Units',
        layout: 'chips',
        options: [
          { value: 'imperial', label: 'US customary' },
          { value: 'metric', label: 'Metric' },
        ],
      }),
      apply: (s, answer) => {
        const units = choiceAnswer(answer) as ProfileInput['units'];
        return updateProfile(s, id, (p) => ({
          ...p,
          profile: { ...p.profile, units, temperatureUnit: units === 'metric' ? 'C' : 'F' },
        }));
      },
    });
    steps.push({
      id: `p${id}.temperature`,
      profileId: id,
      prompt: () => ['And temperatures?'],
      input: (s) => {
        const metric = profileOf(s, id).profile.units === 'metric';
        return {
          kind: 'choice',
          label: 'Temperature',
          layout: 'chips',
          options: metric
            ? [
                { value: 'C', label: 'Celsius' },
                { value: 'F', label: 'Fahrenheit' },
              ]
            : [
                { value: 'F', label: 'Fahrenheit' },
                { value: 'C', label: 'Celsius' },
              ],
        };
      },
      apply: (s, answer) =>
        updateProfile(s, id, (p) => ({
          ...p,
          profile: { ...p.profile, temperatureUnit: choiceAnswer(answer) as 'C' | 'F' },
        })),
    });
  }

  steps.push(...nutritionSteps(state, item));
  steps.push(...goalSteps(state, item, index));
  return steps;
}

function nutritionSteps(state: ChatState, item: ChatProfile): Step[] {
  const id = item.localId;
  const units = item.profile.units;
  const path = item.nutritionPath;
  const value = item.nutrition;
  const name = firstName(item);
  const me = state.mode === 'initial' && state.profiles[0]!.localId === id;
  const steps: Step[] = [];
  const key = (suffix: string) => `${NUTRITION(id)}${suffix}`;
  const patch = (s: ChatState, change: Partial<OnboardingNutritionInput>) =>
    withNutrition(s, id, change);

  steps.push({
    id: key('start'),
    profileId: id,
    prompt: () => [
      me
        ? 'Next, nutrition. I can track goals, estimate energy needs and keep a weight history, using only what you choose to share. How would you like to start?'
        : `Would you like to set up nutrition for ${name} now?`,
    ],
    input: () => ({
      kind: 'choice',
      label: 'Nutrition setup',
      layout: 'cards',
      options: [
        {
          value: 'vesync',
          label: 'Connect a smart scale (VeSync)',
          description: 'Import your latest weigh-in from an Etekcity ESF24.',
          icon: 'link',
        },
        {
          value: 'manual',
          label: 'Enter my details manually',
          description: 'A few quick questions. Skip any you like.',
          icon: 'pencil',
        },
        {
          value: 'later',
          label: 'Set up nutrition later',
          description: 'Skip for now. You can add it in Settings.',
          icon: 'clock',
        },
      ],
    }),
    apply: (s, answer) =>
      updateProfile(s, id, (p) => ({
        ...p,
        nutritionPath: choiceAnswer(answer) as ChatProfile['nutritionPath'],
      })),
  });
  if (path === 'unset' || path === 'later') return steps;

  if (path === 'vesync') {
    steps.push({
      id: key('vesync'),
      profileId: id,
      prompt: () => [
        'Sign in to VeSync below. Your password goes straight to VeSync through this server; it isn’t saved, and it’s never shared with the assistant.',
      ],
      input: () => ({ kind: 'widget', widget: 'vesync' }),
      apply: (s, answer) =>
        answer.kind === 'vesync'
          ? patch(s, {
              currentWeightKilograms: answer.weightKilograms,
              measurementRecordedAt: answer.measuredAt,
              vesyncConnectionId: answer.connectionId,
              weightTrackingEnabled: true,
              advancedMetrics: {
                ...s.profiles.find((p) => p.localId === id)!.nutrition.advancedMetrics,
                ...(answer.bodyFatPercent !== undefined
                  ? { bodyFatPercent: answer.bodyFatPercent }
                  : {}),
              },
            })
          : s,
      echo: (_s, answer) => ({
        text: answer.kind === 'vesync' ? answer.label : 'I’ll enter my details instead',
      }),
      after: (_s, answer) =>
        answer.kind === 'vesync'
          ? [
              'Imported. Please check the measurement date; you can add other readings later in Settings.',
            ]
          : [],
    });
  }

  steps.push({
    id: key('dob'),
    profileId: id,
    prompt: () => [
      `What’s ${me ? 'your' : `${name}’s`} birthday? It lets me work out age; it stays in the profile.`,
    ],
    input: () => ({
      kind: 'text',
      name: 'dateOfBirth',
      label: 'Birthday',
      inputType: 'date',
      optional: true,
      skipLabel: 'Skip',
    }),
    validate: (s, answer) =>
      answer.kind === 'skip'
        ? null
        : issueFor({ ...profileOf(s, id).nutrition, dateOfBirth: textAnswer(answer) }, [
            'dateOfBirth',
          ]),
    apply: (s, answer) =>
      patch(s, { dateOfBirth: answer.kind === 'skip' ? '' : textAnswer(answer) }),
    echo: (_s, answer) => ({
      text:
        answer.kind === 'text'
          ? new Date(`${answer.value}T12:00:00Z`).toLocaleDateString(undefined, {
              dateStyle: 'long',
              timeZone: 'UTC',
            })
          : 'Skip',
    }),
  });

  steps.push({
    id: key('ref'),
    profileId: id,
    prompt: () => [
      'Energy estimates use female or male reference formulas. That doesn’t define anyone’s gender. Which should I use?',
    ],
    input: () => ({
      kind: 'choice',
      label: 'Reference category',
      layout: 'chips',
      options: [
        { value: 'female', label: 'Female reference' },
        { value: 'male', label: 'Male reference' },
        { value: '', label: 'Skip estimates' },
      ],
    }),
    apply: (s, answer) =>
      patch(s, {
        referenceSexCategory: (choiceAnswer(answer) || null) as 'female' | 'male' | null,
      }),
  });

  steps.push({
    id: key('height'),
    profileId: id,
    prompt: () => [me ? 'How tall are you?' : `How tall is ${name}?`],
    input: () => ({
      kind: 'measure',
      measure: 'height',
      label: 'Height',
      units,
      skipLabel: 'Skip',
    }),
    apply: (s, answer) =>
      patch(s, { heightCentimeters: answer.kind === 'measure' ? answer.value : null }),
  });

  if (value.currentWeightKilograms === null || path !== 'vesync') {
    steps.push({
      id: key('weight'),
      profileId: id,
      prompt: () => [me ? 'And your current weight?' : `And ${name}’s current weight?`],
      input: () => ({
        kind: 'measure',
        measure: 'weight',
        label: 'Current weight',
        units,
        skipLabel: 'Skip',
      }),
      apply: (s, answer) =>
        patch(s, {
          currentWeightKilograms: answer.kind === 'measure' ? answer.value : null,
          measurementRecordedAt: null,
        }),
      after: (s) => {
        const current = profileOf(s, id);
        const guidance = guidanceFor(current);
        if (guidance.bmi === null || !guidance.range) return [];
        return [
          `For reference, the adult BMI range of 18.5–24.9 for that height is about ${formatWeight(guidance.range.min, units)}–${formatWeight(guidance.range.max, units)}. BMI is only a screening measure; it can’t tell muscle from fat or define anyone’s ideal weight.`,
        ];
      },
    });
  }

  steps.push({
    id: key('activity'),
    profileId: id,
    prompt: () => ['How active is a usual week? Include your daily routine as well as exercise.'],
    input: () => ({
      kind: 'choice',
      label: 'Activity level',
      layout: 'cards',
      options: [...activityChoices, { value: '', label: 'Not sure — leave it blank' }],
    }),
    apply: (s, answer) =>
      patch(s, {
        activityLevel: (choiceAnswer(answer) || null) as OnboardingNutritionInput['activityLevel'],
      }),
  });

  if (value.referenceSexCategory !== 'male') {
    steps.push({
      id: key('life'),
      profileId: id,
      prompt: () => [
        'One thing that changes the advice: is anyone pregnant or breastfeeding? If so, I’ll turn off general weight-loss and energy suggestions.',
      ],
      input: () => ({
        kind: 'choice',
        label: 'Pregnant or breastfeeding',
        layout: 'chips',
        options: [
          { value: '', label: 'No / prefer not to say' },
          { value: 'pregnant', label: 'Pregnant' },
          { value: 'breastfeeding', label: 'Breastfeeding' },
        ],
      }),
      apply: (s, answer) =>
        patch(s, {
          lifeStage: (choiceAnswer(answer) || null) as OnboardingNutritionInput['lifeStage'],
          estimatedTargetsEnabled: false,
          estimatedTargetConsent: false,
        }),
    });
  }

  steps.push({
    id: key('goal'),
    profileId: id,
    prompt: () => ['What would you like to work towards?'],
    input: () => ({
      kind: 'choice',
      label: 'Nutrition goal',
      layout: 'cards',
      options: goalChoices,
    }),
    apply: (s, answer) =>
      patch(s, {
        nutritionGoalType: choiceAnswer(answer) as OnboardingNutritionInput['nutritionGoalType'],
        targetWeightKilograms: null,
        targetDate: '',
        weightGoalPace: null,
      }),
  });

  const change = value.nutritionGoalType === 'loss' || value.nutritionGoalType === 'gain';
  if (change) {
    steps.push({
      id: key('target'),
      profileId: id,
      prompt: (s) => {
        const guidance = guidanceFor(profileOf(s, id));
        const lines = ['What target weight feels right? A target is optional.'];
        if (value.nutritionGoalType === 'loss' && guidance.firstMilestone !== null)
          lines.push(
            `A common first milestone is 5% below where you are now: ${formatWeight(guidance.firstMilestone, units)}. NIDDK describes a 5–10% change over six months as a usual starting goal for adults with excess weight.`,
          );
        return lines;
      },
      input: (s) => {
        const guidance = guidanceFor(profileOf(s, id));
        return {
          kind: 'measure',
          measure: 'weight',
          label: 'Target weight',
          units,
          skipLabel: 'No target yet',
          suggestions:
            value.nutritionGoalType === 'loss' && guidance.firstMilestone !== null
              ? [
                  {
                    label: `Use ${formatWeight(guidance.firstMilestone, units)}`,
                    kilograms: Number(guidance.firstMilestone.toFixed(1)),
                  },
                ]
              : undefined,
        };
      },
      validate: (s, answer) =>
        answer.kind === 'measure'
          ? issueFor({ ...profileOf(s, id).nutrition, targetWeightKilograms: answer.value }, [
              'targetWeightKilograms',
              'currentWeightKilograms',
            ])
          : null,
      apply: (s, answer) =>
        patch(s, { targetWeightKilograms: answer.kind === 'measure' ? answer.value : null }),
    });

    if (canSuggestPace(item)) {
      steps.push({
        id: key('pace'),
        profileId: id,
        prompt: () => [
          'What pace feels manageable? Progress varies, so treat these as planning estimates.',
        ],
        input: (s) => {
          const current = profileOf(s, id);
          return {
            kind: 'choice',
            label: 'Pace',
            layout: 'cards',
            options: [
              ...Object.entries(onboardingPaces)
                .filter(
                  ([paceKey]) =>
                    current.nutrition.nutritionGoalType === 'loss' || paceKey !== 'intense',
                )
                .map(([paceKey, option]) => {
                  const rate = current.nutrition.currentWeightKilograms
                    ? Math.min(option.kgPerWeek, current.nutrition.currentWeightKilograms * 0.01)
                    : null;
                  return {
                    value: paceKey,
                    label: option.label,
                    description: `${rate ? `About ${formatWeight(rate, units)} / week. ` : ''}${option.description}`,
                  };
                }),
              { value: '', label: 'No preference' },
            ],
          };
        },
        apply: (s, answer) =>
          patch(s, {
            weightGoalPace: (choiceAnswer(answer) ||
              null) as OnboardingNutritionInput['weightGoalPace'],
          }),
      });
      const timeline = timelineFor(item);
      if (timeline) {
        steps.push({
          id: key('date'),
          profileId: id,
          prompt: () => [
            `Approximately ${timeline.weeks} weeks. That’s a rough timeframe from your current and target weights, not a promised completion date, since weight change isn’t linear.`,
            'Want to use a review date to check in on progress?',
          ],
          input: () => ({
            kind: 'choice',
            label: 'Review date',
            layout: 'chips',
            options: [
              {
                value: timeline.date,
                label: `Use ${new Date(`${timeline.date}T12:00:00Z`).toLocaleDateString()} as a review date`,
              },
              { value: '', label: 'No date' },
            ],
          }),
          apply: (s, answer) => patch(s, { targetDate: choiceAnswer(answer) }),
        });
      }
    }
  }

  const listStep = (
    suffix: string,
    field: 'dietaryPreferences' | 'foodAllergies' | 'dietaryExclusions',
    prompt: string,
    options: string[],
    customLabel: string,
    groupLabel: string,
  ) =>
    steps.push({
      id: key(suffix),
      profileId: id,
      prompt: () => [prompt],
      input: (s) => ({
        kind: 'multi',
        label: groupLabel,
        options: dietOptions(options),
        customLabel,
        doneLabel: 'Done',
        emptyLabel: 'None of these',
        initial: profileOf(s, id).nutrition[field],
      }),
      apply: (s, answer) => patch(s, { [field]: answer.kind === 'multi' ? answer.values : [] }),
    });
  listStep(
    'diet',
    'dietaryPreferences',
    'How do you like to eat? Pick any that fit, or add your own.',
    [
      'Vegetarian',
      'Vegan',
      'Pescatarian',
      'Mediterranean',
      'Gluten-free',
      'Dairy-free',
      'Halal',
      'Kosher',
    ],
    'Add an eating preference',
    'Eating preferences',
  );
  listStep(
    'allergies',
    'foodAllergies',
    'Any food allergies? Always check ingredients when cooking.',
    ['Peanuts', 'Tree nuts', 'Milk', 'Eggs', 'Wheat', 'Soy', 'Fish', 'Shellfish', 'Sesame'],
    'Add a known allergy',
    'Food allergies',
  );
  listStep(
    'avoid',
    'dietaryExclusions',
    'Anything else you’d rather leave out?',
    ['Alcohol', 'Pork', 'Beef', 'Mushrooms', 'Olives', 'Cilantro', 'Spicy food'],
    'Add a food to avoid',
    'Foods to avoid',
  );

  if (value.currentWeightKilograms !== null) {
    steps.push({
      id: key('history'),
      profileId: id,
      prompt: () => [
        'Shall I keep a weight history? I’ll save this starting measurement so you can record changes over time.',
      ],
      input: () => ({
        kind: 'choice',
        label: 'Weight history',
        layout: 'chips',
        options: [
          { value: 'yes', label: 'Yes, keep a history' },
          { value: 'no', label: 'No thanks' },
        ],
      }),
      apply: (s, answer) => patch(s, { weightTrackingEnabled: choiceAnswer(answer) === 'yes' }),
    });
  }

  if (guidanceFor(item).maintenance !== null && !value.lifeStage) {
    steps.push({
      id: key('estimate'),
      profileId: id,
      prompt: () => [
        'I can show an estimate of maintenance energy from the age, height, weight and activity you entered, using NASEM 2023. It’s a starting estimate, not a prescribed intake or a weight-loss target. Would you like it?',
      ],
      input: () => ({
        kind: 'choice',
        label: 'Energy estimate',
        layout: 'chips',
        options: [
          { value: 'yes', label: 'Yes, show an estimate' },
          { value: 'no', label: 'No thanks' },
        ],
      }),
      apply: (s, answer) =>
        patch(s, {
          estimatedTargetsEnabled: choiceAnswer(answer) === 'yes',
          estimatedTargetConsent: choiceAnswer(answer) === 'yes',
        }),
      after: (s, answer) => {
        const kcal = guidanceFor(profileOf(s, id)).maintenance;
        return choiceAnswer(answer) === 'yes' && kcal
          ? [
              `About ${kcal.toLocaleString()} kcal a day to maintain weight. You can turn this off in settings any time.`,
            ]
          : [];
      },
    });
  }

  return steps;
}

function goalSteps(state: ChatState, item: ChatProfile, index: number): Step[] {
  const id = item.localId;
  const name = firstName(item);
  const me = state.mode === 'initial' && index === 0;
  const key = (suffix: string) => `${GOALS(id)}${suffix}`;
  const steps: Step[] = [];

  steps.push({
    id: key('start'),
    profileId: id,
    prompt: () => [
      me
        ? 'Last bit, and my favourite: getting to know you. A few questions about what you want from Bòrd and how you like to eat, so plans feel personal. Everything is optional.'
        : `Would you like to tell me about ${name}’s goals and tastes now, or leave it for later?`,
    ],
    input: () => ({
      kind: 'choice',
      label: 'Get to know you',
      layout: 'chips',
      options: [
        { value: 'chat', label: 'Let’s chat' },
        { value: 'later', label: 'Skip for now' },
      ],
    }),
    apply: (s, answer) =>
      updateProfile(s, id, (p) => ({
        ...p,
        goalsPath: choiceAnswer(answer) as ChatProfile['goalsPath'],
      })),
  });
  if (item.goalsPath !== 'chat') return steps;

  if (state.aiAvailable && state.aiConsent === 'unknown') {
    steps.push({
      id: 'ai.consent',
      prompt: () => [
        'Would you like me to use AI to respond to your answers and ask smarter follow-ups? Only your answers to these goal and food questions (and any dietary needs you listed) are sent. Your email, passphrase, birthday, measurements and scale login never are.',
      ],
      input: () => ({
        kind: 'choice',
        label: 'Use AI for the conversation',
        layout: 'chips',
        options: [
          { value: 'yes', label: 'Yes, use AI' },
          { value: 'no', label: 'No thanks, keep it simple' },
        ],
      }),
      apply: (s, answer) => ({ ...s, aiConsent: choiceAnswer(answer) === 'yes' ? 'yes' : 'no' }),
    });
  }

  steps.push({
    id: key('focus'),
    profileId: id,
    prompt: () => ['What would make the biggest difference? Pick any that fit, up to eight.'],
    input: (s) => ({
      kind: 'multi',
      label: 'Goals',
      options: profileGoalFocusOptions.map((option) => ({
        value: option.value,
        label: option.label,
        description: option.description,
      })),
      max: 8,
      doneLabel: 'Done',
      emptyLabel: 'Nothing in particular',
      initial: (profileOf(s, id).profile.goalContext ?? defaultProfileGoalContext).focusAreas,
    }),
    apply: (s, answer) =>
      updateProfile(s, id, (p) => ({
        ...p,
        profile: {
          ...p.profile,
          goalContext: {
            ...(p.profile.goalContext ?? defaultProfileGoalContext),
            focusAreas: (answer.kind === 'multi' ? answer.values : []) as ProfileGoalFocus[],
          },
        },
      })),
    echo: (_s, answer) => ({
      text:
        answer.kind === 'multi' && answer.values.length
          ? answer.values
              .map(
                (value) => profileGoalFocusOptions.find((o) => o.value === value)?.label ?? value,
              )
              .join(', ')
          : 'Nothing in particular',
    }),
  });

  const topicStep = (
    suffix: string,
    topic: InterviewTopic,
    question: string,
    hint: string,
    suggestions: string[] | undefined,
    extraPrompt?: (s: ChatState) => string[],
  ) => {
    if (item.covered.includes(topic)) return;
    const stepId = key(suffix);
    steps.push({
      id: stepId,
      profileId: id,
      topic,
      prompt: (s) => [question, ...(extraPrompt?.(s) ?? [])],
      input: () => ({
        kind: 'text',
        name: topic,
        label: question,
        inputType: 'textarea',
        optional: true,
        skipLabel: 'Skip',
        maxLength: topicMaxLength(topic),
        hint,
        suggestions,
      }),
      apply: (s, answer) =>
        answer.kind === 'skip'
          ? s
          : recordTopicAnswer(s, id, topic, question, textAnswer(answer), 'set'),
      ask: (s, answer) =>
        s.aiConsent === 'yes' && answer.kind === 'text' && textAnswer(answer)
          ? { profileId: id, topic, question, answer: textAnswer(answer) }
          : null,
    });
    const dynamic = state.dynamic.find((entry) => entry.afterStepId === stepId);
    if (dynamic) {
      steps.push({
        id: dynamic.id,
        profileId: id,
        topic,
        prompt: () => [dynamic.question],
        input: () => ({
          kind: 'text',
          name: `${topic}-more`,
          label: dynamic.question,
          inputType: 'textarea',
          optional: true,
          skipLabel: 'Skip',
          maxLength: topicMaxLength(topic),
          suggestions: dynamic.suggestions,
        }),
        apply: (s, answer) =>
          answer.kind === 'skip'
            ? s
            : recordTopicAnswer(s, id, topic, dynamic.question, textAnswer(answer), 'append'),
        ask: () => null,
      });
    }
  };

  topicStep(
    'motivation',
    'motivation',
    'Why does this matter to you right now?',
    'Maybe more energy, less stress around food, or feeling confident cooking.',
    undefined,
  );
  topicStep(
    'challenges',
    'challenges',
    'What tends to get in the way?',
    'Name the friction, not a personal failing: busy evenings, budget, unused groceries.',
    undefined,
  );
  topicStep(
    'success',
    'successVision',
    'Imagine this is working well. What feels different?',
    'The everyday change you would notice, not just a number.',
    undefined,
  );
  for (const question of kitchenInterviewQuestions) {
    topicStep(
      `iv.${question.key}`,
      question.key,
      question.title,
      question.help,
      kitchenInterviewSuggestions[question.key],
      question.key === 'desserts'
        ? (s) =>
            /sweet/iu.test(topicValue(profileOf(s, id), 'taste'))
              ? [
                  'You mentioned a sweet side. Which treats do you enjoy, and how often should I suggest them?',
                ]
              : []
        : undefined,
    );
  }

  steps.push({
    id: key('extra'),
    profileId: id,
    prompt: () => [
      'Anything else you’d like me to remember? A skill to learn, a food ritual, a detail that didn’t fit above.',
    ],
    input: () => ({
      kind: 'text',
      name: 'mainGoals',
      label: 'Anything else to remember',
      inputType: 'textarea',
      optional: true,
      skipLabel: 'Nothing else',
      maxLength: 2000,
    }),
    apply: (s, answer) =>
      answer.kind === 'skip'
        ? s
        : updateProfile(s, id, (p) => ({
            ...p,
            profile: { ...p.profile, mainGoals: textAnswer(answer).slice(0, 2000) },
          })),
  });
  return steps;
}

export function buildSteps(state: ChatState): Step[] {
  const steps: Step[] = [];
  if (state.mode === 'initial') {
    steps.push(
      {
        id: 'kitchen.name',
        prompt: () => [
          'Fàilte! Welcome to Bòrd. Bòrd is Scottish Gaelic for “table”: a recipe keeper, meal planner, nutritional advisor and grocery helper for the people you cook for.',
          'I’ll ask a few quick questions to set up your kitchen. You can change any answer later, and most are optional.',
          'First, what would you like to call your kitchen?',
        ],
        input: (s) => ({
          kind: 'text',
          name: 'kitchenName',
          label: 'Kitchen name',
          inputType: 'text',
          maxLength: 80,
          initial: s.kitchenName,
          hint: 'Appears in the header and install icon. Press Enter to keep Bòrd.',
        }),
        validate: (_s, answer) =>
          textAnswer(answer) ? null : 'Give your kitchen a name to continue.',
        apply: (s, answer) => ({ ...s, kitchenName: textAnswer(answer).slice(0, 80) }),
      },
      {
        id: 'kitchen.icon',
        prompt: (s) => [
          `${s.kitchenName} it is. Pick an icon for it. It represents your kitchen in the header and on your home screen.`,
        ],
        input: () => ({ kind: 'widget', widget: 'icon' }),
        apply: (s, answer) => (answer.kind === 'icon' ? { ...s, brandIcon: answer.value } : s),
        echo: (_s, answer) => ({
          text:
            answer.kind === 'icon'
              ? `${brandIconLabel(answer.value)} icon`
              : 'Keep the default icon',
        }),
      },
      {
        id: 'kitchen.look',
        prompt: () => ['And how should it look? Colors and brightness are saved in this browser.'],
        input: () => ({ kind: 'widget', widget: 'look' }),
        apply: (s) => s,
        echo: () => ({ text: 'Looks good' }),
      },
    );
  }

  state.profiles.forEach((item, index) => {
    steps.push(...profileSteps(state, index));
    if (state.mode !== 'initial') return;
    if (index === 0) steps.push(...recipeSteps(state));
    steps.push(moreProfilesStep(item.localId, state.profiles.length));
  });

  steps.push({
    id: 'review',
    prompt: () => [
      'That’s everything I need. Here’s your setup. Tap “Change” on anything you’d like to redo.',
    ],
    input: () => ({ kind: 'review' }),
    apply: (s) => s,
  });
  return steps;
}

function recipeSteps(state: ChatState): Step[] {
  const steps: Step[] = [
    {
      id: 'recipe.choice',
      prompt: () => ['Almost there. How would you like to add your first recipe?'],
      input: () => ({
        kind: 'choice',
        label: 'First recipe',
        layout: 'cards',
        options: firstRecipeChoices,
      }),
      apply: (s, answer) => ({
        ...s,
        firstRecipeChoice: choiceAnswer(answer) as FirstRecipeChoice,
      }),
      after: (s) =>
        s.firstRecipeChoice === 'example'
          ? [
              'Good choice. Traditional Scottish Stovies comes with measured ingredients, equipment, eight detailed steps, source notes and estimated nutrition. You can edit everything later.',
            ]
          : [],
    },
    {
      id: 'recipe.import',
      prompt: () => ['What are you importing?'],
      input: () => ({
        kind: 'choice',
        label: 'Recipe import method',
        layout: 'chips',
        options: [
          { value: 'url', label: 'From URL' },
          { value: 'text', label: 'Paste recipe' },
          { value: 'json', label: 'Paste JSON-LD' },
        ],
      }),
      apply: (s, answer) => ({ ...s, importMode: choiceAnswer(answer) as ChatState['importMode'] }),
    },
  ];
  return state.firstRecipeChoice === 'import' ? steps : steps.slice(0, 1);
}

function moreProfilesStep(afterId: number, count: number): Step {
  return {
    id: `more.${afterId}`,
    prompt: () => [
      count >= maximumSetupProfiles
        ? 'That’s the most profiles one kitchen can start with.'
        : 'Is anyone else cooking in this kitchen? You can add them now or later in Settings.',
    ],
    input: () => ({
      kind: 'choice',
      label: 'More people',
      layout: 'chips',
      options:
        count >= maximumSetupProfiles
          ? [{ value: 'done', label: 'Continue' }]
          : [
              { value: 'add', label: 'Add another person' },
              { value: 'done', label: 'That’s everyone for now' },
            ],
    }),
    apply: (s, answer) => {
      if (choiceAnswer(answer) !== 'add' || s.profiles.length >= maximumSetupProfiles) return s;
      const regional = {
        locale: s.profiles[0]!.profile.locale,
        timezone: s.profiles[0]!.profile.timezone,
      };
      const created = createProfile(s.nextProfileId, regional, s.nextProfileId - 1, {
        units: s.profiles[0]!.profile.units,
        temperatureUnit: s.profiles[0]!.profile.temperatureUnit,
      });
      return { ...s, profiles: [...s.profiles, created], nextProfileId: s.nextProfileId + 1 };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Running the script                                                   */
/* ------------------------------------------------------------------ */

export function nextStep(state: ChatState): Step | null {
  return buildSteps(state).find((step) => !state.done.includes(step.id)) ?? null;
}

export function remainingTopics(state: ChatState, profileId: number): InterviewTopic[] {
  return buildSteps(state)
    .filter((step) => step.profileId === profileId && step.topic && !state.done.includes(step.id))
    .map((step) => step.topic!)
    .filter((topic, index, all) => all.indexOf(topic) === index);
}

export function progressOf(state: ChatState): number {
  const steps = buildSteps(state);
  const remaining = steps.filter((step) => !state.done.includes(step.id)).length;
  const answered = state.done.length;
  return answered + remaining === 0 ? 0 : answered / (answered + remaining);
}

/** Section ids a "Change" button on the review card re-opens. */
export function sectionStepIds(state: ChatState, section: string): string[] {
  const ids = buildSteps(state).map((step) => step.id);
  if (section === 'kitchen') return ['kitchen.name'];
  if (section === 'recipe') return ['recipe.choice', 'recipe.import'];
  const [kind, raw] = section.split(':');
  const id = Number(raw);
  if (kind === 'identity') return [`p${id}.name`];
  if (kind === 'nutrition') return ids.filter((stepId) => stepId.startsWith(NUTRITION(id)));
  if (kind === 'goals') return ids.filter((stepId) => stepId.startsWith(GOALS(id)));
  return [];
}

export function reopen(state: ChatState, stepIds: string[]): ChatState {
  const first = stepIds[0];
  if (!first) return state;
  return {
    ...pushMessage(state, {
      from: 'bot',
      kind: 'text',
      text: 'Of course. Let’s go through that again.',
    }),
    done: state.done.filter((id) => !stepIds.includes(id)),
    presented: null,
  };
}

export function echoFor(
  step: Step,
  state: ChatState,
  answer: Answer,
): { text: string; secret?: boolean } {
  if (step.echo) return step.echo(state, answer);
  switch (answer.kind) {
    case 'text':
      return { text: answer.value.trim() };
    case 'choice':
      return { text: answer.label };
    case 'multi':
      return { text: answer.values.length ? answer.values.join(', ') : 'None' };
    case 'measure':
      return { text: answer.label };
    case 'icon':
      return { text: brandIconLabel(answer.value) };
    case 'ack':
      return { text: answer.label };
    case 'vesync':
      return { text: answer.label };
    case 'skip': {
      const spec = step.input(state);
      return {
        text: ('skipLabel' in spec && spec.skipLabel) || 'Skip',
      };
    }
  }
}

/**
 * Records an answer: the person's message, the state change, and the assistant's short
 * follow-on remarks. Returns the new state and, when the answer is worth an AI reply,
 * what to ask. Callers validate first.
 */
export function answerStep(
  state: ChatState,
  step: Step,
  answer: Answer,
): { state: ChatState; ask: AiAsk | null } {
  const echo = echoFor(step, state, answer);
  let next = pushMessage(state, {
    from: 'user',
    kind: 'text',
    text: echo.text,
    secret: echo.secret,
  });
  next = step.apply(next, answer);
  next = { ...next, done: [...next.done, step.id] };
  next = { ...next, progress: Math.max(next.progress, progressOf(next)) };
  for (const text of step.after?.(next, answer) ?? []) {
    next = pushMessage(next, { from: 'bot', kind: 'text', text });
  }
  return { state: next, ask: step.ask?.(next, answer) ?? null };
}
