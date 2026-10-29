import { redirect } from 'next/navigation';
import { HANDHELD_HREF } from '@/lib/client/scanner-activity';
export default function Page() {
  redirect(HANDHELD_HREF);
}
