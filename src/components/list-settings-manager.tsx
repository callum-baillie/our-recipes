'use client';

import {
  Archive,
  ArrowDown,
  ArrowUp,
  Copy,
  GripVertical,
  Info,
  Plus,
  RotateCcw,
  Save,
  Store,
  Trash2,
} from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';

import { InlineSkeleton } from '@/components/skeleton';
import { useToast } from '@/components/toast-provider';

import styles from './list-settings-manager.module.css';

type Settings = {
  defaultSupermarketProfileId: string | null;
  completedItemsBehavior: 'completed_section' | 'hide' | 'in_place';
  openPantryPurchaseOnCheck: boolean;
  keepScreenAwake: boolean;
};

type Section = {
  id?: string;
  aisleId: string;
  name: string;
  position?: number;
  matchTerms: string[];
};

type Profile = {
  id: string;
  name: string;
  locationLabel: string;
  notes: string;
  archivedAt: string | Date | null;
  sections: Section[];
};

type Workspace = { settings: Settings; profiles: Profile[] };

type ProfileDraft = {
  id: string | null;
  name: string;
  locationLabel: string;
  notes: string;
  archived: boolean;
  sections: Section[];
};

const starterSections: Section[] = [
  { aisleId: '', name: 'Fresh', matchTerms: ['fruit', 'vegetables', 'herbs'] },
  { aisleId: '', name: 'Canned goods', matchTerms: ['tinned', 'canned', 'beans'] },
  { aisleId: '', name: 'Dairy', matchTerms: ['milk', 'cheese', 'yoghurt'] },
  { aisleId: '', name: 'Frozen', matchTerms: ['frozen', 'ice cream'] },
];

function draftFor(profile?: Profile): ProfileDraft {
  return profile
    ? {
        id: profile.id,
        name: profile.name,
        locationLabel: profile.locationLabel,
        notes: profile.notes,
        archived: Boolean(profile.archivedAt),
        sections: profile.sections.map((section) => ({ ...section })),
      }
    : {
        id: null,
        name: '',
        locationLabel: '',
        notes: '',
        archived: false,
        sections: starterSections.map((section) => ({ ...section })),
      };
}

async function requestWorkspace(url: string, method: string, body?: unknown): Promise<Workspace> {
  const response = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json().catch(() => null)) as
    Workspace | { error?: { message?: string } } | null;
  if (!response.ok)
    throw new Error(payload && 'error' in payload ? payload.error?.message : 'Save failed.');
  return payload as Workspace;
}

export function ListSettingsManager({ initialWorkspace }: { initialWorkspace: Workspace }) {
  const { showToast } = useToast();
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const firstActive = initialWorkspace.profiles.find((profile) => !profile.archivedAt);
  const [selectedId, setSelectedId] = useState<string | null>(firstActive?.id ?? null);
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFor(firstActive));
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  const activeProfiles = useMemo(
    () => workspace.profiles.filter((profile) => !profile.archivedAt),
    [workspace.profiles],
  );
  const archivedProfiles = useMemo(
    () => workspace.profiles.filter((profile) => profile.archivedAt),
    [workspace.profiles],
  );

  function adopt(next: Workspace, preferredId?: string | null) {
    setWorkspace(next);
    const nextProfile = next.profiles.find((profile) => profile.id === preferredId);
    if (nextProfile) {
      setSelectedId(nextProfile.id);
      setDraft(draftFor(nextProfile));
    }
  }

  function run(action: () => Promise<Workspace>, success: string, preferredId = draft.id) {
    setMessage('');
    startTransition(async () => {
      try {
        adopt(await action(), preferredId);
        setMessage(success);
        showToast(success, 'success');
      } catch (error) {
        const failure = error instanceof Error ? error.message : 'Something went wrong.';
        setMessage(failure);
        showToast(failure, 'error');
      }
    });
  }

  function selectProfile(profile: Profile) {
    setSelectedId(profile.id);
    setDraft(draftFor(profile));
    setMessage('');
  }

  function moveSection(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draft.sections.length) return;
    const sections = [...draft.sections];
    [sections[index], sections[nextIndex]] = [sections[nextIndex], sections[index]];
    setDraft({ ...draft, sections });
  }

  function updateSection(index: number, patch: Partial<Section>) {
    setDraft({
      ...draft,
      sections: draft.sections.map((section, current) =>
        current === index ? { ...section, ...patch } : section,
      ),
    });
  }

  function saveProfile() {
    const profile = {
      name: draft.name,
      locationLabel: draft.locationLabel,
      notes: draft.notes,
      sections: draft.sections.map(({ aisleId, name, matchTerms }) => ({
        aisleId,
        name,
        matchTerms,
      })),
    };
    if (draft.id) {
      run(
        () =>
          requestWorkspace(`/api/v1/supermarket-profiles/${draft.id}`, 'PATCH', {
            ...profile,
            archived: draft.archived,
          }),
        'Supermarket saved.',
      );
    } else {
      run(
        async () => {
          const next = await requestWorkspace('/api/v1/supermarket-profiles', 'POST', profile);
          const created = next.profiles.find(
            (candidate) =>
              candidate.name === profile.name && candidate.locationLabel === profile.locationLabel,
          );
          setSelectedId(created?.id ?? null);
          setDraft(draftFor(created));
          return next;
        },
        'Supermarket added.',
        null,
      );
    }
  }

  return (
    <div className={styles.manager}>
      <section className={styles.preferences} aria-labelledby="list-preferences-title">
        <div className={styles.sectionTitle}>
          <p className="eyebrow" id="list-preferences-title">
            GENERAL PREFERENCES
          </p>
          <button
            className="secondary-button compact"
            aria-busy={isPending}
            disabled={isPending}
            onClick={() =>
              run(
                () =>
                  requestWorkspace('/api/v1/settings/lists', 'PATCH', {
                    ...workspace.settings,
                    defaultSupermarketProfileId:
                      workspace.settings.defaultSupermarketProfileId ?? '',
                  }),
                'List preferences saved.',
              )
            }
            type="button"
          >
            <Save size={16} /> Save preferences
          </button>
        </div>
        <div className={styles.preferenceGrid}>
          <label>
            <span>Default supermarket</span>
            <select
              value={workspace.settings.defaultSupermarketProfileId ?? ''}
              onChange={(event) =>
                setWorkspace({
                  ...workspace,
                  settings: {
                    ...workspace.settings,
                    defaultSupermarketProfileId: event.target.value || null,
                  },
                })
              }
            >
              <option value="">No default</option>
              {activeProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                  {profile.locationLabel ? ` · ${profile.locationLabel}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Completed items</span>
            <select
              value={workspace.settings.completedItemsBehavior}
              onChange={(event) =>
                setWorkspace({
                  ...workspace,
                  settings: {
                    ...workspace.settings,
                    completedItemsBehavior: event.target
                      .value as Settings['completedItemsBehavior'],
                  },
                })
              }
            >
              <option value="completed_section">Move to a Completed section</option>
              <option value="hide">Hide completed items</option>
              <option value="in_place">Keep items in place</option>
            </select>
          </label>
          <label className={styles.toggleRow}>
            <input
              checked={workspace.settings.openPantryPurchaseOnCheck}
              onChange={(event) =>
                setWorkspace({
                  ...workspace,
                  settings: {
                    ...workspace.settings,
                    openPantryPurchaseOnCheck: event.target.checked,
                  },
                })
              }
              type="checkbox"
            />
            <span>Open Pantry purchase details when an item is checked</span>
          </label>
          <label className={styles.toggleRow}>
            <input
              checked={workspace.settings.keepScreenAwake}
              onChange={(event) =>
                setWorkspace({
                  ...workspace,
                  settings: { ...workspace.settings, keepScreenAwake: event.target.checked },
                })
              }
              type="checkbox"
            />
            <span>Keep the screen awake while a list is open</span>
          </label>
        </div>
      </section>

      <section className={styles.profiles} aria-labelledby="supermarket-profiles-title">
        <aside className={styles.profileRail}>
          <p className="eyebrow" id="supermarket-profiles-title">
            SUPERMARKET PROFILES
          </p>
          <div className={styles.profileList}>
            {activeProfiles.map((profile) => (
              <button
                className={selectedId === profile.id ? styles.selectedProfile : ''}
                key={profile.id}
                onClick={() => selectProfile(profile)}
                type="button"
              >
                <Store size={19} />
                <span>
                  <strong>{profile.name}</strong>
                  <small>
                    {profile.locationLabel || 'No branch set'}
                    {workspace.settings.defaultSupermarketProfileId === profile.id
                      ? ' · Default'
                      : ''}
                  </small>
                </span>
              </button>
            ))}
            <button
              className={selectedId === null ? styles.selectedProfile : ''}
              onClick={() => {
                setSelectedId(null);
                setDraft(draftFor());
                setMessage('');
              }}
              type="button"
            >
              <Plus size={19} />
              <span>
                <strong>Add supermarket</strong>
                <small>Start with a useful route</small>
              </span>
            </button>
          </div>
          {archivedProfiles.length ? (
            <div className={styles.archivedList}>
              <span>Archived</span>
              {archivedProfiles.map((profile) => (
                <button key={profile.id} onClick={() => selectProfile(profile)} type="button">
                  <Archive size={16} /> {profile.name}
                </button>
              ))}
            </div>
          ) : null}
        </aside>

        <div className={styles.profileEditor}>
          <div className={styles.profileFields}>
            <label>
              <span>Store name</span>
              <input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="My supermarket"
              />
            </label>
            <label>
              <span>Location or branch (optional)</span>
              <input
                value={draft.locationLabel}
                onChange={(event) => setDraft({ ...draft, locationLabel: event.target.value })}
                placeholder="Main store"
              />
            </label>
            <label>
              <span>Notes (optional)</span>
              <textarea
                value={draft.notes}
                onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                placeholder="Our usual weekly shop"
              />
            </label>
          </div>

          <div className={styles.routeHeader}>
            <div>
              <p className="eyebrow">IN-STORE ROUTE</p>
              <span>
                Put sections in the order you walk the store. Keywords help place new items
                automatically.
              </span>
            </div>
          </div>
          <ol className={styles.routeList}>
            {draft.sections.map((section, index) => (
              <li key={`${section.id ?? 'new'}-${index}`}>
                <GripVertical className={styles.grip} size={18} aria-hidden="true" />
                <span className={styles.routeNumber}>{index + 1}</span>
                <div className={styles.routeInputs}>
                  <input
                    aria-label={`Section ${index + 1} name`}
                    value={section.name}
                    onChange={(event) => updateSection(index, { name: event.target.value })}
                    placeholder="Section name"
                  />
                  <input
                    aria-label={`Section ${index + 1} keywords`}
                    value={section.matchTerms.join(', ')}
                    onChange={(event) =>
                      updateSection(index, {
                        matchTerms: event.target.value
                          .split(',')
                          .map((term) => term.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="Keywords, separated by commas"
                  />
                </div>
                <div className={styles.routeActions}>
                  <button
                    aria-label={`Move ${section.name || 'section'} up`}
                    disabled={index === 0}
                    onClick={() => moveSection(index, -1)}
                    type="button"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    aria-label={`Move ${section.name || 'section'} down`}
                    disabled={index === draft.sections.length - 1}
                    onClick={() => moveSection(index, 1)}
                    type="button"
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    aria-label={`Remove ${section.name || 'section'}`}
                    disabled={draft.sections.length === 1}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        sections: draft.sections.filter((_, current) => current !== index),
                      })
                    }
                    type="button"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <button
            className={styles.addSection}
            onClick={() =>
              setDraft({
                ...draft,
                sections: [...draft.sections, { aisleId: '', name: '', matchTerms: [] }],
              })
            }
            type="button"
          >
            <Plus size={17} /> Add section
          </button>

          <footer className={styles.editorFooter}>
            <p>
              <Info size={18} />
              <span>
                Manual corrections are remembered for this supermarket. Items that cannot be matched
                stay in Unassigned.
              </span>
            </p>
            <div>
              {draft.id ? (
                <button
                  className="secondary-button compact"
                  disabled={isPending}
                  onClick={() =>
                    run(
                      () =>
                        requestWorkspace(
                          `/api/v1/supermarket-profiles/${draft.id}/duplicate`,
                          'POST',
                        ),
                      'Supermarket duplicated.',
                      null,
                    )
                  }
                  type="button"
                >
                  <Copy size={16} /> Duplicate
                </button>
              ) : null}
              {draft.id ? (
                <button
                  className={styles.archiveButton}
                  disabled={isPending}
                  onClick={() => {
                    const next = { ...draft, archived: !draft.archived };
                    setDraft(next);
                    run(
                      () =>
                        requestWorkspace(`/api/v1/supermarket-profiles/${draft.id}`, 'PATCH', {
                          name: next.name,
                          locationLabel: next.locationLabel,
                          notes: next.notes,
                          sections: next.sections.map(({ aisleId, name, matchTerms }) => ({
                            aisleId,
                            name,
                            matchTerms,
                          })),
                          archived: next.archived,
                        }),
                      next.archived ? 'Supermarket archived.' : 'Supermarket restored.',
                    );
                  }}
                  type="button"
                >
                  {draft.archived ? <RotateCcw size={16} /> : <Archive size={16} />}
                  {draft.archived ? 'Restore' : 'Archive'}
                </button>
              ) : null}
              <button
                className="primary-button compact"
                aria-busy={isPending}
                disabled={
                  isPending ||
                  !draft.name.trim() ||
                  draft.sections.some((section) => !section.name.trim())
                }
                onClick={saveProfile}
                type="button"
              >
                <Save size={16} /> {draft.id ? 'Save supermarket' : 'Add supermarket'}
              </button>
            </div>
          </footer>
          <p className={styles.status} role="status">
            {isPending ? <InlineSkeleton label="Saving list settings" width="7rem" /> : message}
          </p>
        </div>
      </section>
    </div>
  );
}
