'use client';
import { useEffect, useRef, useState } from 'react';
import { mergeSettings } from '@/lib/domain/settings-merge';
import { SettingsMergeReview } from './settings-merge-review';
import dynamic from 'next/dynamic';
const InterviewChat = dynamic(
  () => import('./ai-assistant-drawer').then((module) => module.AiAssistantDrawer),
  { loading: () => <AssistantLoadingSurface /> },
);
import { useRouter } from 'next/navigation';
import type { Profile } from './profile-settings';
import { SettingsPane } from './settings-primitives';
import type { ProfileGoalContext } from '@/lib/domain/profile-goals';
import { InlineAlert } from './inline-alert';
import { ButtonSpinner } from './skeleton';
import { AssistantLoadingSurface } from './assistant-loading-surface';

type Answers = NonNullable<ProfileGoalContext['kitchenInterview']>;
export const emptyKitchenInterview: Answers = {
  taste: '',
  snacks: '',
  desserts: '',
  routine: '',
  favorites: '',
  avoid: '',
};
export const kitchenInterviewQuestions: Array<{ key: keyof Answers; title: string; help: string }> =
  [
    {
      key: 'taste',
      title: 'Do you lean sweet, savory, or a little of both?',
      help: 'Tell us about flavors you love. A sweet tooth is a preference, not a rule for every meal.',
    },
    {
      key: 'snacks',
      title: 'What do you like to snack on?',
      help: 'Do you snack during the day, at night, or both? Fruit, yogurt, crackers, something else?',
    },
    {
      key: 'desserts',
      title: 'Do you usually have dessert?',
      help: 'How often? Ice cream, cheesecake, pie, candy, or something else? It is fine to skip dessert.',
    },
    {
      key: 'routine',
      title: 'Which meals do you share with your household?',
      help: 'Perhaps everyone shares dinner but has their own breakfast or lunch. Include cooking time, equipment, budget and routine preferences.',
    },
    {
      key: 'favorites',
      title: 'What meals would you happily eat again?',
      help: 'Favorite cuisines, ingredients, comfort foods, and things you would like to try.',
    },
    {
      key: 'avoid',
      title: 'What should your assistant keep in mind?',
      help: 'Foods you dislike, textures, or practical needs. Record allergies in your nutrition profile too; they always take priority.',
    },
  ];
export function KitchenInterview({
  profile,
  aiEnabled = false,
}: {
  profile: Profile;
  aiEnabled?: boolean;
}) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);
  const router = useRouter();
  const [savedAnswers, setSavedAnswers] = useState<Answers | null>(
    profile.goalContext.kitchenInterview ?? null,
  );
  const [answers, setAnswers] = useState<Answers>(
    profile.goalContext.kitchenInterview ?? emptyKitchenInterview,
  );
  const [changedContext, setChangedContext] = useState<{ interview: Answers | null } | null>(null);
  const [step, setStep] = useState<number | null>(null);
  const resumeStep = useRef(0);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const reviewRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (step === null) return;
    resumeStep.current = step;
    if (step < kitchenInterviewQuestions.length) answerRef.current?.focus();
    else reviewRef.current?.focus();
  }, [step]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const question = step === null ? null : kitchenInterviewQuestions[step];
  async function save() {
    setBusy(true);
    setMessage('');
    setError(false);
    try {
      const current = await fetch('/api/v1/account/kitchen-context', { cache: 'no-store' });
      if (!current.ok) throw new Error('Could not load your latest kitchen context.');
      const context = await current.json();
      const latest = { ...emptyKitchenInterview, ...context.interview };
      const reconciled = mergeSettings(savedAnswers ?? emptyKitchenInterview, answers, latest);
      if (reconciled.conflicts.length) {
        setChangedContext({ interview: latest });
        throw new Error(
          'Your saved kitchen context changed elsewhere. Resolve overlapping answers before saving; your draft has been retained.',
        );
      }
      const interviewPatch = Object.fromEntries(
        Object.entries(reconciled.value).filter(
          ([key, value]) => value !== latest[key as keyof Answers] && value !== '',
        ),
      );
      const clearFields = Object.entries(reconciled.value)
        .filter(([key, value]) => value === '' && latest[key as keyof Answers] !== '')
        .map(([key]) => key);
      if (!Object.keys(interviewPatch).length && !clearFields.length) {
        setSavedAnswers(latest);
        setAnswers(latest);
        setStep(null);
        setMessage('Your saved answers are current. There are no changes to save.');
        return;
      }
      const response = await fetch('/api/v1/account/kitchen-context', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interviewPatch, clearFields, expectedRevision: context.revision }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Could not save your interview.');
      const acknowledged = { ...emptyKitchenInterview, ...body.interview };
      setSavedAnswers(acknowledged);
      setAnswers(acknowledged);
      setMessage(
        'Your kitchen context is saved. The assistant can use it when dietary preference sharing is enabled.',
      );
      setStep(null);
      router.refresh();
    } catch (e) {
      setError(true);
      setMessage(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <SettingsPane
      title="Kitchen interview"
      description="A guided questionnaire or a conversation with Kitchen Assistant. Review answers before saving."
      aria-busy={busy}
    >
      <p>
        A short interview about your tastes and routine. Your answers stay editable, and AI sharing
        follows your dietary preference settings.
      </p>
      {aiEnabled && (
        <>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setChatStarted(true);
              setChatOpen(true);
            }}
          >
            Chat with Kitchen Assistant
          </button>
          <p>
            Uses your configured AI chat provider. Your assistant will ask follow-up questions and
            offer a context summary for you to approve.
          </p>
        </>
      )}
      {chatStarted && (
        <InterviewChat
          open={chatOpen}
          interviewMode
          onClose={() => setChatOpen(false)}
          startNewThreadOnOpen
          initialDraft="Please interview me to get to know my food preferences and goals. Ask one question at a time, with useful follow-ups about sweet or savory flavors, snacks and when I snack, dessert favorites and frequency, meals I share, cooking routines, and foods I avoid. Read my saved kitchen context if sharing permits it. When we are done, prepare a reviewed update to my kitchen context. Treat taste preferences gently and always respect allergies."
        />
      )}
      {message && <InlineAlert tone={error ? 'error' : 'success'}>{message}</InlineAlert>}
      {changedContext && (
        <SettingsMergeReview
          key={JSON.stringify(changedContext)}
          baseline={savedAnswers ?? emptyKitchenInterview}
          draft={answers}
          current={changedContext.interview ?? emptyKitchenInterview}
          pending={busy}
          label={(path) =>
            kitchenInterviewQuestions.find((q) => q.key === path[0])?.title ?? path.join(' ')
          }
          onResolve={(merged) => {
            setSavedAnswers(changedContext.interview);
            setAnswers(merged);
            setChangedContext(null);
            setError(false);
            setMessage('Reviewed answers retained as a draft. Save context to apply them.');
          }}
          onDiscard={() => {
            setSavedAnswers(changedContext.interview);
            setAnswers(changedContext.interview ?? emptyKitchenInterview);
            setChangedContext(null);
            setError(false);
            setMessage('Current saved answers loaded.');
          }}
        />
      )}

      {step === null ? (
        <>
          <button
            className="secondary-button"
            onClick={() => {
              const dirty =
                JSON.stringify(answers) !== JSON.stringify(savedAnswers ?? emptyKitchenInterview);
              const unanswered = kitchenInterviewQuestions.findIndex((q) => !answers[q.key].trim());
              setStep(
                dirty
                  ? resumeStep.current
                  : savedAnswers || unanswered < 0
                    ? kitchenInterviewQuestions.length
                    : unanswered,
              );
              setMessage('');
            }}
          >
            {JSON.stringify(answers) !== JSON.stringify(savedAnswers ?? emptyKitchenInterview)
              ? 'Resume unsaved questionnaire'
              : savedAnswers
                ? 'Edit guided questionnaire'
                : 'Start guided questionnaire'}
          </button>
          {JSON.stringify(answers) !== JSON.stringify(savedAnswers ?? emptyKitchenInterview) && (
            <p role="status">
              Unsaved questionnaire answers are retained in this page. Resume to review and save
              them.
            </p>
          )}
          {savedAnswers && (
            <details>
              <summary>Your saved kitchen context</summary>
              <dl>
                {kitchenInterviewQuestions.map((q) => (
                  <div key={q.key}>
                    <dt>{q.title}</dt>
                    <dd>{savedAnswers[q.key] || 'Not answered'}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
        </>
      ) : (
        <fieldset disabled={busy}>
          {question ? (
            <>
              <p>
                For {profile.displayName} ·{' '}
                {kitchenInterviewQuestions.filter((q) => answers[q.key].trim()).length} topics have
                answers. Every topic is optional.
              </p>
              <p>
                {kitchenInterviewQuestions.map((q, index) => (
                  <button
                    type="button"
                    className="text-button"
                    key={q.key}
                    aria-current={index === step ? 'step' : undefined}
                    onClick={() => setStep(index)}
                  >
                    {
                      {
                        taste: 'Taste',
                        snacks: 'Snacks',
                        desserts: 'Desserts',
                        routine: 'Routine',
                        favorites: 'Favorites',
                        avoid: 'Practical needs',
                      }[q.key]
                    }
                    {answers[q.key].trim() ? ' ✓' : ''}
                  </button>
                ))}
              </p>
              <label htmlFor="interview-answer">
                <strong>{question.title}</strong>
              </label>
              <p id="interview-help">{question.help}</p>
              {question.key === 'desserts' && /sweet/i.test(answers.taste) && (
                <p>
                  You mentioned sweet flavors. Which treats do you enjoy, and how often would you
                  like them suggested?
                </p>
              )}
              <div className="button-row" aria-label="Optional answer suggestions">
                {{
                  taste: ['Mostly savory', 'A little of both', 'Sweet flavors'],
                  snacks: ['Fruit or yogurt', 'Savory snacks', 'I rarely snack'],
                  desserts: ['Occasionally', 'Most evenings', 'I usually skip dessert'],
                  routine: ['Shared dinners', 'Quick weekday meals', 'Flexible routines'],
                  favorites: ['Comfort food', 'Simple seasonal meals', 'Trying new cuisines'],
                  avoid: ['Short cooking time', 'A modest budget', 'Texture preferences'],
                }[question.key].map((suggestion) => (
                  <button
                    type="button"
                    className="secondary-button compact"
                    key={suggestion}
                    onClick={() => {
                      setAnswers((current) => ({
                        ...current,
                        [question.key]: current[question.key].trim()
                          ? `${current[question.key]}; ${suggestion}`
                          : suggestion,
                      }));
                      answerRef.current?.focus();
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              <textarea
                ref={answerRef}
                id="interview-answer"
                aria-describedby="interview-help"
                rows={4}
                maxLength={question.key === 'taste' ? 500 : 800}
                value={answers[question.key]}
                onChange={(e) => setAnswers({ ...answers, [question.key]: e.target.value })}
                style={{ width: '100%' }}
              />
            </>
          ) : (
            <>
              <h3 ref={reviewRef} tabIndex={-1}>
                Review kitchen context for {profile.displayName}
              </h3>
              <p>
                These stated preferences will be saved to your linked account profile. They do not
                change allergies or Nutrition consent.
              </p>
              <dl>
                {kitchenInterviewQuestions.map((q) => (
                  <div key={q.key}>
                    <dt>{q.title}</dt>
                    <dd>
                      {answers[q.key] || 'Not answered'}{' '}
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => setStep(kitchenInterviewQuestions.indexOf(q))}
                      >
                        Edit {q.key}
                      </button>
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          <div className="button-row">
            <button
              type="button"
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
            >
              Back
            </button>
            {question ? (
              <button className="secondary-button" type="button" onClick={() => setStep(step + 1)}>
                Continue
              </button>
            ) : (
              <button className="primary-button" type="button" onClick={() => void save()}>
                {busy && <ButtonSpinner />}Save context
              </button>
            )}
            {question && (
              <button className="text-button" type="button" onClick={() => setStep(step + 1)}>
                Skip this topic
              </button>
            )}
            <button className="text-button" type="button" onClick={() => setStep(null)}>
              Close
            </button>
          </div>
        </fieldset>
      )}
    </SettingsPane>
  );
}
