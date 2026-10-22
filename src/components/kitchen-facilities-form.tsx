'use client';
import { useState } from 'react';
import type { KitchenState, KitchenCommand, KitchenConstraints } from '@/lib/domain/kitchen';
import { createClientUuid } from '@/lib/client/client-uuid';
import styles from './my-kitchen.module.css';
export function KitchenFacilitiesForm({
  kitchen,
  disabled,
  onSave,
}: {
  kitchen: KitchenState;
  disabled: boolean;
  onSave: (command: KitchenCommand) => Promise<KitchenState | null>;
}) {
  const [name, setName] = useState(kitchen.name);
  const [constraints, setConstraints] = useState<KitchenConstraints>(
    kitchen.constraints ?? { preparationSpace: 'unknown', equipmentStorage: 'unknown' },
  );
  const [revision, setRevision] = useState(kitchen.revision);
  const [baseline, setBaseline] = useState({
    name: kitchen.name,
    constraints: kitchen.constraints ?? constraints,
  });
  const [message, setMessage] = useState('');
  const [intent, setIntent] = useState(createClientUuid);
  const change = (key: keyof KitchenConstraints, value: KitchenConstraints[typeof key]) => {
    setConstraints({ ...constraints, [key]: value });
    setIntent(createClientUuid());
  };
  async function save() {
    const saved = await onSave({
      kind: 'setup',
      operationId: intent,
      expectedRevision: revision,
      name,
      constraints,
    });
    if (!saved) {
      setMessage('This setup draft is not saved. Keep your edits and review the latest kitchen.');
      return;
    }
    setRevision(saved.revision);
    setBaseline({ name: saved.name, constraints: saved.constraints ?? constraints });
    setName(saved.name);
    setConstraints(saved.constraints ?? constraints);
    setIntent(createClientUuid());
    setMessage('Shared cooking setup saved.');
  }
  return (
    <section className="settings-card">
      <h2>Cooking setup · Shared with your household</h2>
      <p>
        Record only useful physical constraints. “Not sure” remains unknown. Dietary and personal
        preferences stay in their existing account settings.
      </p>
      <fieldset disabled={disabled || !kitchen.canManage}>
        <label>
          Primary kitchen name
          <input
            value={name}
            maxLength={80}
            onChange={(event) => {
              setName(event.target.value);
              setIntent(createClientUuid());
            }}
          />
        </label>
        <div className={styles.fields}>
          {(['preparationSpace', 'equipmentStorage'] as const).map((key) => (
            <label key={key}>
              {key === 'preparationSpace'
                ? 'Counter and preparation space'
                : 'Practical equipment storage'}
              <select
                value={constraints[key]}
                onChange={(event) =>
                  change(key, event.target.value as KitchenConstraints[typeof key])
                }
              >
                <option value="unknown">Not sure / not recorded</option>
                <option value="limited">Limited</option>
                <option value="standard">Enough for usual cooking</option>
              </select>
            </label>
          ))}
        </div>
        {revision !== kitchen.revision && (
          <section aria-label="Review shared setup conflict">
            <h3>Review latest setup before saving</h3>
            <p>
              Your draft is retained. Equipment or shared setup changed after you opened this form.
            </p>
            <table className={styles.reviewTable}>
              <thead>
                <tr>
                  <th>Setting</th>
                  <th>When opened</th>
                  <th>Your draft</th>
                  <th>Current saved</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>Kitchen name</th>
                  <td>{baseline.name}</td>
                  <td>{name}</td>
                  <td>{kitchen.name}</td>
                </tr>
                {(['preparationSpace', 'equipmentStorage'] as const).map((key) => (
                  <tr key={key}>
                    <th>
                      {key === 'preparationSpace' ? 'Preparation space' : 'Equipment storage'}
                    </th>
                    <td>{label(baseline.constraints[key])}</td>
                    <td>{label(constraints[key])}</td>
                    <td>{label(kitchen.constraints?.[key] ?? 'unknown')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              className="secondary-button"
              onClick={() => {
                setRevision(kitchen.revision);
                setBaseline({
                  name: kitchen.name,
                  constraints: kitchen.constraints ?? {
                    preparationSpace: 'unknown',
                    equipmentStorage: 'unknown',
                  },
                });
                setIntent(createClientUuid());
                setMessage('Latest setup reviewed. Your draft is ready for an explicit save.');
              }}
            >
              Keep my setup edits against these reviewed values
            </button>
          </section>
        )}
        <div className={styles.actions}>
          <button className="primary-button" onClick={() => void save()}>
            Save shared cooking setup
          </button>
          <button
            className="secondary-button"
            onClick={() => {
              setName(kitchen.name);
              setConstraints(
                kitchen.constraints ?? { preparationSpace: 'unknown', equipmentStorage: 'unknown' },
              );
              setRevision(kitchen.revision);
              setBaseline({
                name: kitchen.name,
                constraints: kitchen.constraints ?? {
                  preparationSpace: 'unknown',
                  equipmentStorage: 'unknown',
                },
              });
              setIntent(createClientUuid());
              setMessage('Loaded current setup. Unsaved setup edits discarded.');
            }}
          >
            Discard setup edits and load current values
          </button>
        </div>
      </fieldset>
      {!kitchen.canManage && <p>A parent or administrator can change shared setup facts.</p>}
      <p role="status">{message}</p>
    </section>
  );
}

function label(value: KitchenConstraints['preparationSpace']) {
  return value === 'limited'
    ? 'Limited'
    : value === 'standard'
      ? 'Enough for usual cooking'
      : 'Not recorded';
}
