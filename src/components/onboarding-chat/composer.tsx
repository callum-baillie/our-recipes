'use client';

import {
  BookOpen,
  Check,
  Clock,
  Eye,
  EyeOff,
  Import,
  Link2,
  Pencil,
  Plus,
  SendHorizontal,
  WandSparkles,
  X,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import {
  onboardingHeightCentimeters,
  onboardingWeightKilograms,
  type OnboardingMeasurementUnit,
} from '@/lib/domain/setup';

import type { Answer, ChoiceOption, InputSpec } from './flow';
import styles from './onboarding-chat.module.css';

const optionIcons: Record<string, typeof Link2> = {
  link: Link2,
  pencil: Pencil,
  clock: Clock,
  book: BookOpen,
  wand: WandSparkles,
  import: Import,
};

type ComposerProps = {
  spec: InputSpec;
  validate: (answer: Answer) => string | null;
  onAnswer: (answer: Answer) => void;
  renderWidget: (widget: 'icon' | 'look' | 'vesync', submit: (answer: Answer) => void) => ReactNode;
  renderReview: () => ReactNode;
};

export function Composer({ spec, validate, onAnswer, renderWidget, renderReview }: ComposerProps) {
  switch (spec.kind) {
    case 'text':
      return <TextComposer spec={spec} validate={validate} onAnswer={onAnswer} />;
    case 'choice':
      return <ChoiceComposer spec={spec} validate={validate} onAnswer={onAnswer} />;
    case 'multi':
      return <MultiComposer spec={spec} onAnswer={onAnswer} />;
    case 'measure':
      return <MeasureComposer spec={spec} validate={validate} onAnswer={onAnswer} />;
    case 'widget':
      return <>{renderWidget(spec.widget, onAnswer)}</>;
    case 'review':
      return <>{renderReview()}</>;
  }
}

/* ------------------------------------------------------------------ */

function TextComposer({
  spec,
  validate,
  onAnswer,
}: {
  spec: Extract<InputSpec, { kind: 'text' }>;
  validate: ComposerProps['validate'];
  onAnswer: ComposerProps['onAnswer'];
}) {
  const [value, setValue] = useState(spec.initial ?? '');
  const [error, setError] = useState('');
  const [reveal, setReveal] = useState(false);
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const hintId = useId();
  const errorId = useId();
  const multiline = spec.inputType === 'textarea';
  const secret = spec.inputType === 'password';

  useEffect(() => {
    field.current?.focus({ preventScroll: true });
  }, []);

  function send(raw: string) {
    const text = secret ? raw : raw.trim();
    if (!text.trim()) {
      if (!spec.optional) setError('This one is needed to continue.');
      return;
    }
    const answer: Answer = { kind: 'text', value: text };
    const message = validate(answer);
    if (message) {
      setError(message);
      field.current?.focus();
      return;
    }
    setError('');
    onAnswer(answer);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send(value);
    }
  }

  const shared = {
    ref: field,
    name: spec.name,
    'aria-label': spec.label,
    'aria-describedby':
      [spec.hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined,
    'aria-invalid': error ? true : undefined,
    value,
    placeholder: spec.placeholder ?? (multiline ? 'Type your answer…' : undefined),
    maxLength: spec.maxLength,
    autoComplete: spec.autoComplete,
    onChange: (event: { target: { value: string } }) => {
      setValue(event.target.value);
      if (error) setError('');
    },
  };

  return (
    <form
      className={styles.composerForm}
      onSubmit={(event) => {
        event.preventDefault();
        send(value);
      }}
      noValidate
    >
      {spec.suggestions?.length ? (
        <div className={styles.chips} role="group" aria-label="Quick replies">
          {spec.suggestions.map((suggestion) => (
            <button
              className={styles.chip}
              type="button"
              key={suggestion}
              onClick={() => onAnswer({ kind: 'text', value: suggestion })}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
      {error ? (
        <p className={styles.fieldError} id={errorId} role="alert">
          {error}
        </p>
      ) : spec.hint ? (
        <p className={styles.fieldHint} id={hintId}>
          {spec.hint}
        </p>
      ) : null}
      <div className={styles.inputRow}>
        {multiline ? (
          <textarea
            {...shared}
            rows={2}
            onKeyDown={onKeyDown}
            className={styles.input}
            enterKeyHint="send"
          />
        ) : (
          <input
            {...shared}
            type={secret && reveal ? 'text' : spec.inputType}
            minLength={spec.minLength}
            className={styles.input}
            enterKeyHint="send"
            spellCheck={spec.inputType === 'text' ? undefined : false}
            autoCapitalize={spec.inputType === 'text' ? undefined : 'none'}
            max={spec.inputType === 'date' ? new Date().toISOString().slice(0, 10) : undefined}
          />
        )}
        {secret ? (
          <button
            className={styles.iconButton}
            type="button"
            aria-label={reveal ? 'Hide passphrase' : 'Show passphrase'}
            aria-pressed={reveal}
            onClick={() => setReveal((current) => !current)}
          >
            {reveal ? (
              <EyeOff size={18} aria-hidden="true" />
            ) : (
              <Eye size={18} aria-hidden="true" />
            )}
          </button>
        ) : null}
        <button className={styles.send} type="submit" aria-label="Send">
          <SendHorizontal size={18} aria-hidden="true" />
        </button>
      </div>
      {spec.optional ? (
        <button className={styles.skip} type="button" onClick={() => onAnswer({ kind: 'skip' })}>
          {spec.skipLabel ?? 'Skip'}
        </button>
      ) : null}
    </form>
  );
}

/* ------------------------------------------------------------------ */

function OptionButton({
  option,
  layout,
  onPick,
}: {
  option: ChoiceOption;
  layout: 'chips' | 'cards';
  onPick: () => void;
}) {
  const Icon = option.icon ? optionIcons[option.icon] : undefined;
  if (layout === 'chips') {
    return (
      <button className={styles.chip} type="button" onClick={onPick}>
        {option.label}
      </button>
    );
  }
  return (
    <button className={styles.optionCard} type="button" onClick={onPick}>
      {Icon ? (
        <span className={styles.optionIcon} aria-hidden="true">
          <Icon size={19} />
        </span>
      ) : null}
      <span className={styles.optionCopy}>
        <strong>{option.label}</strong>
        {option.description ? <small>{option.description}</small> : null}
      </span>
    </button>
  );
}

function ChoiceComposer({
  spec,
  validate,
  onAnswer,
}: {
  spec: Extract<InputSpec, { kind: 'choice' }>;
  validate: ComposerProps['validate'];
  onAnswer: ComposerProps['onAnswer'];
}) {
  const [error, setError] = useState('');
  const first = useRef<HTMLDivElement>(null);
  useEffect(() => {
    first.current?.querySelector('button')?.focus({ preventScroll: true });
  }, []);
  return (
    <div className={styles.choiceBlock}>
      {error ? (
        <p className={styles.fieldError} role="alert">
          {error}
        </p>
      ) : null}
      <div
        ref={first}
        className={spec.layout === 'cards' ? styles.cards : styles.chips}
        role="group"
        aria-label={spec.label}
      >
        {spec.options.map((option) => (
          <OptionButton
            key={option.value || option.label}
            option={option}
            layout={spec.layout}
            onPick={() => {
              const answer: Answer = { kind: 'choice', value: option.value, label: option.label };
              const message = validate(answer);
              if (message) setError(message);
              else onAnswer(answer);
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MultiComposer({
  spec,
  onAnswer,
}: {
  spec: Extract<InputSpec, { kind: 'multi' }>;
  onAnswer: ComposerProps['onAnswer'];
}) {
  const [selected, setSelected] = useState<string[]>(spec.initial);
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState('');
  const known = new Set(spec.options.map((option) => option.value));
  const extras = selected.filter((value) => !known.has(value));
  const atLimit = spec.max !== undefined && selected.length >= spec.max;
  const described = spec.options.some((option) => option.description);

  function toggle(value: string) {
    setNote('');
    setSelected((current) => {
      if (current.includes(value)) return current.filter((item) => item !== value);
      if (spec.max !== undefined && current.length >= spec.max) {
        setNote(`You can choose up to ${spec.max}.`);
        return current;
      }
      return [...current, value];
    });
  }

  function addCustom() {
    const text = custom.trim().slice(0, 120);
    if (!text) return;
    if (!selected.some((item) => item.toLocaleLowerCase() === text.toLocaleLowerCase())) {
      if (atLimit) {
        setNote(`You can choose up to ${spec.max}.`);
        return;
      }
      setSelected((current) => [...current, text]);
    }
    setCustom('');
  }

  return (
    <div className={styles.choiceBlock}>
      <div className={styles.optionScroll}>
        <div
          className={described ? styles.multiGrid : styles.chips}
          role="group"
          aria-label={spec.label}
        >
          {spec.options.map((option) => {
            const on = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                className={`${described ? styles.optionCard : styles.chip} ${on ? styles.on : ''}`}
                aria-pressed={on}
                disabled={!on && atLimit}
                onClick={() => toggle(option.value)}
              >
                {described ? (
                  <span className={styles.optionCopy}>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                ) : (
                  option.label
                )}
                {on ? <Check size={15} strokeWidth={3} aria-hidden="true" /> : null}
              </button>
            );
          })}
          {extras.map((value) => (
            <button
              key={value}
              type="button"
              className={`${styles.chip} ${styles.on}`}
              aria-label={`Remove ${value}`}
              onClick={() => toggle(value)}
            >
              {value}
              <X size={14} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
      {note ? (
        <p className={styles.fieldHint} role="status">
          {note}
        </p>
      ) : null}
      <div className={styles.inputRow}>
        {spec.customLabel ? (
          <>
            <input
              className={styles.input}
              aria-label={spec.customLabel}
              placeholder={spec.customLabel}
              value={custom}
              maxLength={120}
              onChange={(event) => setCustom(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addCustom();
                }
              }}
            />
            <button
              className={styles.iconButton}
              type="button"
              aria-label="Add"
              disabled={!custom.trim()}
              onClick={addCustom}
            >
              <Plus size={18} aria-hidden="true" />
            </button>
          </>
        ) : (
          <span className={styles.grow} />
        )}
        <button
          className={`${styles.doneButton} ${styles.cta}`}
          type="button"
          onClick={() => {
            const pending = custom.trim();
            const values =
              pending && !selected.includes(pending) && !atLimit
                ? [...selected, pending]
                : selected;
            onAnswer({ kind: 'multi', values });
          }}
        >
          {selected.length || custom.trim() ? spec.doneLabel : spec.emptyLabel}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MeasureComposer({
  spec,
  validate,
  onAnswer,
}: {
  spec: Extract<InputSpec, { kind: 'measure' }>;
  validate: ComposerProps['validate'];
  onAnswer: ComposerProps['onAnswer'];
}) {
  const [unit, setUnit] = useState<OnboardingMeasurementUnit>(spec.units);
  const [primary, setPrimary] = useState('');
  const [secondary, setSecondary] = useState('');
  const [error, setError] = useState('');
  const first = useRef<HTMLInputElement>(null);
  const height = spec.measure === 'height';
  useEffect(() => {
    first.current?.focus({ preventScroll: true });
  }, []);

  function send() {
    const value = height
      ? onboardingHeightCentimeters(unit, primary, secondary)
      : onboardingWeightKilograms(unit, primary);
    if (value === null || (height ? value > 300 : value > 1000)) {
      setError(height ? 'Enter a valid height.' : 'Enter a valid weight.');
      first.current?.focus();
      return;
    }
    const label = height
      ? unit === 'imperial'
        ? `${primary || 0} ft ${secondary || 0} in`
        : `${primary} cm`
      : `${primary} ${unit === 'imperial' ? 'lb' : 'kg'}`;
    const answer: Answer = { kind: 'measure', value, label };
    const message = validate(answer);
    if (message) {
      setError(message);
      return;
    }
    setError('');
    onAnswer(answer);
  }

  const unitLabels = height
    ? ([
        ['imperial', 'Feet & inches'],
        ['metric', 'Centimetres'],
      ] as const)
    : ([
        ['imperial', 'Pounds'],
        ['metric', 'Kilograms'],
      ] as const);

  return (
    <form
      className={styles.composerForm}
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
      noValidate
    >
      <div className={styles.chips}>
        <div className={styles.segmented} role="group" aria-label={`${spec.label} units`}>
          {unitLabels.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={unit === value}
              onClick={() => {
                setUnit(value);
                setPrimary('');
                setSecondary('');
                setError('');
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {spec.suggestions?.map((suggestion) => (
          <button
            key={suggestion.label}
            className={styles.chip}
            type="button"
            onClick={() =>
              onAnswer({
                kind: 'measure',
                value: suggestion.kilograms,
                label: suggestion.label.replace(/^Use /u, ''),
              })
            }
          >
            {suggestion.label}
          </button>
        ))}
      </div>
      {error ? (
        <p className={styles.fieldError} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.inputRow}>
        {height && unit === 'imperial' ? (
          <>
            <label className={styles.unitField}>
              <input
                ref={first}
                className={styles.input}
                type="number"
                inputMode="numeric"
                min="0"
                max="9"
                step="1"
                aria-label="Feet"
                value={primary}
                onChange={(event) => setPrimary(event.target.value)}
              />
              <span>ft</span>
            </label>
            <label className={styles.unitField}>
              <input
                className={styles.input}
                type="number"
                inputMode="decimal"
                min="0"
                max="11.99"
                step="any"
                aria-label="Inches"
                value={secondary}
                onChange={(event) => setSecondary(event.target.value)}
              />
              <span>in</span>
            </label>
          </>
        ) : (
          <label className={styles.unitField}>
            <input
              ref={first}
              className={styles.input}
              type="number"
              inputMode="decimal"
              min="0.1"
              step="any"
              aria-label={height ? 'Height in centimetres' : spec.label}
              value={primary}
              onChange={(event) => setPrimary(event.target.value)}
            />
            <span>{height ? 'cm' : unit === 'imperial' ? 'lb' : 'kg'}</span>
          </label>
        )}
        <button className={styles.send} type="submit" aria-label="Send">
          <SendHorizontal size={18} aria-hidden="true" />
        </button>
      </div>
      {spec.skipLabel ? (
        <button className={styles.skip} type="button" onClick={() => onAnswer({ kind: 'skip' })}>
          {spec.skipLabel}
        </button>
      ) : null}
    </form>
  );
}
