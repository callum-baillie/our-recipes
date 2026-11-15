import Link from 'next/link';
import { DecisionAssistance } from '@/components/decision-assistance';
import { decisionTaskSchema } from '@/lib/domain/decision-assistance';
export default async function AssistancePage({
  searchParams,
}: {
  searchParams: Promise<{ task?: string }>;
}) {
  const task = decisionTaskSchema.safeParse((await searchParams).task);
  return (
    <main className="workspace-page" data-width="focused">
      <Link href="/predictions">Prediction history and shopping forecasts →</Link>
      <DecisionAssistance initialTask={task.success ? task.data : 'aisles'} />
    </main>
  );
}
