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
import { useMemo, useState, useTransition, useRef } from 'react';

import { createClientUuid } from '@/lib/client/client-uuid';
import { CatalogStoreLink } from '@/components/catalog-store-link';
import { StoreMapUpload } from '@/components/store-map-upload';

import { LoadingIndicator } from '@/components/skeleton';
import {
  SettingsActionBar,
  SettingsPane,
  SettingsField,
  SettingsSubsection,
} from '@/components/settings-primitives';
import { useToast } from '@/components/toast-provider';
import { DEFAULT_SUPERMARKET_SECTIONS } from '@/lib/domain/list-settings';

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
  catalogStoreId?: string | null;
  catalogMetadata?: string | null;
  catalogLinkedAt?: string | Date | null;
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

const starterSections: Section[] = DEFAULT_SUPERMARKET_SECTIONS.map((section) => ({
  aisleId: '',
  name: section.name,
  matchTerms: [...section.matchTerms],
}));

function draftFor(profile?: Profile): ProfileDraft {
  return profile
    ? {
        id: profile.id,
        name: profile.name,
        locationLabel: profile.locationLabel,
        notes: profile.notes,
        archived: Boolean(profile.archivedAt),
        sections: profile.sections.map((section, index) => ({
          ...section,
          id: section.id ?? `draft-${index}`,
        })),
      }
    : {
        id: null,
        name: '',
        locationLabel: '',
        notes: '',
        archived: false,
        sections: starterSections.map((section, index) => ({ ...section, id: `draft-${index}` })),
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
  const dragRef = useRef<{ index: number; sections: Section[] } | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [routeAnnouncement, setRouteAnnouncement] = useState('');
  function finishDrag(cancelled = false) {
    const original = dragRef.current?.sections;
    if (cancelled && original) setDraft((current) => ({ ...current, sections: original }));
    dragRef.current = null;
    setDragging(null);
  }

  const [workspace, setWorkspace] = useState(initialWorkspace);
  const firstActive = initialWorkspace.profiles.find((profile) => !profile.archivedAt);
  const [selectedId, setSelectedId] = useState<string | null>(firstActive?.id ?? null);
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFor(firstActive));
  const [message, setMessage] = useState('');
  const [statusArea, setStatusArea] = useState<'preferences' | 'store'>('preferences');
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

  function run(
    action: () => Promise<Workspace>,
    success: string,
    preferredId = draft.id,
    area: 'preferences' | 'store' = 'store',
  ) {
    setStatusArea(area);
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
      <SettingsPane
        className={styles.preferences}
        eyebrow="GENERAL PREFERENCES"
        title="Shopping list behavior"
        description="Shared defaults for list completion, supermarket routing, and shopping mode."
      >
        <SettingsSubsection
          title="List organization"
          description="Choose the default store and what happens after an item is completed."
        >
          <SettingsField
            description="Use this store’s route for new shopping lists."
            title="Default supermarket"
          >
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
          </SettingsField>
          <SettingsField
            description="Choose where items go after they are marked complete."
            title="Completed items"
          >
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
          </SettingsField>
        </SettingsSubsection>
        <SettingsField
          title="Pantry intake"
          description="Open purchase details as items are checked so quantities and dates can be recorded."
        >
          <input
            role="switch"
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
        </SettingsField>
        <SettingsField
          title="Shopping mode"
          description="Prevent the display from sleeping while an active list is open."
        >
          <input
            role="switch"
            checked={workspace.settings.keepScreenAwake}
            onChange={(event) =>
              setWorkspace({
                ...workspace,
                settings: { ...workspace.settings, keepScreenAwake: event.target.checked },
              })
            }
            type="checkbox"
          />
        </SettingsField>
        <SettingsActionBar
          status={
            statusArea === 'preferences' ? (isPending ? 'Saving preferences…' : message) : undefined
          }
        >
          <button
            className="primary-button compact"
            aria-busy={isPending}
            disabled={isPending}
            onClick={() =>
              run(
                () =>
                  requestWorkspace('/api/v1/settings/lists', 'PATCH', {
                    defaultSupermarketProfileId:
                      workspace.settings.defaultSupermarketProfileId ?? '',
                    completedItemsBehavior: workspace.settings.completedItemsBehavior,
                    openPantryPurchaseOnCheck: workspace.settings.openPantryPurchaseOnCheck,
                    keepScreenAwake: workspace.settings.keepScreenAwake,
                  }),
                'List preferences saved.',
                null,
                'preferences',
              )
            }
            type="button"
          >
            <Save size={16} /> Save preferences
          </button>
        </SettingsActionBar>
      </SettingsPane>

      <SettingsPane
        title="Stores & routes"
        description="Save each store’s departments in the order you shop."
      >
        <SettingsSubsection title="Saved stores">
          <div className={styles.profiles}>
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
              <div className={`settings-fields ${styles.profileFields}`}>
                <SettingsField
                  description="The name shown when choosing a shopping route."
                  title="Store name"
                >
                  <input
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    placeholder="My supermarket"
                  />
                </SettingsField>
                <SettingsField
                  description="Distinguish branches with different department layouts."
                  title="Location or branch (optional)"
                >
                  <input
                    value={draft.locationLabel}
                    onChange={(event) => setDraft({ ...draft, locationLabel: event.target.value })}
                    placeholder="Main store"
                  />
                </SettingsField>
                <SettingsField
                  description="Instructions or reminders about shopping at this store."
                  title="Notes (optional)"
                >
                  <textarea
                    value={draft.notes}
                    onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                    placeholder="Our usual weekly shop"
                  />
                </SettingsField>
              </div>

              {draft.id && (
                <CatalogStoreLink
                  key={`catalog-${draft.id}`}
                  profile={workspace.profiles.find((profile) => profile.id === draft.id)!}
                  onChange={(next) => {
                    // Linking only changes the association. Keep unsaved household labels and route edits.
                    setWorkspace(next as Workspace);
                  }}
                />
              )}
              <StoreMapUpload
                key={draft.id ?? 'new-store'}
                onUse={(sections) =>
                  setDraft((current) => ({
                    ...current,
                    sections: sections.map((section) => ({ ...section, id: createClientUuid() })),
                  }))
                }
              />
              <div className={styles.routeHeader}>
                <div>
                  <p className="eyebrow">IN-STORE ROUTE</p>
                  <span>
                    Put sections in the order you walk the store. Keywords help place new items
                    automatically.
                  </span>
                </div>
              </div>
              <p id="route-drag-help" className={styles.routeHelp}>
                Drag a handle to change the route, or use the up and down buttons.
              </p>
              <p role="status" className="sr-only">
                {routeAnnouncement}
              </p>
              <ol
                className={styles.routeList}
                onPointerMove={(event) => {
                  const drag = dragRef.current;
                  if (!drag) return;
                  const target = document
                    .elementFromPoint(event.clientX, event.clientY)
                    ?.closest<HTMLElement>('[data-route-index]');
                  if (!target || !event.currentTarget.contains(target)) return;
                  const to = Number(target.dataset.routeIndex);
                  if (to === drag.index || !Number.isInteger(to)) return;
                  const from = drag.index;
                  drag.index = to;
                  setDraft((current) => {
                    const sections = [...current.sections];
                    const [moving] = sections.splice(from, 1);
                    sections.splice(to, 0, moving);
                    return { ...current, sections };
                  });
                  setDragging(to);
                  setRouteAnnouncement(
                    `Moved section to position ${to + 1}. Save changes to keep this route.`,
                  );
                  if (event.clientY > window.innerHeight - 90) window.scrollBy({ top: 14 });
                  if (event.clientY < 90) window.scrollBy({ top: -14 });
                }}
                onPointerUp={() => finishDrag()}
                onPointerCancel={() => finishDrag(true)}
                onLostPointerCapture={() => finishDrag()}
              >
                {draft.sections.map((section, index) => (
                  <li
                    key={section.id ?? section.aisleId}
                    data-route-index={index}
                    data-dragging={dragging === index || undefined}
                  >
                    <button
                      className={styles.dragHandle}
                      type="button"
                      aria-label={`Drag ${section.name || 'section'} to reorder`}
                      aria-describedby="route-drag-help"
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        event.preventDefault();
                        dragRef.current = { index, sections: [...draft.sections] };
                        setDragging(index);
                        event.currentTarget.closest('ol')?.setPointerCapture(event.pointerId);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                          event.preventDefault();
                          moveSection(index, event.key === 'ArrowUp' ? -1 : 1);
                          setRouteAnnouncement(
                            `Moved ${section.name}. Save changes to keep this route.`,
                          );
                        }
                      }}
                    >
                      <GripVertical size={18} aria-hidden="true" />
                    </button>
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
                    sections: [
                      ...draft.sections,
                      { id: createClientUuid(), aisleId: '', name: '', matchTerms: [] },
                    ],
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
                    Manual corrections are remembered for this supermarket. Items that cannot be
                    matched stay in Unassigned.
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
              {statusArea === 'store' && (
                <p className={styles.status} role="status">
                  {isPending ? (
                    <>
                      <LoadingIndicator label="Saving list settings" /> Saving…
                    </>
                  ) : (
                    message
                  )}
                </p>
              )}
            </div>
          </div>
        </SettingsSubsection>
      </SettingsPane>
    </div>
  );
}
