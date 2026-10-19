'use client';
import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from 'react';
import { validLocale, validTimeZone } from '@/lib/domain/regional';

const locales = [
  ['en-US', 'English (United States)'],
  ['en-GB', 'English (United Kingdom)'],
  ['en-CA', 'English (Canada)'],
  ['en-AU', 'English (Australia)'],
  ['fr-FR', 'French (France)'],
  ['de-DE', 'German (Germany)'],
  ['es-ES', 'Spanish (Spain)'],
];
const zones = ['UTC', ...Intl.supportedValuesOf('timeZone')];
export function RegionalChoice({
  kind,
  onChange,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { kind: 'timezone' | 'locale' }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(String(props.defaultValue ?? ''));
  const current = String(props.value ?? draft);
  const familiar =
    kind === 'locale'
      ? (locales.find(([code]) => code === current)?.[1] ??
        (validLocale(current) ? 'Custom regional format · stored identifier retained' : ''))
      : current.replaceAll('_', ' ').replaceAll('/', ' · ');
  const validate = kind === 'timezone' ? validTimeZone : validLocale;
  const invalidMessage = `Choose a valid ${kind === 'timezone' ? 'time zone' : 'regional format'}.`;
  useEffect(() => {
    input.current?.setCustomValidity(validate(current) ? '' : invalidMessage);
  }, [current, validate, invalidMessage]);
  return (
    <>
      <input
        {...props}
        ref={input}
        aria-invalid={!validate(current) || undefined}
        aria-describedby={
          [props['aria-describedby'], !validate(current) ? `${id}-error` : null]
            .filter(Boolean)
            .join(' ') || undefined
        }
        list={id}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
          event.currentTarget.setCustomValidity(
            validate(event.currentTarget.value)
              ? ''
              : `Choose a valid ${kind === 'timezone' ? 'time zone' : 'regional format'}.`,
          );
          onChange?.(event);
        }}
      />
      <datalist id={id}>
        {kind === 'timezone'
          ? zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replaceAll('_', ' ').replaceAll('/', ' · ')}
              </option>
            ))
          : locales.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
      </datalist>
      {!validate(current) && (
        <small id={`${id}-error`} className="form-error" role="alert">
          {invalidMessage}
        </small>
      )}
      {familiar && <small className="settings-choice-value">{familiar}</small>}
    </>
  );
}
