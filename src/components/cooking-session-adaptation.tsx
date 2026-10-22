'use client';
import styles from './cooking-mode.module.css';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientUuid } from '@/lib/client/client-uuid';
import type { RecipeDetail } from '@/lib/services/recipe-service';
import { InlineAlert } from './inline-alert';

/** Manual review is also the fallback when no AI provider is available. */
export function CookingSessionAdaptation({
  recipe,
  sessionId,
  revision,
}: {
  recipe: RecipeDetail;
  sessionId: string;
  revision: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState(false);
  const [method, setMethod] = useState(recipe.cookingMethod);
  const [equipment, setEquipment] = useState(recipe.equipment.map((item) => item.name).join('\n'));
  const [sections, setSections] = useState(
    recipe.instructionSections.map((section) => ({
      title: section.title,
      steps: section.steps.map((step) => step.body),
    })),
  );
  const [capabilities, setCapabilities] = useState(
    recipe.equipmentRequirements.map((req) => req.capability),
  );
  const [times, setTimes] = useState({
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    restMinutes: recipe.restMinutes,
  });
  const [kitchenRevision, setKitchenRevision] = useState<number | null>(null);
  const [latestChange, setLatestChange] = useState<string | null>(null);
  const [operationId, setOperationId] = useState(createClientUuid);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function load() {
    setBusy(true);
    setMessage('');
    try {
      const [k, s] = await Promise.all([
        fetch('/api/v1/kitchen', { cache: 'no-store' }),
        fetch(`/api/v1/cook-sessions/${sessionId}/recipe`, { cache: 'no-store' }),
      ]);
      const [kitchen, snapshot] = await Promise.all([k.json(), s.json()]);
      if (!k.ok || !s.ok)
        throw new Error(
          kitchen.error?.message ?? snapshot.error?.message ?? 'Could not load the current review.',
        );
      if (snapshot.session.effectiveRevision !== revision)
        throw new Error(
          'This cooking snapshot changed. Reopen the session to review the latest version.',
        );
      setKitchenRevision(kitchen.kitchen.revision);
      setLatestChange(snapshot.session.latestChangeId ?? null);
      setOpen(true);
      setReview(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not prepare review.');
    } finally {
      setBusy(false);
    }
  }
  async function save(undo = false) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/v1/cook-sessions/${sessionId}/recipe`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: undo ? 'undo' : 'adapt',
          operationId,
          expectedRevision: revision,
          expectedKitchenRevision: kitchenRevision,
          ...(undo
            ? { undoOperationId: latestChange }
            : {
                change: {
                  cookingMethod: method,
                  equipment: equipment
                    .split('\n')
                    .map((value) => value.trim())
                    .filter(Boolean),
                  instructionSections: sections,
                  ...times,
                  equipmentRequirements: recipe.equipmentRequirements.map((req, index) => ({
                    ...req,
                    capability: capabilities[index],
                    alternativeCapabilities: [],
                  })),
                },
              }),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Could not save this session.');
      setMessage(undo ? 'Session change undone.' : 'Saved for this cooking session.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save this session.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={`cooking-pantry ${styles.episodePanel}`}
      aria-label="Adapt this cooking session"
    >
      <p>
        This cooking session has a saved recipe snapshot. Equipment use still requires a separate
        check.
      </p>
      <p>
        <a href={`/api/v1/recipes/${recipe.id}/export/pdf?sessionId=${sessionId}`}>
          Print this session’s recipe
        </a>
        {' · '}
        <a href={`/api/v1/recipes/${recipe.id}/export/markdown?sessionId=${sessionId}`}>
          Export this session as Markdown
        </a>
      </p>
      <p>
        <a href={`/my-kitchen/plan?sessionId=${sessionId}`}>
          Coordinate this meal with other recipes
        </a>
      </p>
      {message && <InlineAlert tone="info">{message}</InlineAlert>}
      {!open ? (
        <button className="secondary-button" disabled={busy} onClick={() => void load()}>
          Adapt this session
        </button>
      ) : (
        <>
          <p>
            Changes apply only to this session. Review the method, instructions, equipment and
            timing together.
          </p>
          <fieldset disabled={busy || review}>
            <label>
              Cooking method
              <input
                value={method}
                maxLength={80}
                onChange={(event) => {
                  setMethod(event.target.value);
                  setOperationId(createClientUuid());
                }}
              />
            </label>
            <label>
              Equipment (one item per line)
              <textarea
                value={equipment}
                onChange={(event) => {
                  setEquipment(event.target.value);
                  setOperationId(createClientUuid());
                }}
              />
            </label>
            {(['prepMinutes', 'cookMinutes', 'restMinutes'] as const).map((key, index) => (
              <label key={key}>
                {['Preparation minutes', 'Cooking minutes', 'Rest minutes'][index]}
                <input
                  type="number"
                  min={0}
                  max={10080}
                  value={times[key]}
                  onChange={(event) => {
                    setTimes({ ...times, [key]: Number(event.target.value) });
                    setOperationId(createClientUuid());
                  }}
                />
              </label>
            ))}
            {sections.map((section, i) => (
              <div key={i}>
                <p>{section.title || `Instructions ${i + 1}`}</p>
                {section.steps.map((step, j) => (
                  <label key={j}>
                    Step {j + 1}
                    <textarea
                      value={step}
                      onChange={(event) => {
                        setSections(
                          sections.map((s, n) =>
                            n === i
                              ? {
                                  ...s,
                                  steps: s.steps.map((body, m) =>
                                    m === j ? event.target.value : body,
                                  ),
                                }
                              : s,
                          ),
                        );
                        setOperationId(createClientUuid());
                      }}
                    />
                  </label>
                ))}
              </div>
            ))}
            {capabilities.map((capability, i) => (
              <label key={i}>
                Required capability {i + 1}
                <input
                  value={capability}
                  pattern="[a-z0-9-]+"
                  maxLength={80}
                  onChange={(event) => {
                    setCapabilities(
                      capabilities.map((value, n) => (n === i ? event.target.value : value)),
                    );
                    setOperationId(createClientUuid());
                  }}
                />
              </label>
            ))}
          </fieldset>
          {review ? (
            <>
              <p>
                Save {method || 'this method'} with{' '}
                {times.prepMinutes + times.cookMinutes + times.restMinutes} estimated minutes for
                this session only. Ingredients and library recipe stay as recorded. Check the
                revised equipment allocation before starting a phase.
              </p>
              <button className="secondary-button" disabled={busy} onClick={() => setReview(false)}>
                Back to edits
              </button>
              <button className="primary-button" disabled={busy} onClick={() => void save()}>
                Save this session only
              </button>
            </>
          ) : (
            <button
              className="primary-button"
              disabled={busy || kitchenRevision === null}
              onClick={() => setReview(true)}
            >
              Review session change
            </button>
          )}
          {latestChange && !review && (
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => {
                void save(true);
              }}
            >
              Undo latest session change
            </button>
          )}
          <button className="secondary-button" disabled={busy} onClick={() => setOpen(false)}>
            Close
          </button>
        </>
      )}
    </section>
  );
}
