'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  DECISION_TASKS,
  type DecisionCard,
  type DecisionTask,
} from '@/lib/domain/decision-assistance';
import styles from './decision-assistance.module.css';

type Workspace = {
  recipes: { id: string; title: string }[];
  lists: { id: string; name: string }[];
  stores: { id: string; name: string }[];
};
async function api(body?: unknown, method = 'GET') {
  const response = await fetch('/api/v1/ai/decisions', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error?.message ?? 'Unable to load suggestions.');
  return value;
}
export function SuggestionCard({
  card,
  onChange,
  onApplied,
  disabled = false,
  headingLevel = 3,
  onChoose,
}: {
  onChoose?: (card: DecisionCard, choice: string) => void;
  headingLevel?: 3 | 4;
  disabled?: boolean;
  onApplied?: () => void;
  card: DecisionCard;
  onChange: (id: string, patch: Partial<DecisionCard>) => void;
}) {
  const CardHeading = headingLevel === 4 ? 'h4' : 'h3';
  const [choice, setChoice] = useState(card.choice);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  async function feedback(action: 'correct' | 'dismiss' | 'reset' | 'apply') {
    setPending(true);
    setMessage('');
    try {
      const result = await api(
        {
          id: card.id,
          version: card.version,
          action,
          choice,
          note,
          evidenceHash: card.evidenceHash,
        },
        'PATCH',
      );
      onChange(card.id, {
        version: result.version,
        choice,
        status: action === 'dismiss' ? 'dismissed' : action === 'reset' ? 'unknown' : 'corrected',
        confidence: null,
        reason:
          action === 'reset'
            ? 'Saved correction reset. Refresh suggestions to request a new decision.'
            : action === 'apply'
              ? 'Applied and remembered. Other suggestions cannot replace this correction.'
              : note || 'Your decision is saved and takes precedence.',
      });
      if (action === 'apply') onApplied?.();
      setMessage(action === 'apply' ? 'Applied to the source record.' : 'Saved.');
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save.');
      return false;
    } finally {
      setPending(false);
    }
  }
  return (
    <article className={styles.card}>
      <div className={styles.actions}>
        <span className={styles.badge}>
          {card.status === 'corrected'
            ? 'Your decision'
            : card.status === 'dismissed'
              ? 'Dismissed'
              : card.status === 'unknown'
                ? 'Needs clarification'
                : 'Suggestion'}
        </span>
        {card.cached && <small>Reused saved result</small>}
      </div>
      <CardHeading>{card.title}</CardHeading>
      <p>{card.reason}</p>
      {card.evidenceChanged && (
        <p className={styles.notice}>
          The evidence changed since your correction. Your choice is preserved; review it before
          applying.
        </p>
      )}
      <label className={styles.field}>
        Outcome
        <select
          value={choice}
          disabled={pending || disabled}
          onChange={(e) => {
            setChoice(e.target.value);
            onChange(card.id, { choice: e.target.value });
          }}
        >
          {card.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {card.confidence !== null && (
        <small className={styles.muted}>
          Model confidence: {Math.round(card.confidence * 100)}%. This is not a guarantee.
        </small>
      )}
      <label className={styles.field}>
        Your reason (optional)
        <input
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Help preserve why you chose this"
        />
      </label>
      <div className={styles.actions}>
        <button type="button" disabled={pending || disabled} onClick={() => feedback('correct')}>
          Remember my choice
        </button>
        {onChoose && card.task === 'pantry_input' && (
          <button
            type="button"
            className={styles.primary}
            disabled={pending || disabled || ['unknown', 'no_match'].includes(choice)}
            onClick={async () => {
              if (await feedback('correct')) onChoose(card, choice);
            }}
          >
            Use this product in the form
          </button>
        )}
        {card.apply && (
          <button
            type="button"
            className={styles.primary}
            disabled={pending || disabled || choice === 'unknown' || choice === 'no_match'}
            onClick={() => feedback('apply')}
          >
            Apply reviewed match
          </button>
        )}
        <button type="button" disabled={pending || disabled} onClick={() => feedback('dismiss')}>
          Dismiss
        </button>
        {card.status === 'corrected' || card.status === 'dismissed' ? (
          <button type="button" disabled={pending || disabled} onClick={() => feedback('reset')}>
            Reset my choice
          </button>
        ) : null}
        {card.href && (
          <Link className={styles.link} href={card.href}>
            Open source
          </Link>
        )}
      </div>
      <details>
        <summary>Evidence considered</summary>
        <div className={styles.evidence}>
          <p>
            Decision recorded {new Date(card.createdAt).toLocaleString()}. These are the current
            permitted source inputs, not an AI-written justification.
          </p>
          {card.evidence.map((e, i) => (
            <section key={i}>
              <strong>{e.label}</strong>
              <p>{e.source}</p>
              <pre>{typeof e.value === 'string' ? e.value : JSON.stringify(e.value, null, 2)}</pre>
            </section>
          ))}
        </div>
      </details>
      {message && <p role="status">{message}</p>}
    </article>
  );
}
type AssistanceProps = {
  initialTask?: DecisionTask;
  tasks?: DecisionTask[];
  recipeId?: string;
  listId?: string;
  storeId?: string;
  title?: string;
  description?: string;
  inputQuery?: string;
  onChoose?: (card: DecisionCard, choice: string) => void;
  embedded?: boolean;
  headingLevel?: 2 | 3;
  onApplied?: () => void;
};
export function DecisionAssistance({
  initialTask = 'aisles',
  tasks,
  recipeId: fixedRecipeId,
  listId: fixedListId,
  storeId: fixedStoreId,
  title,
  description,
  inputQuery,
  onChoose,
  embedded = false,
  headingLevel = 2,
  onApplied,
}: AssistanceProps) {
  const ContextHeading = headingLevel === 3 ? 'h3' : 'h2';
  const router = useRouter();
  const [expanded, setExpanded] = useState(!embedded);
  const [selected, setSelected] = useState<string[]>([]);
  function applied() {
    router.refresh();
    onApplied?.();
  }

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [task, setTask] = useState<DecisionTask>(initialTask);
  const [query, setQuery] = useState('');
  const [recipeId, setRecipeId] = useState(fixedRecipeId ?? '');
  const [listId, setListId] = useState(fixedListId ?? '');
  const [storeId, setStoreId] = useState(fixedStoreId ?? '');
  const [paid, setPaid] = useState(false);
  const [pending, setPending] = useState(false);
  const [cards, setCards] = useState<DecisionCard[]>([]);
  const [showDismissed, setShowDismissed] = useState(false);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  useEffect(() => {
    if (!expanded) return;
    let active = true;
    api()
      .then((data: Workspace) => {
        if (active) setWorkspace(data);
      })
      .catch((e: Error) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [expanded]);
  function clearResults() {
    setCards([]);
    setSelected([]);
    setNextOffset(null);
    setNotice('');
    setMessage('');
  }
  async function run(offset = 0) {
    setPending(true);
    setMessage('');
    try {
      const result = await api(
        {
          task,
          query: inputQuery ?? query,
          offset,
          ...(recipeId ? { recipeId } : {}),
          ...(listId ? { listId } : {}),
          ...(storeId ? { storeId } : {}),
          allowPaidCall: paid,
        },
        'POST',
      );
      if (!offset) setSelected([]);
      setCards((current) =>
        offset
          ? [
              ...current,
              ...result.cards.filter(
                (card: DecisionCard) => !current.some((existing) => existing.id === card.id),
              ),
            ]
          : result.cards,
      );
      setNextOffset(result.nextOffset);
      setNotice(result.notice);
      setMessage(
        result.paidRequests
          ? 'Suggestions ready. Review the evidence before applying.'
          : 'No OpenAI request was made. Any matching saved decisions are shown below.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to prepare suggestions.');
    } finally {
      setPending(false);
    }
  }
  async function applySelected() {
    setPending(true);
    const errors: string[] = [];
    let count = 0;
    for (const card of cards.filter(
      (c) => selected.includes(c.id) && c.apply && !['unknown', 'no_match'].includes(c.choice),
    )) {
      try {
        const result = await api(
          {
            id: card.id,
            version: card.version,
            action: 'apply',
            choice: card.choice,
            evidenceHash: card.evidenceHash,
            note: 'Reviewed in a bulk selection.',
          },
          'PATCH',
        );
        setCards((current) =>
          current.map((c) =>
            c.id === card.id
              ? {
                  ...c,
                  version: result.version,
                  status: 'corrected',
                  confidence: null,
                  reason: 'Applied and remembered.',
                }
              : c,
          ),
        );
        count++;
      } catch (error) {
        errors.push(`${card.title}: ${error instanceof Error ? error.message : 'Unable to apply'}`);
      }
    }
    setSelected([]);
    setMessage(`${count} matches applied.${errors.length ? ` ${errors.join(' ')}` : ''}`);
    setPending(false);
    if (count) applied();
  }
  const needsRecipe = [
    'ingredient_match',
    'recipe_review',
    'substitutions',
    'meal_rank',
    'cleanup',
  ].includes(task);
  const needsList = ['aisles', 'duplicates'].includes(task);
  return (
    <div className={embedded ? styles.embedded : styles.workspace}>
      {embedded && (
        <div className={styles.contextHeader}>
          <div>
            <span className={styles.badge}>ASSISTED REVIEW</span>
            <ContextHeading>{title ?? DECISION_TASKS[initialTask].label}</ContextHeading>
            <p>{description ?? DECISION_TASKS[initialTask].help}</p>
          </div>
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Close review' : 'Review here'}
          </button>
        </div>
      )}
      {expanded && (
        <>
          {!embedded && (
            <header className={styles.header}>
              <p className="eyebrow">KITCHEN ASSISTANCE</p>
              <h1>A useful next step.</h1>
              <p>
                Review suggestions grounded in your saved information. Your corrections are
                remembered and always take precedence.
              </p>
              <Link href="/settings/ai">Data sharing and AI settings</Link>
            </header>
          )}
          <section className={styles.panel}>
            <div className={styles.fields}>
              <label className={styles.field}>
                What would you like help with?
                <select
                  disabled={pending}
                  value={task}
                  onChange={(e) => {
                    setTask(e.target.value as DecisionTask);
                    setCards([]);
                    setNotice('');
                    setNextOffset(null);
                    setSelected([]);
                    setRecipeId(fixedRecipeId ?? '');
                    setListId(fixedListId ?? '');
                    setStoreId(fixedStoreId ?? '');
                  }}
                >
                  {Object.entries(DECISION_TASKS)
                    .filter(([id]) => !tasks || tasks.includes(id as DecisionTask))
                    .map(([id, value]) => (
                      <option key={id} value={id}>
                        {value.label}
                      </option>
                    ))}
                </select>
              </label>
              {needsRecipe && !fixedRecipeId && (
                <label className={styles.field}>
                  Recipe
                  <select
                    disabled={pending}
                    value={recipeId}
                    onChange={(e) => {
                      setRecipeId(e.target.value);
                      clearResults();
                    }}
                  >
                    <option value="">
                      {['meal_rank', 'cleanup', 'recipe_review'].includes(task)
                        ? 'Review saved recipes'
                        : 'Choose a recipe'}
                    </option>
                    {workspace?.recipes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {needsList && !fixedListId && (
                <label className={styles.field}>
                  Shopping list
                  <select
                    disabled={pending}
                    value={listId}
                    onChange={(e) => {
                      setListId(e.target.value);
                      clearResults();
                    }}
                  >
                    <option value="">Choose a list</option>
                    {workspace?.lists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {task === 'aisles' && !fixedListId && (
                <label className={styles.field}>
                  Store
                  <select
                    disabled={pending}
                    value={storeId}
                    onChange={(e) => {
                      setStoreId(e.target.value);
                      clearResults();
                    }}
                  >
                    <option value="">Use the list’s store</option>
                    {workspace?.stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <p className={styles.muted}>{DECISION_TASKS[task].help}</p>
            {inputQuery === undefined && (
              <label className={styles.field}>
                Details or preferences
                <textarea
                  disabled={pending}
                  value={query}
                  maxLength={2000}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    clearResults();
                  }}
                  placeholder={
                    task === 'nutrition_match'
                      ? 'Example: cooked brown rice, 150 g'
                      : task === 'substitutions'
                        ? 'Which ingredient would you like to replace?'
                        : 'Enter the item, or tell us what matters for this review'
                  }
                />
              </label>
            )}
            <label className={styles.check}>
              <input
                type="checkbox"
                disabled={pending}
                checked={paid}
                onChange={(e) => setPaid(e.target.checked)}
              />
              <span>
                Allow a paid OpenAI request for new suggestions. Saved decisions are reused when
                their evidence is unchanged.
              </span>
            </label>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                disabled={
                  pending ||
                  !workspace ||
                  (needsList && !listId) ||
                  (['ingredient_match', 'substitutions'].includes(task) && !recipeId) ||
                  (['nutrition_match', 'pantry_input', 'clarification', 'substitutions'].includes(
                    task,
                  ) &&
                    !(inputQuery ?? query).trim())
                }
                onClick={() => run()}
              >
                {pending ? 'Reviewing…' : 'Review suggestions'}
              </button>
              {task === 'aisles' && (
                <Link href="/settings/lists">Edit store route or upload a map</Link>
              )}
            </div>
            {!paid && (
              <small className={styles.muted}>
                With this unchecked, only existing cached results can be returned.
              </small>
            )}
          </section>
          {message && (
            <p className={styles.notice} role="status">
              {message}
            </p>
          )}
          {notice && <p>{notice}</p>}
          {cards.some((card) => card.status === 'dismissed') && (
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={showDismissed}
                onChange={(e) => setShowDismissed(e.target.checked)}
              />
              Show dismissed suggestions (
              {cards.filter((card) => card.status === 'dismissed').length})
            </label>
          )}
          {cards.some(
            (card) =>
              card.apply &&
              !['unknown', 'no_match'].includes(card.choice) &&
              card.status !== 'dismissed',
          ) && (
            <div className={styles.bulkBar}>
              <span>Select the matches you have reviewed below.</span>
              <button type="button" disabled={pending || !selected.length} onClick={applySelected}>
                Apply {selected.length || ''} selected matches
              </button>
            </div>
          )}
          {!embedded && cards.length > 0 && <h2>Review outcomes</h2>}
          <div className={styles.cards}>
            {cards
              .filter((card) => showDismissed || card.status !== 'dismissed')
              .map((card) => (
                <div key={`${card.id}:${card.evidenceHash}`}>
                  {card.apply &&
                    !['unknown', 'no_match'].includes(card.choice) &&
                    card.status !== 'dismissed' && (
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          disabled={pending}
                          checked={selected.includes(card.id)}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked
                                ? [...current, card.id]
                                : current.filter((id) => id !== card.id),
                            )
                          }
                        />
                        Include “{card.title}” in selected matches
                      </label>
                    )}
                  <SuggestionCard
                    headingLevel={embedded && headingLevel === 3 ? 4 : 3}
                    disabled={pending}
                    onApplied={applied}
                    onChoose={onChoose}
                    card={card}
                    onChange={(id, patch) => {
                      setSelected((current) => current.filter((value) => value !== id));
                      setCards((current) =>
                        current.map((c) => (c.id === id ? { ...c, ...patch } : c)),
                      );
                    }}
                  />
                </div>
              ))}
          </div>
          {nextOffset !== null && (
            <div className={styles.actions}>
              <button type="button" disabled={pending} onClick={() => run(nextOffset)}>
                Review next candidates
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
