'use client';

import { Check, Copy, ShieldCheck, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { BordIcon } from '@/components/bord-brand';
import { BrandIconPicker } from '@/components/brand-icon-picker';
import { ButtonSpinner } from '@/components/skeleton';
import { AppearanceChoices } from '@/components/theme-toggle';
import { useToast } from '@/components/toast-provider';
import type { BrandIconId } from '@/lib/appearance';
import {
  buildInterviewRequest,
  onboardingInterviewTurnSchema,
} from '@/lib/domain/onboarding-interview';
import type { ProfileGoalContext } from '@/lib/domain/profile-goals';
import {
  secureProfileOnboardingSchema,
  setupSchema,
  defaultProfileInput,
} from '@/lib/domain/setup';

import { Composer } from './composer';
import {
  acknowledge,
  answerStep,
  applyInterviewTurn,
  buildSteps,
  createInitialState,
  nextStep,
  profileOf,
  pushMessage,
  remainingTopics,
  reopen,
  sectionStepIds,
  type Answer,
  type AiAsk,
  type ChatMessage,
  type ChatMode,
  type ChatState,
} from './flow';
import styles from './onboarding-chat.module.css';
import { ReviewCard } from './review-card';
import { VeSyncCard } from './vesync-card';

type ProfileRecord = {
  id: string;
  displayName: string;
  color: string;
  avatarUrl: string | null;
  units: 'metric' | 'imperial';
  temperatureUnit: 'C' | 'F';
  locale: string;
  timezone: string;
  mainGoals: string;
  goalContext: ProfileGoalContext;
  archivedAt: string | null;
};

type SecurityCompletion = {
  groups: Array<{ profileName: string; codes: string[] }>;
  destination: string;
  requiresEmailVerification: boolean;
  createdProfile?: ProfileRecord;
};

function IconWidget({
  initial,
  onPick,
}: {
  initial: BrandIconId;
  onPick: (icon: BrandIconId) => void;
}) {
  const [selected, setSelected] = useState(initial);
  return (
    <div className={styles.widget}>
      <div className={styles.widgetScroll}>
        <BrandIconPicker selected={selected} onSelect={setSelected} />
      </div>
      <button className={styles.cta} type="button" onClick={() => onPick(selected)}>
        Use this icon
      </button>
    </div>
  );
}

function BotMark() {
  return (
    <span className={styles.botMark} aria-hidden="true">
      <BordIcon size={15} />
    </span>
  );
}

function instantMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    (navigator.webdriver ||
      Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches))
  );
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export function OnboardingChat({
  mode,
  onProfileCreated,
  onDismissStateChange,
  onCommitted,
  aiEnabled = false,
}: {
  mode: ChatMode;
  aiEnabled?: boolean;
  onProfileCreated?: (profile: ProfileRecord) => void;
  onCommitted?: () => void;
  onDismissStateChange?: (state: { dirty: boolean; pending: boolean; completion: boolean }) => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [state, setState] = useState<ChatState>(() =>
    createInitialState({ mode, aiAvailable: aiEnabled }),
  );
  const [history, setHistory] = useState<ChatState[]>([]);
  const [thinking, setThinking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [security, setSecurity] = useState<SecurityCompletion | null>(null);
  const [codesSaved, setCodesSaved] = useState(false);
  const token = useRef(0);
  const list = useRef<HTMLDivElement>(null);

  const current = useMemo(() => nextStep(state), [state]);
  const presenting =
    Boolean(current) && state.presented !== current?.id && !thinking && !submitting && !security;
  const idle = !presenting && !thinking && !submitting;
  const progress = state.progress;

  /* Browser locale and time zone seed every profile once, after hydration. */
  useEffect(() => {
    const regional = {
      locale: navigator.language || defaultProfileInput.locale,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || defaultProfileInput.timezone,
    };
    const frame = window.requestAnimationFrame(() =>
      setState((s) => ({
        ...s,
        profiles: s.profiles.map((item) => ({
          ...item,
          profile: { ...item.profile, ...regional },
        })),
      })),
    );
    return () => window.cancelAnimationFrame(frame);
  }, []);

  /* The assistant asks the next question, one message at a time. */
  useEffect(() => {
    if (!current || thinking || submitting || security) return;
    if (state.presented === current.id) return;
    const mine = ++token.current;
    const step = current;
    const instant = instantMotion();
    void (async () => {
      const lines = step.prompt(state);
      for (const text of lines) {
        await wait(instant ? 0 : Math.min(900, 260 + text.length * 6));
        if (mine !== token.current) return;
        setState((s) => pushMessage(s, { from: 'bot', kind: 'text', text }));
      }
      if (step.id === 'review') setState((s) => pushMessage(s, { from: 'bot', kind: 'review' }));
      if (mine !== token.current) return;
      setState((s) => ({ ...s, presented: step.id }));
    })();
    const generation = token;
    return () => {
      generation.current++;
    };
    // `state` is intentionally read once per step: prompts are written from the state at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, state.presented, thinking, submitting, security]);

  useEffect(() => {
    const element = list.current;
    if (!element) return;
    element.scrollTo?.({
      top: element.scrollHeight,
      behavior: instantMotion() ? 'auto' : 'smooth',
    });
  }, [state.messages.length, presenting, thinking, submitting, security]);

  useEffect(() => {
    onDismissStateChange?.({
      dirty: state.done.length > 0,
      pending: submitting,
      completion: Boolean(security),
    });
  }, [onDismissStateChange, state.done.length, submitting, security]);

  const secrets = useMemo(
    () => state.profiles.flatMap((item) => [item.credentials.passphrase, item.credentials.email]),
    [state.profiles],
  );

  const askAssistant = useCallback(
    async (next: ChatState, ask: AiAsk, stepId: string) => {
      setThinking(true);
      try {
        const item = profileOf(next, ask.profileId);
        const body = buildInterviewRequest(
          {
            topic: ask.topic,
            question: ask.question,
            answer: ask.answer,
            history: item.qa.filter((entry) => entry.topic !== ask.topic),
            remaining: remainingTopics(next, ask.profileId),
            focusAreas: item.profile.goalContext?.focusAreas ?? [],
            dietary: {
              preferences: item.nutrition.dietaryPreferences,
              allergies: item.nutrition.foodAllergies,
              exclusions: item.nutrition.dietaryExclusions,
            },
            followUpsUsed: item.followUps[ask.topic] ?? 0,
          },
          secrets,
        );
        const response = await fetch('/api/v1/setup/interview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error('assistant unavailable');
        const turn = onboardingInterviewTurnSchema.parse((await response.json()).turn);
        setState((s) => applyInterviewTurn(s, ask, turn, stepId));
      } catch {
        // The conversation never depends on the assistant: carry on with a plain acknowledgement.
        setState((s) => acknowledge(s));
      } finally {
        setThinking(false);
      }
    },
    [secrets],
  );

  function handleAnswer(answer: Answer) {
    if (!current || !idle) return;
    if (answer.kind !== 'skip' && current.validate?.(state, answer)) return;
    const before = state;
    const step = current;
    const { state: next, ask } = answerStep(state, step, answer);
    setHistory((entries) => [...entries, before]);
    setSubmitError('');
    setState(next);
    if (ask) void askAssistant(next, ask, step.id);
    else if (step.topic && answer.kind === 'text') setState((s) => acknowledge(s));
  }

  function undo() {
    const previous = history[history.length - 1];
    if (!idle || !previous) return;
    token.current++;
    setHistory(history.slice(0, -1));
    setState(previous);
    setSubmitError('');
  }

  function changeSection(section: string) {
    const ids = sectionStepIds(state, section);
    if (!ids.length || !idle) return;
    setHistory((entries) => [...entries, state]);
    setState(reopen(state, ids));
  }

  function removeProfile(profileId: number) {
    if (!idle) return;
    const index = state.profiles.findIndex((item) => item.localId === profileId);
    if (index < 1) return;
    const previous = state.profiles[index - 1]!;
    setHistory((entries) => [...entries, state]);
    setState({
      ...pushMessage(state, {
        from: 'bot',
        kind: 'text',
        text: `Removed ${state.profiles[index]!.profile.displayName}.`,
      }),
      profiles: state.profiles.filter((item) => item.localId !== profileId),
      done: state.done.filter(
        (id) => !id.startsWith(`p${profileId}.`) && id !== `more.${previous.localId}`,
      ),
      presented: null,
    });
  }

  async function submit() {
    const drafts = state.profiles.map((item) => ({
      role: item.role,
      profile: item.profile,
      credentials: item.credentials,
      nutrition: item.nutrition,
    }));
    const first = drafts[0]!;
    const payload =
      mode === 'initial'
        ? {
            kitchenName: state.kitchenName,
            kitchenIcon: state.brandIcon,
            profile: first.profile,
            credentials: first.credentials,
            nutrition: first.nutrition,
            additionalProfiles: drafts.slice(1),
            firstRecipeChoice: state.firstRecipeChoice,
          }
        : first;
    const parsed =
      mode === 'initial'
        ? setupSchema.safeParse(payload)
        : secureProfileOnboardingSchema.safeParse(payload);
    if (!parsed.success) {
      setSubmitError(parsed.error.issues[0]?.message ?? 'Check the answers and try again.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const response = await fetch(
        mode === 'initial' ? '/api/v1/setup' : '/api/v1/profiles/onboarding',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed.data),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        profile?: ProfileRecord;
        firstRecipeId?: string | null;
        recoveryCodes?: string[] | Array<{ profileId: string; codes: string[] }>;
        requiresEmailVerification?: boolean;
        error?: { message?: string };
      } | null;
      if (!response.ok) throw new Error(body?.error?.message ?? 'Onboarding could not be saved.');
      showToast(
        mode === 'initial' ? 'Your shared kitchen is ready.' : 'Profile onboarding complete.',
        'success',
      );
      const entries = Array.isArray(body?.recoveryCodes) ? body.recoveryCodes : [];
      if (mode === 'initial') {
        const destination =
          state.firstRecipeChoice === 'example' && body?.firstRecipeId
            ? `/recipes/${body.firstRecipeId}`
            : state.firstRecipeChoice === 'ai'
              ? '/capture?mode=text&onboarding=1'
              : state.firstRecipeChoice === 'import'
                ? state.importMode === 'json'
                  ? '/import?mode=jsonld&onboarding=1'
                  : `/capture?mode=${state.importMode}&onboarding=1`
                : '/recipes/new?onboarding=1';
        setSecurity({
          groups: state.profiles.map((item, index) => {
            const entry = entries[index];
            return {
              profileName: item.profile.displayName,
              codes: typeof entry === 'string' ? [entry] : (entry?.codes ?? []),
            };
          }),
          destination,
          requiresEmailVerification: Boolean(body?.requiresEmailVerification),
        });
      } else if (body?.profile) {
        onCommitted?.();
        setSecurity({
          groups: [
            {
              profileName: body.profile.displayName,
              codes: entries.filter((entry): entry is string => typeof entry === 'string'),
            },
          ],
          destination: '/settings/profiles',
          requiresEmailVerification: Boolean(body.requiresEmailVerification),
          createdProfile: body.profile,
        });
      }
      setState((s) =>
        pushMessage(s, {
          from: 'bot',
          kind: 'text',
          text:
            mode === 'initial'
              ? `${s.kitchenName} is ready. One last thing before you sign in: your recovery codes.`
              : 'Profile created. One last thing: their recovery codes.',
        }),
      );
    } catch (caught) {
      const message =
        caught instanceof TypeError
          ? 'Creation outcome could not be confirmed. Check household members before retrying; closing does not undo a completed request.'
          : caught instanceof Error
            ? caught.message
            : 'Onboarding could not be saved.';
      if (caught instanceof TypeError) onCommitted?.();
      setSubmitError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function copyCodes() {
    if (!security) return;
    const text = security.groups
      .map((group) => `${group.profileName}\n${group.codes.map((code) => `- ${code}`).join('\n')}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      showToast('Recovery codes copied. Store them somewhere private.', 'success');
    } catch {
      showToast('Copy was unavailable. Select and save the codes manually.', 'error');
    }
  }

  function continueAfterSecurity() {
    if (!security || !codesSaved) return;
    if (mode === 'profile' && security.createdProfile) {
      onProfileCreated?.(security.createdProfile);
      return;
    }
    const params = new URLSearchParams({ setup: '1', callbackUrl: security.destination });
    router.push(`/sign-in?${params.toString()}`);
    router.refresh();
  }

  const lastReviewId = [...state.messages].reverse().find((m) => m.kind === 'review')?.id;
  const createLabel =
    mode === 'initial'
      ? state.firstRecipeChoice === 'example'
        ? 'Add Stovies & open recipe'
        : 'Create kitchen & continue'
      : 'Create profile';
  const activeProfileId = current?.profileId ?? state.profiles[0]!.localId;
  const stepCount = useMemo(() => buildSteps(state).length, [state]);

  function renderMessage(message: ChatMessage) {
    if (message.kind === 'review') {
      return (
        <div className={`${styles.row} ${styles.bot}`} key={message.id}>
          <BotMark />
          {message.id === lastReviewId ? (
            <ReviewCard
              state={state}
              disabled={!idle || Boolean(security)}
              onChange={changeSection}
              onRemove={removeProfile}
            />
          ) : (
            <p className={`${styles.bubble} ${styles.muted}`}>Summary updated below.</p>
          )}
        </div>
      );
    }
    return (
      <div
        className={`${styles.row} ${message.from === 'bot' ? styles.bot : styles.user}`}
        key={message.id}
      >
        {message.from === 'bot' ? <BotMark /> : null}
        <p className={styles.bubble}>{message.text}</p>
      </div>
    );
  }

  return (
    <section
      className={styles.shell}
      data-mode={mode}
      aria-label={mode === 'initial' ? 'Set up your kitchen' : 'Add a profile'}
      aria-busy={submitting || undefined}
    >
      <header className={styles.header}>
        <span className={styles.headerMark} aria-hidden="true">
          <BordIcon size={22} />
        </span>
        <div className={styles.headerCopy}>
          <p className="eyebrow">
            {mode === 'initial' ? 'WELCOME TO YOUR KITCHEN' : 'NEW PROFILE'}
          </p>
          <h2>{mode === 'initial' ? 'Let’s set up your kitchen' : 'Add someone to the kitchen'}</h2>
        </div>
        <div
          className={styles.progress}
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          aria-valuetext={`${Math.round(progress * 100)} percent`}
          data-steps={stepCount}
        >
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      </header>

      <div
        className={styles.list}
        ref={list}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Setup conversation"
        tabIndex={0}
      >
        {state.messages.map(renderMessage)}
        {presenting || thinking || submitting ? (
          <div className={`${styles.row} ${styles.bot}`} role="status">
            <BotMark />
            <p className={`${styles.bubble} ${styles.typing}`}>
              <span className={styles.dots} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="sr-only">
                {submitting ? 'Setting things up' : thinking ? 'Thinking' : 'Typing'}
              </span>
              {submitting ? <em>Setting things up…</em> : null}
            </p>
          </div>
        ) : null}
        {security ? (
          <div className={`${styles.row} ${styles.bot}`}>
            <BotMark />
            <div className={styles.codes}>
              <h3 className={styles.codesHeading}>
                <ShieldCheck size={18} aria-hidden="true" /> Save your recovery codes
              </h3>
              <p>
                Each code works once if email recovery is unavailable. Bòrd will not show these
                codes again.
              </p>
              {security.requiresEmailVerification ? (
                <p>
                  <strong>Check each profile email.</strong> Email verification is required before
                  that profile can sign in.
                </p>
              ) : null}
              {security.groups.map((group, index) => (
                <section
                  key={`${group.profileName}-${index}`}
                  aria-labelledby={`recovery-${index}`}
                >
                  <h4 id={`recovery-${index}`}>{group.profileName}</h4>
                  <ul>
                    {group.codes.map((code) => (
                      <li key={code}>
                        <code>{code}</code>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              <button className="secondary-button" type="button" onClick={() => void copyCodes()}>
                <Copy size={16} aria-hidden="true" /> Copy all recovery codes
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <footer className={styles.composer}>
        {security ? (
          <div className={styles.finish}>
            <label className="recovery-code-confirmation">
              <input
                type="checkbox"
                checked={codesSaved}
                onChange={(event) => setCodesSaved(event.target.checked)}
              />
              <span>I saved these one-time codes somewhere private.</span>
            </label>
            <button
              className={styles.cta}
              type="button"
              disabled={!codesSaved}
              onClick={continueAfterSecurity}
            >
              {mode === 'initial' ? 'Continue to sign in' : 'Finish profile setup'}
            </button>
          </div>
        ) : current && idle && state.presented === current.id ? (
          <>
            {history.length ? (
              <button className={styles.undo} type="button" onClick={undo}>
                <Undo2 size={14} aria-hidden="true" /> Change my last answer
              </button>
            ) : null}
            <Composer
              key={current.id}
              spec={current.input(state)}
              validate={(answer) => current.validate?.(state, answer) ?? null}
              onAnswer={handleAnswer}
              renderReview={() => (
                <div className={styles.finish}>
                  {submitError ? (
                    <p className={styles.fieldError} role="alert">
                      {submitError}
                    </p>
                  ) : null}
                  <button
                    className={styles.cta}
                    type="button"
                    disabled={submitting}
                    aria-busy={submitting}
                    onClick={() => void submit()}
                  >
                    {submitting ? <ButtonSpinner /> : <Check size={17} aria-hidden="true" />}
                    {createLabel}
                  </button>
                </div>
              )}
              renderWidget={(widget, submitWidget) => {
                if (widget === 'icon')
                  return (
                    <IconWidget
                      initial={state.brandIcon}
                      onPick={(value) => submitWidget({ kind: 'icon', value })}
                    />
                  );
                if (widget === 'look')
                  return (
                    <div className={styles.widget}>
                      <AppearanceChoices compact />
                      <button
                        className={styles.cta}
                        type="button"
                        onClick={() => submitWidget({ kind: 'ack', label: 'Looks good' })}
                      >
                        Looks good
                      </button>
                    </div>
                  );
                const owner = profileOf(state, activeProfileId);
                return (
                  <VeSyncCard
                    units={owner.profile.units}
                    timeZone={owner.profile.timezone}
                    onDone={submitWidget}
                  />
                );
              }}
            />
          </>
        ) : (
          <p className={styles.waiting} aria-hidden="true">
            &nbsp;
          </p>
        )}
      </footer>
    </section>
  );
}
