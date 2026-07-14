'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, ChevronRight, Leaf, LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { defaultProfileInput, setupSchema, type SetupInput } from '@/lib/domain/setup';

const colors = ['#A85032', '#5B713E', '#D1863A', '#466F75', '#9B5C70'];

export function SetupWizard() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState(defaultProfileInput.color);
  const form = useForm<SetupInput>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      householdName: 'Our kitchen',
      appName: 'Our Recipes',
      profile: { ...defaultProfileInput },
    },
  });

  async function submit(values: SetupInput) {
    setServerError(null);
    const response = await fetch('/api/v1/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setServerError(
        body?.error?.message ?? 'We could not save your kitchen yet. Please try again.',
      );
      return;
    }
    router.refresh();
  }

  const { errors, isSubmitting } = form.formState;

  return (
    <main className="setup-page">
      <section className="setup-intro" aria-labelledby="setup-title">
        <a className="wordmark" href="#setup-title" aria-label="Our Recipes setup">
          <span className="wordmark-mark">
            <Leaf aria-hidden="true" size={20} />
          </span>
          <span>Our Recipes</span>
        </a>
        <p className="eyebrow">A shared kitchen notebook</p>
        <h1 id="setup-title">Make this kitchen yours.</h1>
        <p className="intro-copy">
          Begin with the people around your table. Recipes will be shared; preferences and history
          remain personal.
        </p>
        <div className="setup-note" role="note">
          <span aria-hidden="true">✦</span>
          <p>
            <strong>Private household, not password protected.</strong> Profiles make this app
            friendlier to share, but they do not restrict access. Keep the app on a trusted network.
          </p>
        </div>
        <div className="kitchen-illustration" aria-hidden="true">
          <span className="illustration-sun" />
          <span className="illustration-stem illustration-stem-one" />
          <span className="illustration-stem illustration-stem-two" />
          <span className="illustration-pot" />
        </div>
      </section>

      <section className="setup-card" aria-label="Set up your household">
        <div className="progress-row" aria-label="Step 1 of 1">
          <span>FIRST THINGS FIRST</span>
          <span>01 / 01</span>
        </div>
        <h2>Set the table</h2>
        <p className="muted">You can change these details later.</p>

        <form onSubmit={form.handleSubmit(submit)} noValidate>
          <div className="field-grid two-columns">
            <label>
              <span>Household name</span>
              <input
                {...form.register('householdName')}
                autoComplete="organization"
                aria-invalid={Boolean(errors.householdName)}
              />
              {errors.householdName && <small role="alert">{errors.householdName.message}</small>}
            </label>
            <label>
              <span>App name</span>
              <input
                {...form.register('appName')}
                autoComplete="off"
                aria-invalid={Boolean(errors.appName)}
              />
              {errors.appName && <small role="alert">{errors.appName.message}</small>}
            </label>
          </div>

          <fieldset className="profile-fieldset">
            <legend>Your first profile</legend>
            <p>Used for your cooking preferences and recent activity.</p>
            <label>
              <span>Display name</span>
              <input
                {...form.register('profile.displayName')}
                autoComplete="name"
                placeholder="e.g. Callum"
                aria-invalid={Boolean(errors.profile?.displayName)}
              />
              {errors.profile?.displayName && (
                <small role="alert">{errors.profile.displayName.message}</small>
              )}
            </label>
            <div className="field-grid preference-grid">
              <label>
                <span>Units</span>
                <select {...form.register('profile.units')}>
                  <option value="metric">Metric</option>
                  <option value="imperial">US customary</option>
                </select>
              </label>
              <label>
                <span>Temperature</span>
                <select {...form.register('profile.temperatureUnit')}>
                  <option value="C">Celsius</option>
                  <option value="F">Fahrenheit</option>
                </select>
              </label>
              <label>
                <span>Locale</span>
                <input
                  {...form.register('profile.locale')}
                  aria-invalid={Boolean(errors.profile?.locale)}
                />
              </label>
              <label>
                <span>Time zone</span>
                <input
                  {...form.register('profile.timezone')}
                  aria-invalid={Boolean(errors.profile?.timezone)}
                />
              </label>
            </div>
            <label>
              <span>
                Avatar URL <em>(optional)</em>
              </span>
              <input
                {...form.register('profile.avatarUrl')}
                type="url"
                inputMode="url"
                placeholder="https://…"
                aria-invalid={Boolean(errors.profile?.avatarUrl)}
              />
              {errors.profile?.avatarUrl && (
                <small role="alert">{errors.profile.avatarUrl.message}</small>
              )}
            </label>
            <div className="color-control">
              <span>Profile color</span>
              <div className="color-options" role="radiogroup" aria-label="Profile color">
                {colors.map((color) => {
                  const selected = selectedColor === color;
                  return (
                    <button
                      className={selected ? 'color-swatch selected' : 'color-swatch'}
                      type="button"
                      key={color}
                      style={{ '--swatch': color } as React.CSSProperties}
                      role="radio"
                      aria-checked={selected}
                      aria-label={`Use ${color} for your profile`}
                      onClick={() => {
                        setSelectedColor(color);
                        form.setValue('profile.color', color, { shouldValidate: true });
                      }}
                    >
                      {selected && <Check size={14} strokeWidth={3} aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </fieldset>

          {serverError && (
            <p className="form-error" role="alert">
              {serverError}
            </p>
          )}
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <LoaderCircle className="spin" size={18} aria-hidden="true" />
            ) : (
              <span>Open the cookbook</span>
            )}
            {!isSubmitting && <ChevronRight size={18} aria-hidden="true" />}
          </button>
        </form>
      </section>
    </main>
  );
}
