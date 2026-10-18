'use client';
import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { AiJobCard, isActiveJob, type AiJob } from './ai-job-card';
import { ButtonSpinner } from './skeleton';
import styles from './ai-background-tasks.module.css';
export function AiBackgroundTasks({ profileId }: { profileId: string }) {
  const [jobs, setJobs] = useState<AiJob[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('/api/v1/ai/jobs', { cache: 'no-store' });
        if (response.ok && active) setJobs((await response.json()).jobs ?? []);
      } catch {
        /* Keep the last known task state during a connection interruption. */
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    const changed = () => void load();
    window.addEventListener('bord:ai-jobs-changed', changed);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('bord:ai-jobs-changed', changed);
    };
  }, [profileId]);
  const active = jobs.filter(isActiveJob);
  if (!jobs.length) return null;
  return (
    <div className={styles.widget}>
      {open && (
        <section className={styles.panel} aria-label="Background AI tasks">
          <header>
            <strong>Background tasks</strong>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close background tasks"
            >
              <X size={18} />
            </button>
          </header>
          <div className={styles.tasks}>
            {jobs
              .slice(-10)
              .reverse()
              .map((job) => (
                <AiJobCard key={job.id} job={job} />
              ))}
          </div>
          <a href="/account/automation">Manage tasks and retries</a>
        </section>
      )}
      <button
        type="button"
        className={styles.trigger}
        aria-label={`Background AI tasks${active.length ? `: ${active.length} running` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Sparkles size={22} />
        {active.length > 0 && <ButtonSpinner />}
      </button>
    </div>
  );
}
