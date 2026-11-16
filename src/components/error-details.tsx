'use client';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

/** Only pass diagnostics already approved for display; never raw provider bodies or server stacks. */
export function ErrorDetails({ message, details }: { message: string; details?: string }) {
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  const text = details ? `${message}\n\n${details}` : message;
  return (
    <div className="error-details">
      <button
        type="button"
        className="error-copy"
        aria-label={copied ? 'Error copied' : 'Copy error details'}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setManual(false);
          } catch {
            setManual(true);
          }
        }}
      >
        {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
        {copied ? 'Copied' : 'Copy error'}
      </button>
      {details ? (
        <details>
          <summary>Technical details</summary>
          <pre>{details}</pre>
        </details>
      ) : null}
      {manual ? (
        <label>
          Copy is unavailable here. Select and copy this text.
          <textarea
            aria-label="Error details to copy"
            readOnly
            value={text}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
      ) : null}
      <span className="sr-only" role="status">
        {copied ? 'Error details copied.' : ''}
      </span>
    </div>
  );
}
