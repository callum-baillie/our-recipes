import { cookies } from 'next/headers';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';

import { AiSettingsForm } from '@/components/ai-settings-form';
import { SettingsPageHeader } from '@/components/settings-page-header';
import { ACTIVE_PROFILE_COOKIE, getActorContext } from '@/lib/actor-context';
import { getAiSettings } from '@/lib/services/ai-settings-service';

export const dynamic = 'force-dynamic';

export default async function AiSettingsPage() {
  const actor = getActorContext((await cookies()).get(ACTIVE_PROFILE_COOKIE)?.value);
  if (!actor.profileId)
    return (
      <main className="recipe-page settings-hub">
        <SettingsPageHeader
          eyebrow="AI SETTINGS"
          title="Choose a household profile first."
          description="AI privacy choices belong to each profile."
        />
        <Link href="/settings/profiles">Open profile settings</Link>
      </main>
    );
  return (
    <main className="recipe-page settings-hub">
      <SettingsPageHeader
        eyebrow="AI SETTINGS"
        title="Control what the assistant uses."
        description="Choose a model for each task and decide which data this profile may send to OpenAI."
        icon={<Sparkles size={16} aria-hidden="true" />}
      />
      <AiSettingsForm initialSettings={getAiSettings(actor.profileId)} />
    </main>
  );
}
