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
  termsText?: string;
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
  const [savedPreferences, setSavedPreferences] = useState(initialWorkspace.settings);
  const drafts = useRef(new Map<string, ProfileDraft>());
  const lock = useRef(false);
  const routeEditor = useRef<HTMLOListElement>(null);
  const [previousRoute, setPreviousRoute] = useState<Section[] | null>(null);
  const [resultStoreId, setResultStoreId] = useState<string | null>(null);
  const firstActive = initialWorkspace.profiles.find((profile) => !profile.archivedAt);
  const [selectedId, setSelectedId] = useState<string | null>(firstActive?.id ?? null);
  const selectedStore = useRef<string | null>(firstActive?.id ?? null);
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFor(firstActive));
  const [message, setMessage] = useState('');
  const [pendingOperation, setPendingOperation] = useState<'save' | 'archive' | 'duplicate'>(
    'save',
  );
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

  function adopt(
    next: Workspace,
    preferredId: string | null | undefined,
    area: 'preferences' | 'store',
    operation: 'save' | 'archive' | 'duplicate',
  ) {
    if (area === 'preferences') {
      setWorkspace((current) => ({ ...current, settings: next.settings }));
      setSavedPreferences(next.settings);
      return;
    }
    setWorkspace((current) => ({ ...current, profiles: next.profiles }));
    const nextProfile = next.profiles.find((profile) => profile.id === preferredId);
    if (nextProfile && operation === 'save') {
      const value = draftFor(nextProfile);
      drafts.current.set(nextProfile.id, value);
      setSelectedId(nextProfile.id);
      setDraft(value);
    }
    if (nextProfile && operation === 'archive')
      setDraft((current) => ({ ...current, archived: Boolean(nextProfile.archivedAt) }));
    if (operation === 'duplicate')
      setResultStoreId(
        next.profiles.find(
          (profile) => !workspace.profiles.some((previous) => previous.id === profile.id),
        )?.id ?? null,
      );
  }
  function run(
    action: () => Promise<Workspace>,
    success: string,
    preferredId = draft.id,
    area: 'preferences' | 'store' = 'store',
    operation: 'save' | 'archive' | 'duplicate' = 'save',
  ) {
    if (lock.current) return;
    lock.current = true;
    setStatusArea(area);
    setPendingOperation(operation);
    setMessage('');
    startTransition(async () => {
      try {
        adopt(await action(), preferredId, area, operation);
        setMessage(success);
        showToast(success, 'success');
      } catch (error) {
        const failure = error instanceof Error ? error.message : 'Something went wrong.';
        setMessage(failure);
        showToast(failure, 'error');
      } finally {
        lock.current = false;
      }
    });
  }
  function rememberDraft() {
    drafts.current.set(draft.id ?? 'new', draft);
  }
  function selectProfile(profile: Profile) {
    rememberDraft();
    selectedStore.current = profile.id;
    setSelectedId(profile.id);
    setDraft(drafts.current.get(profile.id) ?? draftFor(profile));
    setPreviousRoute(null);
    setMessage('');
  }

  function moveSection(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draft.sections.length) return;
    const sections = [...draft.sections];
    [sections[index], sections[nextIndex]] = [sections[nextIndex], sections[index]];
    setDraft({ ...draft, sections });
    setRouteAnnouncement(
      `Moved ${sections[nextIndex]?.name || 'section'} to position ${nextIndex + 1} of ${sections.length}. Save the store to keep this route.`,
    );
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
      sections: draft.sections.map(({ aisleId, name, matchTerms, termsText }) => ({
        aisleId,
        name,
        matchTerms:
          termsText === undefined
            ? matchTerms
            : termsText
                .split(',')
                .map((term) => term.trim())
                .filter(Boolean),
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
            (candidate) => !workspace.profiles.some((saved) => saved.id === candidate.id),
          );
          selectedStore.current = created?.id ?? null;
          setSelectedId(created?.id ?? null);
          setDraft(draftFor(created));
          return next;
        },
        'Supermarket added.',
        null,
      );
    }
  }

  const storeMessage = statusArea === 'store' ? message : '';
  return (
    <fieldset disabled={isPending} className={`settings-form-fields ${styles.manager}`}>
      <SettingsPane
        className={styles.preferences}
        onChange={() => {
          setStatusArea('preferences');
          setMessage('');
        }}
        eyebrow="GENERAL PREFERENCES"
        title="List defaults"
        description="Shared defaults for list completion, supermarket routing, and shopping mode."
      >
        <SettingsSubsection
          title="List organization"
          description="Choose the default store and what happens after an item is completed."
        >
          <SettingsField
            description="Use this store’s route for new shopping lists."
            title="Default for new lists"
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
          title="Open purchase details when checking items"
          description="Open purchase details as items are checked so quantities and dates can be reviewed before explicit Pantry intake."
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
          title="Keep the screen awake"
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
            statusArea === 'preferences' && message
              ? isPending
                ? 'Saving list preferences…'
                : message
              : JSON.stringify(workspace.settings) !== JSON.stringify(savedPreferences)
                ? 'Unsaved list preferences'
                : 'No unsaved list preferences'
          }
        >
          <button
            className="primary-button compact"
            aria-busy={isPending && statusArea === 'preferences'}
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
            <Save size={16} /> Save list preferences
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
                    aria-pressed={selectedId === profile.id}
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
                    rememberDraft();
                    selectedStore.current = null;
                    setSelectedId(null);
                    setDraft(drafts.current.get('new') ?? draftFor());
                    setPreviousRoute(null);
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

            <div
              className={styles.profileEditor}
              onChange={() => {
                setStatusArea('store');
                setMessage('');
              }}
            >
              <h3>Currently editing: {draft.name || 'New store'}</h3>
              <a className="text-button" href="#store-actions">
                Store actions and save
              </a>
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
                    setWorkspace((current) => ({
                      ...current,
                      profiles: (next as Workspace).profiles,
                    }));
                  }}
                />
              )}
              <StoreMapUpload
                key={draft.id ?? 'new-store'}
                onUse={(sections) => {
                  if (selectedStore.current !== draft.id) return;
                  setPreviousRoute(draft.sections);
                  setDraft((current) => ({
                    ...current,
                    sections: sections.map((section) => ({ ...section, id: createClientUuid() })),
                  }));
                  setMessage(
                    `Route copied to the editor—save ${draft.name || 'this store'} to apply.`,
                  );
                  setStatusArea('store');
                  requestAnimationFrame(() => {
                    routeEditor.current?.focus();
                    routeEditor.current?.scrollIntoView({ block: 'start' });
                  });
                }}
              />
              {previousRoute && (
                <p role="status">
                  Route copied to the {draft.name || 'new store'} editor. Save this store to apply.{' '}
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      setDraft((current) => ({ ...current, sections: previousRoute }));
                      setPreviousRoute(null);
                    }}
                  >
                    Undo route import
                  </button>
                </p>
              )}
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
                ref={routeEditor}
                id="store-route-editor"
                tabIndex={-1}
                aria-label="Store route editor"
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
                      <details className={styles.keywords}>
                        <summary>
                          Route details ·{' '}
                          {section.termsText === undefined
                            ? section.matchTerms.length
                            : section.termsText.split(',').filter((term) => term.trim()).length}
                        </summary>
                        <label>
                          Match terms
                          <textarea
                            aria-label={`Section ${index + 1} keywords`}
                            value={section.termsText ?? section.matchTerms.join(', ')}
                            onChange={(event) =>
                              updateSection(index, { termsText: event.target.value })
                            }
                            placeholder="Keywords, separated by commas"
                            rows={2}
                          />
                        </label>
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
                            onClick={(event) => {
                              const row = event.currentTarget.closest('li');
                              const target = row?.nextElementSibling ?? row?.previousElementSibling;
                              setDraft({
                                ...draft,
                                sections: draft.sections.filter((_, current) => current !== index),
                              });
                              setRouteAnnouncement(
                                `Removed ${section.name}. ${draft.sections.length - 1} route sections remain.`,
                              );
                              requestAnimationFrame(() =>
                                target?.querySelector<HTMLInputElement>('input')?.focus(),
                              );
                            }}
                            type="button"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </details>
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

              <footer id="store-actions" className={styles.editorFooter}>
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
                          'Saved supermarket duplicated. Open the copy below; your source draft is retained.',
                          null,
                          'store',
                          'duplicate',
                        )
                      }
                      type="button"
                    >
                      <Copy size={16} /> Duplicate saved store
                    </button>
                  ) : null}
                  {draft.id ? (
                    <button
                      className={styles.archiveButton}
                      disabled={isPending}
                      onClick={() => {
                        const saved = workspace.profiles.find(
                          (profile) => profile.id === draft.id,
                        )!;
                        run(
                          () =>
                            requestWorkspace(`/api/v1/supermarket-profiles/${saved.id}`, 'PATCH', {
                              name: saved.name,
                              locationLabel: saved.locationLabel,
                              notes: saved.notes,
                              sections: saved.sections.map(({ aisleId, name, matchTerms }) => ({
                                aisleId,
                                name,
                                matchTerms,
                              })),
                              archived: !saved.archivedAt,
                            }),
                          saved.archivedAt
                            ? 'Saved store restored. Unsaved edits retained.'
                            : 'Saved store archived. Unsaved edits retained.',
                          saved.id,
                          'store',
                          'archive',
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
                    aria-busy={isPending && statusArea === 'store' && pendingOperation === 'save'}
                    disabled={
                      isPending ||
                      !draft.name.trim() ||
                      draft.sections.some((section) => !section.name.trim())
                    }
                    onClick={saveProfile}
                    type="button"
                  >
                    <Save size={16} />{' '}
                    {draft.id ? `Save ${draft.name || 'store'}` : 'Add supermarket'}
                  </button>
                </div>
              </footer>
              {resultStoreId && (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    const profile = workspace.profiles.find((item) => item.id === resultStoreId);
                    if (profile) selectProfile(profile);
                  }}
                >
                  Open new copy
                </button>
              )}
              {
                <p className={styles.status} role="status">
                  {isPending && statusArea === 'store' ? (
                    <>
                      <LoadingIndicator label="Saving list settings" />{' '}
                      {pendingOperation === 'save'
                        ? 'Saving store…'
                        : pendingOperation === 'archive'
                          ? 'Updating saved archive state…'
                          : 'Duplicating saved store…'}
                    </>
                  ) : (
                    storeMessage ||
                    (JSON.stringify(draft) !==
                    JSON.stringify(
                      draftFor(workspace.profiles.find((profile) => profile.id === draft.id)),
                    )
                      ? storeMessage || 'Unsaved store draft'
                      : 'No unsaved store changes')
                  )}
                </p>
              }
            </div>
          </div>
        </SettingsSubsection>
      </SettingsPane>
    </fieldset>
  );
}
