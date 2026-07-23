import { cookies } from 'next/headers';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';

import { AiSettingsForm } from '@/components/ai-settings-form';
import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { getAiSettings } from '@/lib/services/ai-settings-service';

export const dynamic = 'force-dynamic';

export default async function AiSettingsPage() {
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId)
    return (
      <main className="recipe-page">
        <section className="settings-intro">
          <Link className="quiet-link" href="/settings">
            ← All settings
          </Link>
          <p className="eyebrow">AI SETTINGS</p>
          <h1>Choose a household profile first.</h1>
          <p>AI privacy choices belong to each profile.</p>
          <Link href="/settings/profiles">Open profile settings</Link>
        </section>
      </main>
    );
  return (
    <main className="recipe-page">
      <section className="settings-intro">
        <Link className="quiet-link" href="/settings">
          ← All settings
        </Link>
        <p className="eyebrow">
          <Sparkles size={16} aria-hidden="true" /> AI SETTINGS
        </p>
        <h1>Control what the assistant uses.</h1>
        <p>Choose a model for each task and decide which data this profile may send to OpenAI.</p>
      </section>
      <AiSettingsForm initialSettings={getAiSettings(actor.profileId)} />
    </main>
  );
}
