import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Image from 'next/image';
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
        title={
          <>
            Private integrations,
            <br />
            with an explicit boundary.
          </>
        }
        description="Admin-owned API keys give trusted systems access to your data—within a boundary you set."
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
        aside={
          <Image
            className="api-security-art"
            src="/images/settings/api-security-boundary.png"
            width={720}
            height={330}
            alt=""
            priority
          />
        }
      />
      <ApiKeyManager initialKeys={listAdminApiKeys(authSession.user.id)} />
    </main>
  );
}
