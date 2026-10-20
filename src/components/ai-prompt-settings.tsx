'use client';
import { useRef, useState } from 'react';
import { SettingsMergeReview } from './settings-merge-review';
import {
  AI_PROMPT_DEFINITIONS,
  promptTemplateIssue,
  renderTaskGuidance,
  type AiPromptSnapshot,
} from '@/lib/domain/ai-prompts';
import { SettingsPane, SettingsField, SettingsActionBar } from './settings-primitives';

type Prompt = AiPromptSnapshot & { history: AiPromptSnapshot[] };
function PromptEditor({ initial }: { initial: Prompt }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial.template);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [operation, setOperation] = useState('');
  const [conflict, setConflict] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [current, setCurrent] = useState<Prompt | null>(null);
  const definition = AI_PROMPT_DEFINITIONS[initial.workload];
  const dirty = draft !== saved.template;
  const issue = promptTemplateIssue(draft);
  async function compareCurrent() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setOperation('Loading current guidance…');
    setCurrent(null);
    setError('');
    try {
      const response = await fetch('/api/v1/ai/prompts', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error?.message ?? 'Current guidance could not be loaded.');
      const loaded = data.prompts.find((item: Prompt) => item.workload === initial.workload);
      if (!loaded)
        throw new Error('This task guidance is no longer available. Your draft is retained.');
      setConflict(true);
      setCurrent(loaded);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load current guidance.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function olderVersions() {
    const before = saved.history.at(-1)?.version;
    if (!before || lock.current) return;
    lock.current = true;
    setBusy(true);
    setOperation('Loading earlier guidance…');
    setError('');
    try {
      const response = await fetch(
        `/api/v1/ai/prompts?workload=${initial.workload}&before=${before}`,
        { cache: 'no-store' },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error?.message ?? 'Older versions could not be loaded.');
      setSaved((previous) => ({ ...previous, history: [...previous.history, ...data.history] }));
      if (!data.history.length) setMessage('All saved versions are shown.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Older versions could not be loaded.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || conflict || !dirty) return;
    lock.current = true;
    setBusy(true);
    setOperation('Saving guidance…');
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/v1/ai/prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workload: initial.workload,
          expectedVersion: saved.version,
          template: draft,
          changeNote: note,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          setConflict(true);
          setCurrent(null);
        }
        throw new Error(data.error?.message ?? 'Guidance could not be saved.');
      }
      setSaved({ ...data.prompt, history: [data.prompt, ...saved.history] });
      setDraft(data.prompt.template);
      setNote('');
      setCurrent(null);
      setMessage(`Version ${data.prompt.version} saved for ${definition.title}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save guidance.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <details className="settings-subsection">
      <summary>
        {definition.title} · {saved.version ? `version ${saved.version}` : 'built-in'}
        {dirty ? ' · Unsaved changes' : ''}
      </summary>
      <form onSubmit={save}>
        <p>{definition.purpose}</p>
        <p>
          <strong>Input:</strong> {definition.input}
          <br />
          <strong>Output contract:</strong> {definition.output}
        </p>
        <fieldset disabled={busy || conflict} style={{ border: 0, padding: 0, margin: 0 }}>
          <SettingsField
            title="Task guidance"
            description="Installation-wide. {{task}} is the only supported variable. Permissions, sharing, required review and structured output validation remain enforced by the server."
          >
            <textarea
              rows={6}
              maxLength={6000}
              value={draft}
              aria-invalid={Boolean(issue)}
              aria-describedby={`prompt-${initial.workload}-issue`}
              onChange={(event) => {
                setDraft(event.target.value);
                setMessage('');
              }}
              required
            />
          </SettingsField>
          <p id={`prompt-${initial.workload}-issue`}>{issue ?? 'Template variables are valid.'}</p>
          <SettingsField title="Reason for this version">
            <input
              value={note}
              minLength={3}
              maxLength={400}
              onChange={(event) => setNote(event.target.value)}
              required
            />
          </SettingsField>
          <details>
            <summary>Preview with synthetic example</summary>
            <p>{definition.example}</p>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {renderTaskGuidance(initial.workload, draft)}
            </pre>
            <p>No request is sent. This preview contains no private records.</p>
          </details>
          <details>
            <summary>Compare with saved guidance</summary>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{saved.template}</pre>
          </details>
          <button
            type="button"
            className="button-secondary"
            onClick={() => {
              setDraft(definition.defaultTemplate);
              setNote('Restore built-in task guidance');
              setMessage('Built-in guidance copied to draft. Save to activate.');
            }}
          >
            Use built-in guidance
          </button>
          {saved.history.length > 0 && (
            <details>
              <summary>Version history and rollback</summary>
              {saved.history.map((version) => (
                <article key={version.version}>
                  <h4>Version {version.version}</h4>
                  <p>
                    {version.changeNote} ·{' '}
                    {version.createdAt && new Date(version.createdAt).toLocaleString()}
                  </p>
                  <pre style={{ whiteSpace: 'pre-wrap' }}>{version.template}</pre>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => {
                      setDraft(version.template);
                      setNote(`Restore guidance from version ${version.version}`);
                      setMessage('Earlier guidance copied to draft. Save to create a new version.');
                    }}
                  >
                    Use version {version.version} as draft
                  </button>
                </article>
              ))}
              {saved.history.at(-1)?.version !== 1 && saved.history.length >= 10 && (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => void olderVersions()}
                >
                  Show older versions
                </button>
              )}
            </details>
          )}
        </fieldset>
        {error && (
          <div role="alert">
            <p>{error}</p>
            <button type="button" disabled={busy} onClick={() => void compareCurrent()}>
              Load current version to compare
            </button>
          </div>
        )}
        {current && (
          <SettingsMergeReview
            key={JSON.stringify(current)}
            baseline={{ template: saved.template }}
            draft={{ template: draft }}
            current={{ template: current.template }}
            pending={busy}
            label={() => 'Task guidance'}
            onResolve={(reviewed) => {
              setSaved(current);
              setDraft(reviewed.template);
              setCurrent(null);
              setConflict(false);
              setError('');
              setMessage('Reviewed guidance is ready. Save explicitly to activate a new version.');
            }}
            onDiscard={() => {
              setSaved(current);
              setDraft(current.template);
              setCurrent(null);
              setConflict(false);
              setError('');
              setNote('');
            }}
          />
        )}
        <SettingsActionBar
          status={
            busy ? operation : message || (dirty ? 'Unsaved task guidance' : 'Saved guidance')
          }
        >
          <button
            className="button-primary"
            disabled={busy || conflict || !dirty || Boolean(issue) || note.trim().length < 3}
          >
            Save {definition.title} guidance
          </button>
        </SettingsActionBar>
      </form>
    </details>
  );
}
export function AiPromptSettings({ initial }: { initial: Prompt[] }) {
  return (
    <SettingsPane
      id="prompt-guidance"
      title="Task guidance and versions"
      description="Review the guidance used for each AI workload. Personal style follows these settings; server permissions and output contracts take precedence."
    >
      {initial.map((prompt) => (
        <PromptEditor key={prompt.workload} initial={prompt} />
      ))}
    </SettingsPane>
  );
}
