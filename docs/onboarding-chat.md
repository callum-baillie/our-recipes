# Onboarding chat

First-run setup and "add a profile" are one chat window (`src/components/onboarding-chat/`).
The script is plain data (`flow.ts`): questions, quick replies, validation and branching are pure
functions of `ChatState`, covered by `tests/unit/onboarding-chat-flow.test.ts`. Submission is
unchanged: the chat builds the same payload and posts it to `/api/v1/setup` or
`/api/v1/profiles/onboarding`, so server validation and trusted-origin checks are the same.

## Input types

| Input                 | Used for                                                                |
| --------------------- | ----------------------------------------------------------------------- |
| Text / textarea       | names, goals, interview answers (Enter sends, Shift+Enter newline)      |
| Password field        | the profile passphrase; echoed as dots, never stored in the transcript  |
| Quick replies / cards | units, roles, nutrition path, first recipe                              |
| Multi-select          | goals, dietary preferences, allergies, exclusions (plus "add your own") |
| Measurement           | height and weight with unit toggle, stored in canonical cm / kg         |
| Widgets               | kitchen icon, appearance, the VeSync sign-in card                       |

Every answer can be changed from the review card ("Change"), or with "Change my last answer".

## Assistant turns and privacy

The get-to-know-you section (goals plus the six kitchen-interview topics) mixes scripted questions
with optional AI replies. The assistant:

- is offered only when `OPENAI_API_KEY` is configured, and only after the person says yes in the chat;
- acknowledges the answer, may ask **one** follow-up per topic, and may report topics the person
  already covered in their own words so those questions are skipped;
- never decides what is saved: answers are stored verbatim and shown on the review card.

What can leave the browser is defined in one place, `src/lib/domain/onboarding-interview.ts`:
the question, the answer, earlier answers, goal choices, and dietary lists. The route
(`POST /api/v1/setup/interview`) validates a strict schema, so any extra field is rejected.
Free text is redacted client- and server-side (known passphrase and email, email addresses,
long digit runs, "my password is …"). Never sent: email, passphrase, birthday, height, weight,
scale credentials or readings, recovery codes.

Before the kitchen exists the route is open but rate limited (80 turns/hour for the whole instance,
small output cap). Afterwards it requires the household admin and AI access. If the assistant is
unavailable the chat continues with plain acknowledgements.

## Testing

Unit tests mock the provider (`tests/integration/onboarding-interview-route.test.ts`); no test
makes a live OpenAI call. End-to-end helpers live in `tests/e2e/helpers/onboarding.ts`
(`completeInitialOnboarding`, `completeProfileOnboarding`, `chatSay`, `chatPick`).
