import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';

import { ApiKeyManager } from '@/components/api-key-manager';
import { SettingsPageHeader } from '@/components/settings-page-header';
import { auth } from '@/lib/auth/server';
import { listAdminApiKeys } from '@/lib/services/api-key-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function ApiSettingsPage() {
  const authSession = await auth.api.getSession({ headers: await headers() });
  const role = (authSession?.user as { role?: string } | undefined)?.role;
  if (!authSession || role !== 'admin') notFound();
  return (
    <main className="recipe-page settings-hub api-settings-page">
      <SettingsPageHeader
        eyebrow="API & SECURITY"
        title="API keys"
        description="Connect scripts and other apps to recipes, pantry stock, meal plans, and grocery lists. Choose exactly what each key can do."
        meta={
          <div className="api-trust-points">
            <span>
              <ShieldCheck size={15} aria-hidden="true" /> Keys are hashed at rest
            </span>
            <span>
              <ShieldCheck size={15} aria-hidden="true" /> New keys begin read-only
            </span>
          </div>
        }
      />
      <ApiKeyManager
        initialKeys={listAdminApiKeys(authSession.user.id)}
        accountEmail={authSession.user.email}
      />
    </main>
  );
}
