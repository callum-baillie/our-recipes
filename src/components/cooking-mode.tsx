'use client';

import { Check, ChevronLeft, ChevronRight, Heart, Play, Plus, Timer, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { convertTemperature, recipeYieldNumber, scaledQuantity } from '@/lib/domain/cooking';
import type { RecipeDetail } from '@/lib/services/recipe-service';

type LocalTimer = { id: string; label: string; remaining: number; running: boolean };
export function CookingMode({
  recipe,
  initialFavorite,
}: {
  recipe: RecipeDetail;
  initialFavorite: boolean;
}) {
  const steps = useMemo(
    () =>
      recipe.instructionSections.flatMap((section) =>
        section.steps.map((step) => ({ section: section.title, body: step.body })),
      ),
    [recipe],
  );
  const baseServings = recipeYieldNumber(recipe.servings) ?? 1;
  const [servings, setServings] = useState(baseServings);
  const [step, setStep] = useState(0);
  const [favorite, setFavorite] = useState(initialFavorite);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [timers, setTimers] = useState<LocalTimer[]>([]);
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [temperature, setTemperature] = useState('');
  const [temperatureUnit, setTemperatureUnit] = useState<'C' | 'F'>('C');
  useEffect(() => {
    const id = window.setInterval(
      () =>
        setTimers((current) =>
          current.map((timer) =>
            timer.running && timer.remaining > 0
              ? { ...timer, remaining: timer.remaining - 1 }
              : timer,
          ),
        ),
      1000,
    );
    return () => window.clearInterval(id);
  }, []);
  const startCooking = async () => {
    const response = await fetch('/api/v1/cook-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipeId: recipe.id, targetServings: servings }),
    });
    const body = (await response.json().catch(() => null)) as { session?: { id: string } } | null;
    if (body?.session) setSessionId(body.session.id);
  };
  const finishCooking = async () => {
    if (sessionId) await fetch(`/api/v1/cook-sessions/${sessionId}/complete`, { method: 'POST' });
    setSessionId(null);
  };
  const toggleFavorite = async () => {
    const next = !favorite;
    setFavorite(next);
    const response = await fetch(`/api/v1/recipes/${recipe.id}/favorite`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favorite: next }),
    });
    if (!response.ok) setFavorite(!next);
  };
  const addTimer = () => {
    const seconds = Math.max(1, Math.round(timerMinutes * 60));
    setTimers((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        label: `Timer ${current.length + 1}`,
        remaining: seconds,
        running: true,
      },
    ]);
  };
  const formatted = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <main className="cooking-page">
      <header className="cooking-header">
        <Link className="quiet-link" href={`/recipes/${recipe.id}`}>
          ← Recipe card
        </Link>
        <button
          className="favorite-button"
          type="button"
          aria-pressed={favorite}
          onClick={() => void toggleFavorite()}
        >
          <Heart size={18} fill={favorite ? 'currentColor' : 'none'} />{' '}
          {favorite ? 'Favorite' : 'Save favorite'}
        </button>
      </header>
      <section className="cooking-top">
        <div>
          <p className="eyebrow">COOKING {recipe.title.toUpperCase()}</p>
          <h1>{recipe.title}</h1>
          <div className="serving-control">
            <label>
              Cook for{' '}
              <input
                type="number"
                min="1"
                max="100"
                value={servings}
                onChange={(event) => setServings(Math.max(1, Number(event.target.value) || 1))}
              />{' '}
              servings
            </label>
            <button
              className="primary-button compact"
              type="button"
              onClick={() => void (sessionId ? finishCooking() : startCooking())}
            >
              {sessionId ? (
                <>
                  <Check size={16} /> Finish cooking
                </>
              ) : (
                <>
                  <Play size={16} /> Start cooking
                </>
              )}
            </button>
          </div>
        </div>
        <aside className="temperature-card">
          <strong>Temperature converter</strong>
          <div>
            <input
              aria-label="Temperature"
              inputMode="decimal"
              value={temperature}
              onChange={(event) => setTemperature(event.target.value)}
            />
            <select
              aria-label="Temperature unit"
              value={temperatureUnit}
              onChange={(event) => setTemperatureUnit(event.target.value as 'C' | 'F')}
            >
              <option value="C">°C</option>
              <option value="F">°F</option>
            </select>
          </div>
          {temperature && Number.isFinite(Number(temperature)) && (
            <p>
              {temperatureUnit === 'C'
                ? `${convertTemperature(Number(temperature), 'C')}°F`
                : `${convertTemperature(Number(temperature), 'F')}°C`}{' '}
              <span>converted — original recipe stays unchanged.</span>
            </p>
          )}
        </aside>
      </section>
      <section className="cooking-layout">
        <aside className="scaled-ingredients">
          <h2>Ingredients</h2>
          {recipe.ingredientGroups.map((group) => (
            <div key={group.id}>
              {group.name && <h3>{group.name}</h3>}
              <ul>
                {group.ingredients.map((ingredient) => (
                  <li key={ingredient.id}>
                    <strong>
                      {scaledQuantity(ingredient.quantity, recipe.servings, servings) ?? ''}{' '}
                      {ingredient.unit}
                    </strong>{' '}
                    {ingredient.item}
                    {ingredient.note && <em> — {ingredient.note}</em>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>
        <section className="step-focus">
          <p className="eyebrow">
            STEP {step + 1} OF {steps.length}
          </p>
          <h2>{steps[step]?.section || 'Method'}</h2>
          <p>{steps[step]?.body}</p>
          <div className="step-actions">
            <button
              className="text-button"
              type="button"
              disabled={step === 0}
              onClick={() => setStep((current) => current - 1)}
            >
              <ChevronLeft size={18} /> Back
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={step === steps.length - 1}
              onClick={() => setStep((current) => current + 1)}
            >
              Next step <ChevronRight size={18} />
            </button>
          </div>
        </section>
        <aside className="timer-panel">
          <h2>
            <Timer size={20} /> Timers
          </h2>
          <div className="add-timer">
            <input
              aria-label="Timer minutes"
              type="number"
              min="1"
              value={timerMinutes}
              onChange={(event) => setTimerMinutes(Number(event.target.value))}
            />
            <button className="text-button" type="button" onClick={addTimer}>
              <Plus size={16} /> Add
            </button>
          </div>
          {timers.length ? (
            timers.map((timer) => (
              <article key={timer.id}>
                <strong>{timer.label}</strong>
                <span>{formatted(timer.remaining)}</span>
                <button
                  className="text-button"
                  type="button"
                  onClick={() =>
                    setTimers((current) =>
                      current.map((entry) =>
                        entry.id === timer.id ? { ...entry, running: !entry.running } : entry,
                      ),
                    )
                  }
                >
                  {timer.running ? 'Pause' : 'Resume'}
                </button>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() =>
                    setTimers((current) => current.filter((entry) => entry.id !== timer.id))
                  }
                  aria-label={`Remove ${timer.label}`}
                >
                  <X size={14} />
                </button>
              </article>
            ))
          ) : (
            <p className="muted">Run as many local timers as you need.</p>
          )}
        </aside>
      </section>
    </main>
  );
}
