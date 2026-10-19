'use client';
import { useRef, useState } from 'react';
import { Sparkles, Wrench, X } from 'lucide-react';
import type { DecisionTask } from '@/lib/domain/decision-assistance';
import { DecisionAssistance } from './decision-assistance';

export function AssistedReviewButton({
  task,
  tasks,
  query,
  onApplied,
  title = 'Assisted review',
}: {
  task: DecisionTask;
  tasks?: DecisionTask[];
  query?: string;
  onApplied?: () => void;
  title?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [opened, setOpened] = useState(false);
  return (
    <>
      <button
        type="button"
        className="assisted-review-trigger"
        title={title}
        aria-label={title}
        aria-haspopup="dialog"
        onClick={() => {
          setOpened(true);
          dialog.current?.showModal();
        }}
      >
        <span className="assisted-review-icon">
          <Wrench />
          <Sparkles />
        </span>
        <span className="action-label">Review</span>
      </button>
      <dialog ref={dialog} className="assisted-review-dialog" aria-labelledby={`review-${task}`}>
        <header>
          <div>
            <h2 id={`review-${task}`}>{title}</h2>
            <p>
              {task === 'pantry_review' || task === 'restock' ? (
                'Review household stock and restock policies. Pantry search and filters do not limit this review.'
              ) : (
                <>
                  Review {query ? `recipes matching “${query}”` : 'saved recipes'}. Other library
                  filters and selected recipes do not limit this review.
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close assisted review"
            onClick={() => dialog.current?.close()}
          >
            <X />
          </button>
        </header>
        {opened ? (
          <DecisionAssistance
            embedded
            initiallyExpanded
            hideContextHeader
            initialTask={task}
            tasks={tasks}
            inputQuery={query}
            onApplied={onApplied}
          />
        ) : null}
      </dialog>
    </>
  );
}
