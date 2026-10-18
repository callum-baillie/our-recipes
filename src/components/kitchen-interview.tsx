'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
const InterviewChat = dynamic(() =>
  import('./ai-assistant-drawer').then((module) => module.AiAssistantDrawer),
);
import { useRouter } from 'next/navigation';
import type { Profile } from './profile-settings';
import type { ProfileGoalContext } from '@/lib/domain/profile-goals';
import { InlineAlert } from './inline-alert';
import { ButtonSpinner } from './skeleton';

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
      help: 'Perhaps everyone shares dinner but has their own breakfast or lunch. Include cooking time and budget preferences.',
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
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>(
    profile.goalContext.kitchenInterview ?? emptyKitchenInterview,
  );
  const [step, setStep] = useState<number | null>(null);
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
      const response = await fetch('/api/v1/account/kitchen-context', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interview: answers, expectedRevision: context.revision }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Could not save your interview.');
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
    <section className="settings-card" aria-busy={busy}>
      <h2>Let your Kitchen Assistant get to know you more</h2>
      <p>
        A short interview about your tastes and routine. Your answers stay editable, and AI sharing
        follows your dietary preference settings.
      </p>
      {aiEnabled && (
        <>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setChatOpen(true)}
          >
            Interview me in chat
          </button>
          <p>
            Uses your configured AI chat provider. Your assistant will ask follow-up questions and
            offer a context summary for you to approve.
          </p>
        </>
      )}
      {chatOpen && (
        <InterviewChat
          open
          onClose={() => setChatOpen(false)}
          startNewThreadOnOpen
          initialDraft="Please interview me to get to know my food preferences and goals. Ask one question at a time, with useful follow-ups about sweet or savory flavors, snacks and when I snack, dessert favorites and frequency, meals I share, cooking routines, and foods I avoid. Read my saved kitchen context if sharing permits it. When we are done, prepare a reviewed update to my kitchen context. Treat taste preferences gently and always respect allergies."
        />
      )}
      {message && <InlineAlert tone={error ? 'error' : 'success'}>{message}</InlineAlert>}
      {step === null ? (
        <>
          <button
            className="button button-secondary"
            onClick={() => {
              setStep(0);
              setMessage('');
            }}
          >
            {profile.goalContext.kitchenInterview ? 'Redo my interview' : 'Start my interview'}
          </button>
          {profile.goalContext.kitchenInterview && (
            <details>
              <summary>Your saved kitchen context</summary>
              <dl>
                {kitchenInterviewQuestions.map((q) => (
                  <div key={q.key}>
                    <dt>{q.title}</dt>
                    <dd>{answers[q.key] || 'Not answered'}</dd>
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
                Question {step + 1} of {kitchenInterviewQuestions.length}
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
              <textarea
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
              <h3>Review your kitchen context</h3>
              <dl>
                {kitchenInterviewQuestions.map((q) => (
                  <div key={q.key}>
                    <dt>{q.title}</dt>
                    <dd>{answers[q.key] || 'Not answered'}</dd>
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
              <button type="button" onClick={() => setStep(step + 1)}>
                Continue
              </button>
            ) : (
              <button type="button" onClick={() => void save()}>
                {busy && <ButtonSpinner />}Save context
              </button>
            )}
            <button type="button" onClick={() => setStep(null)}>
              Close
            </button>
          </div>
        </fieldset>
      )}
    </section>
  );
}
