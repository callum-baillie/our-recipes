import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function BackupsPage() {
  redirect('/settings/system#backups');
}
