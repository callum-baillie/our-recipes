'use client';

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { ShoppingListDetail } from '@/lib/services/planning-service';

type Item = ShoppingListDetail['items'][number];
export function ShoppingListEditor({ list }: { list: ShoppingListDetail }) {
  const [items, setItems] = useState(list.items);
  const [aisles, setAisles] = useState(list.aisles);
  const [newItem, setNewItem] = useState('');
  const [newAisle, setNewAisle] = useState('');
  const save = async (item: Item) => {
    await fetch(`/api/v1/shopping-lists/${list.id}/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quantity: item.quantity ?? '',
        unit: item.unit,
        item: item.item,
        note: item.note,
        aisleId: item.aisleId ?? '',
        checked: item.checked,
      }),
    });
  };
  const update = (id: string, patch: Partial<Item>) =>
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const remove = async (id: string) => {
    await fetch(`/api/v1/shopping-lists/${list.id}/items/${id}`, { method: 'DELETE' });
    setItems((current) => current.filter((item) => item.id !== id));
  };
  const reorderWithinGroup = async (groupItems: Item[], index: number, direction: -1 | 1) => {
    const current = groupItems[index];
    const replacement = groupItems[index + direction];
    if (!current || !replacement) return;

    const currentIndex = items.findIndex((item) => item.id === current.id);
    const replacementIndex = items.findIndex((item) => item.id === replacement.id);
    if (currentIndex < 0 || replacementIndex < 0) return;

    const next = [...items];
    next[currentIndex] = replacement;
    next[replacementIndex] = current;
    setItems(next);
    await fetch(`/api/v1/shopping-lists/${list.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemIds: next.map((item) => item.id) }),
    });
  };
  const add = async () => {
    if (!newItem.trim()) return;
    const response = await fetch(`/api/v1/shopping-lists/${list.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quantity: '',
        unit: '',
        item: newItem,
        note: '',
        aisleId: '',
        checked: false,
      }),
    });
    const body = (await response.json().catch(() => null)) as { item?: Item } | null;
    const item = body?.item;
    if (item) setItems((current) => [...current, item]);
    setNewItem('');
  };
  const addAisle = async () => {
    if (!newAisle.trim()) return;
    const response = await fetch('/api/v1/shopping-lists/aisles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newAisle }),
    });
    const body = (await response.json().catch(() => null)) as {
      aisle?: ShoppingListDetail['aisles'][number];
    } | null;
    if (body?.aisle) setAisles((current) => [...current, body.aisle!]);
    setNewAisle('');
  };
  const reorderAisle = async (index: number, direction: -1 | 1) => {
    const next = [...aisles];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setAisles(next);
    const response = await fetch('/api/v1/shopping-lists/aisles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aisleIds: next.map((aisle) => aisle.id) }),
    });
    if (!response.ok) setAisles(aisles);
  };
  const removeAisle = async (id: string) => {
    const response = await fetch(`/api/v1/shopping-lists/aisles/${id}`, { method: 'DELETE' });
    if (!response.ok) return;
    setAisles((current) => current.filter((aisle) => aisle.id !== id));
    setItems((current) =>
      current.map((item) => (item.aisleId === id ? { ...item, aisleId: null } : item)),
    );
  };
  const aisleIds = new Set(aisles.map((aisle) => aisle.id));
  const itemGroups = [
    ...aisles.map((aisle) => ({
      id: aisle.id,
      name: aisle.name,
      items: items.filter((item) => item.aisleId === aisle.id),
    })),
    {
      id: 'unassigned',
      name: 'Unassigned',
      items: items.filter((item) => !item.aisleId || !aisleIds.has(item.aisleId)),
    },
  ];
  return (
    <section className="shopping-editor">
      <aside className="aisle-manager">
        <div>
          <strong>Store aisles</strong>
          <span>Group items your way. Removing an aisle leaves its items unassigned.</span>
        </div>
        <div className="add-list-item">
          <input
            value={newAisle}
            onChange={(event) => setNewAisle(event.target.value)}
            placeholder="e.g. Produce"
            aria-label="New shopping aisle"
          />
          <button className="text-button" type="button" onClick={() => void addAisle()}>
            <Plus size={16} /> Add aisle
          </button>
        </div>
        {aisles.length > 0 && (
          <ul>
            {aisles.map((aisle, index) => (
              <li key={aisle.id}>
                <span>{aisle.name}</span>
                <div>
                  <button
                    className="icon-button"
                    type="button"
                    disabled={index === 0}
                    onClick={() => void reorderAisle(index, -1)}
                    aria-label={`Move ${aisle.name} aisle up`}
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    disabled={index === aisles.length - 1}
                    onClick={() => void reorderAisle(index, 1)}
                    aria-label={`Move ${aisle.name} aisle down`}
                  >
                    <ArrowDown size={15} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => void removeAisle(aisle.id)}
                    aria-label={`Remove ${aisle.name} aisle`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <div className="shopping-aisle-groups">
        {itemGroups.map((group) => (
          <section
            className="shopping-aisle-group"
            key={group.id}
            aria-labelledby={`aisle-${group.id}`}
          >
            <div className="shopping-aisle-heading">
              <h2 id={`aisle-${group.id}`}>{group.name}</h2>
              <span>{group.items.length === 1 ? '1 item' : `${group.items.length} items`}</span>
            </div>
            {group.items.length > 0 ? (
              <div className="shopping-items">
                {group.items.map((item, index) => {
                  const itemIndex = items.findIndex((entry) => entry.id === item.id);
                  return (
                    <article
                      className={item.checked ? 'shopping-item checked' : 'shopping-item'}
                      key={item.id}
                    >
                      <input
                        aria-label={`Mark ${item.item} complete`}
                        type="checkbox"
                        checked={item.checked}
                        onChange={(event) => {
                          const changed = { ...item, checked: event.target.checked };
                          update(item.id, { checked: changed.checked });
                          void save(changed);
                        }}
                      />
                      <select
                        aria-label={`Aisle for ${item.item}`}
                        value={item.aisleId ?? ''}
                        onChange={(event) => {
                          const changed = { ...item, aisleId: event.target.value || null };
                          update(item.id, { aisleId: changed.aisleId });
                          void save(changed);
                        }}
                      >
                        <option value="">Unassigned</option>
                        {aisles.map((aisle) => (
                          <option value={aisle.id} key={aisle.id}>
                            {aisle.name}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label={`${item.item} quantity`}
                        className="quantity-input"
                        value={item.quantity ?? ''}
                        onChange={(event) =>
                          update(item.id, {
                            quantity: event.target.value === '' ? null : Number(event.target.value),
                          })
                        }
                        onBlur={() =>
                          void save(items.find((entry) => entry.id === item.id) ?? item)
                        }
                      />
                      <input
                        aria-label={`${item.item} unit`}
                        className="unit-input"
                        value={item.unit}
                        onChange={(event) => update(item.id, { unit: event.target.value })}
                        onBlur={() =>
                          void save(items.find((entry) => entry.id === item.id) ?? item)
                        }
                      />
                      <input
                        aria-label={`Shopping item ${itemIndex + 1}`}
                        value={item.item}
                        onChange={(event) => update(item.id, { item: event.target.value })}
                        onBlur={() =>
                          void save(items.find((entry) => entry.id === item.id) ?? item)
                        }
                      />
                      <button
                        className="icon-button"
                        type="button"
                        disabled={index === 0}
                        onClick={() => void reorderWithinGroup(group.items, index, -1)}
                        aria-label={`Move ${item.item} up`}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        disabled={index === group.items.length - 1}
                        onClick={() => void reorderWithinGroup(group.items, index, 1)}
                        aria-label={`Move ${item.item} down`}
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => void remove(item.id)}
                        aria-label={`Remove ${item.item}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="shopping-aisle-empty">No items in this group yet.</p>
            )}
          </section>
        ))}
      </div>
      <div className="add-list-item">
        <input
          value={newItem}
          onChange={(event) => setNewItem(event.target.value)}
          placeholder="Add something else"
          aria-label="New shopping item"
        />
        <button className="text-button" type="button" onClick={() => void add()}>
          <Plus size={16} /> Add item
        </button>
      </div>
    </section>
  );
}
