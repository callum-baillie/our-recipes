'use client';
// Prop and answer shapes follow GlasscowUI's agent-question (QuestionPrompt) so the two stay
// interchangeable; the markup, keyboard handling and styling are native to this app.
import { ArrowRight, Check, MessageCircleQuestion, PencilLine } from 'lucide-react';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ButtonSpinner } from './skeleton';
import styles from './agent-questionnaire.module.css';

export type QuestionOption = {
  id: string;
  label: string;
  description?: string;
};

export type QuestionConfig = {
  kind: 'single' | 'multi' | 'text';
  title: string;
  description?: string;
  options?: QuestionOption[];
  allowCustom?: boolean;
  customLabel?: string;
  customPlaceholder?: string;
  minSelections?: number;
  maxSelections?: number;
  placeholder?: string;
};

export type QuestionAnswer = {
  kind: 'single' | 'multi' | 'text' | 'skip';
  selectedIds?: string[];
  text?: string;
};

const QUESTION_CUSTOM_ID = '__custom__';

export type QuestionPromptProps = {
  questions: QuestionConfig[];
  questionIndex?: number;
  totalQuestions?: number;
  onPreviousQuestion?: () => void;
  onNextQuestion?: () => void;
  initialAnswer?: QuestionAnswer;
  /** Label for the primary action on the last question (default "Send"). */
  submitLabel?: string;
  /** Label for the primary action when more questions follow (default "Next"). */
  nextLabel?: string;
  skipLabel?: string;
  allowSkip?: boolean;
  /** Locks the controls and shows progress on the primary action while the answer is sent. */
  busy?: boolean;
  /** Heading above the question, e.g. "Quick question". */
  eyebrow?: string;
  onSubmit: (answer: QuestionAnswer) => void;
  onSkip?: () => void;
  className?: string;
};

function QuestionPromptView({
  questions,
  questionIndex = 1,
  totalQuestions,
  onPreviousQuestion,
  onNextQuestion,
  submitLabel = 'Send',
  nextLabel = 'Next',
  skipLabel = 'Skip',
  allowSkip = true,
  busy = false,
  eyebrow = 'Quick question',
  initialAnswer,
  onSubmit,
  onSkip,
  className,
}: QuestionPromptProps) {
  const titleId = useId();
  const root = useRef<HTMLDivElement>(null);
  const customInput = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    initialAnswer?.kind === 'text' || initialAnswer?.kind === 'skip'
      ? []
      : [
          ...(initialAnswer?.selectedIds ?? []),
          ...(initialAnswer?.text ? [QUESTION_CUSTOM_ID] : []),
        ],
  );
  const [customText, setCustomText] = useState(
    initialAnswer?.kind === 'text' ? '' : (initialAnswer?.text ?? ''),
  );
  const [textValue, setTextValue] = useState(
    initialAnswer?.kind === 'text' ? (initialAnswer.text ?? '') : '',
  );
  const resolvedTotal = totalQuestions ?? questions.length;
  const clampedIndex = Math.max(1, Math.min(questionIndex, resolvedTotal));
  const activeQuestion = questions[clampedIndex - 1];
  const options = activeQuestion?.options ?? [];
  const customEnabled = activeQuestion?.allowCustom ?? false;
  const showNav = resolvedTotal > 1 && (!!onPreviousQuestion || !!onNextQuestion);
  const canGoPrev = clampedIndex > 1;
  const canGoNext = clampedIndex < resolvedTotal;
  const isLastQuestion = clampedIndex >= resolvedTotal;
  const primaryLabel = isLastQuestion ? submitLabel : nextLabel;

  const canSubmit = useMemo(() => {
    if (activeQuestion?.kind === 'text') return textValue.trim().length > 0;
    const selectedNonCustom = selectedIds.filter((id) => id !== QUESTION_CUSTOM_ID).length;
    const total = selectedNonCustom + (customText.trim().length > 0 ? 1 : 0);
    if (activeQuestion?.kind === 'single') return total === 1;
    const min = activeQuestion?.minSelections ?? 1;
    const max = activeQuestion?.maxSelections;
    if (total < min) return false;
    if (typeof max === 'number' && total > max) return false;
    return total > 0;
  }, [activeQuestion, selectedIds, customText, textValue]);

  if (!activeQuestion) return null;
  const single = activeQuestion.kind === 'single';
  const customSelected = selectedIds.includes(QUESTION_CUSTOM_ID);

  const choose = (id: string) => {
    if (single) {
      setSelectedIds([id]);
      setCustomText('');
    } else {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
      );
    }
  };

  const changeCustom = (value: string) => {
    setCustomText(value);
    const filled = value.trim().length > 0;
    setSelectedIds((prev) => {
      const rest = single ? [] : prev.filter((id) => id !== QUESTION_CUSTOM_ID);
      return filled ? [...rest, QUESTION_CUSTOM_ID] : rest;
    });
  };

  const submit = () => {
    if (!canSubmit || busy) return;
    if (activeQuestion.kind === 'text') {
      onSubmit({ kind: 'text', text: textValue.trim() });
      return;
    }
    onSubmit({
      kind: activeQuestion.kind,
      selectedIds: selectedIds.filter((id) => id !== QUESTION_CUSTOM_ID),
      text: customText.trim() || undefined,
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
    if (event.key === 'Enter' && typing && !event.nativeEvent.isComposing && !event.shiftKey) {
      if (target.tagName === 'TEXTAREA') return;
      event.preventDefault();
      submit();
      return;
    }
    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
    const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>('[data-option]') ?? [])];
    const current = buttons.indexOf(target as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!buttons.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      buttons[(Math.max(current, 0) + step + buttons.length) % buttons.length]?.focus();
      return;
    }
    // 1–9 pick the matching suggestion without leaving the keyboard.
    const index = Number.parseInt(event.key, 10) - 1;
    if (Number.isInteger(index) && index >= 0 && index < options.length) {
      event.preventDefault();
      choose(options[index].id);
      buttons[index]?.focus();
    }
  };

  return (
    <div
      ref={root}
      role="group"
      aria-labelledby={titleId}
      aria-busy={busy}
      className={[styles.prompt, className].filter(Boolean).join(' ')}
      onKeyDown={onKeyDown}
    >
      <div className={styles.head}>
        <span className={styles.eyebrow}>
          <MessageCircleQuestion aria-hidden="true" /> {eyebrow}
        </span>
        {resolvedTotal > 1 ? (
          <span
            className={styles.progress}
            aria-label={`Question ${clampedIndex} of ${resolvedTotal}`}
          >
            {Array.from({ length: resolvedTotal }, (_, index) => (
              <i key={index} data-done={index < clampedIndex} />
            ))}
          </span>
        ) : null}
      </div>
      <p id={titleId} className={styles.title}>
        {activeQuestion.title}
      </p>
      {activeQuestion.description ? (
        <p className={styles.description}>{activeQuestion.description}</p>
      ) : null}

      {activeQuestion.kind !== 'text' && options.length > 0 ? (
        <div className={styles.options}>
          {options.map((option, index) => {
            const checked = selectedIds.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                data-option
                aria-pressed={checked}
                disabled={busy}
                className={styles.option}
                onClick={() => choose(option.id)}
              >
                <span className={styles.badge} aria-hidden="true">
                  {checked ? <Check /> : index + 1}
                </span>
                <span className={styles.optionCopy}>
                  <span>{option.label}</span>
                  {option.description ? <small>{option.description}</small> : null}
                </span>
              </button>
            );
          })}
          {customEnabled ? (
            <label className={styles.custom} data-selected={customSelected}>
              <span className={styles.badge} aria-hidden="true">
                {customSelected ? <Check /> : <PencilLine />}
              </span>
              <input
                ref={customInput}
                aria-label={activeQuestion.customLabel ?? 'Your answer'}
                value={customText}
                disabled={busy}
                maxLength={160}
                onChange={(event) => changeCustom(event.target.value)}
                placeholder={activeQuestion.customPlaceholder ?? 'Type your answer'}
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {activeQuestion.kind === 'text' ? (
        <textarea
          aria-labelledby={titleId}
          className={styles.textarea}
          value={textValue}
          disabled={busy}
          onChange={(event) => setTextValue(event.target.value)}
          placeholder={activeQuestion.placeholder ?? 'Type your answer'}
          rows={3}
        />
      ) : null}

      <div className={styles.footer}>
        <span className={styles.hint} aria-hidden="true">
          {single ? 'Pick one, or write your own' : 'Pick any that apply'}
          <kbd>1–{Math.max(options.length, 1)}</kbd>
        </span>
        <div className={styles.footerActions}>
          {showNav && onPreviousQuestion ? (
            <button
              type="button"
              className={styles.quiet}
              onClick={onPreviousQuestion}
              disabled={!canGoPrev || busy}
            >
              Back
            </button>
          ) : null}
          {showNav && onNextQuestion && !isLastQuestion ? (
            <button
              type="button"
              className={styles.quiet}
              onClick={onNextQuestion}
              disabled={!canGoNext || busy}
            >
              Next
            </button>
          ) : null}
          {allowSkip ? (
            <button
              type="button"
              className={styles.quiet}
              disabled={busy}
              onClick={() => {
                onSkip?.();
                onSubmit({ kind: 'skip' });
              }}
            >
              {skipLabel}
            </button>
          ) : null}
          <button
            type="button"
            className={styles.send}
            onClick={submit}
            disabled={!canSubmit || busy}
          >
            {busy ? <ButtonSpinner /> : null}
            {busy ? 'Sending…' : primaryLabel}
            {busy ? null : <ArrowRight aria-hidden="true" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// Remount the editable form when moving between questions or restoring an answer.
export function QuestionPrompt(props: QuestionPromptProps) {
  return (
    <QuestionPromptView
      key={`${props.questionIndex ?? 1}:${JSON.stringify(props.initialAnswer ?? null)}`}
      {...props}
    />
  );
}
