'use client';

import { FileImage, FileText, Link2, Plus, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useRef, type RefObject } from 'react';

import { useModalSurface } from '@/components/use-modal-surface';

const options = [
  { href: '/recipes/new', label: 'From scratch', icon: FileText },
  { href: '/capture?mode=text', label: 'Paste/AI Recipe', icon: Sparkles },
  { href: '/capture?mode=url', label: 'From URL', icon: Link2 },
  { href: '/import', label: 'From Image', icon: FileImage },
] as const;

export function AddRecipeTrigger({ open }: { open: boolean }) {
  return (
    <Link
      className="primary-button"
      href="/?add=recipe"
      scroll={false}
      aria-controls="add-recipe-dialog"
      aria-expanded={open}
      aria-haspopup="dialog"
    >
      <Plus size={18} aria-hidden="true" /> Add a recipe
    </Link>
  );
}

type AddRecipeDialogProps = {
  open: boolean;
  onClose?: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

export function AddRecipeDialog({ open, onClose, returnFocusRef }: AddRecipeDialogProps) {
  const panelRef = useRef<HTMLElement>(null);
  const closeControlRef = useRef<HTMLElement>(null);
  const close = onClose ?? (() => closeControlRef.current?.click());
  const modal = useModalSurface({
    open,
    onClose: close,
    panelRef,
    initialFocusRef: closeControlRef,
    returnFocusRef,
  });

  if (!open) return null;

  return (
    <div className="add-recipe-dialog-backdrop">
      {onClose ? (
        <button
          className="add-recipe-dialog-dismiss"
          type="button"
          onClick={onClose}
          tabIndex={-1}
          aria-hidden="true"
        />
      ) : (
        <Link
          className="add-recipe-dialog-dismiss"
          href="/"
          replace
          scroll={false}
          tabIndex={-1}
          aria-hidden="true"
        />
      )}
      <section
        id="add-recipe-dialog"
        className="add-recipe-dialog-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-recipe-title"
        aria-describedby="add-recipe-description"
        tabIndex={-1}
        onKeyDown={modal.onKeyDown}
      >
        {onClose ? (
          <button
            className="add-recipe-dialog-close"
            ref={(node) => {
              closeControlRef.current = node;
            }}
            type="button"
            onClick={onClose}
            aria-label="Close add recipe dialog"
          >
            <X size={22} aria-hidden="true" />
          </button>
        ) : (
          <Link
            className="add-recipe-dialog-close"
            ref={(node) => {
              closeControlRef.current = node;
            }}
            href="/"
            replace
            scroll={false}
            aria-label="Close add recipe dialog"
          >
            <X size={22} aria-hidden="true" />
          </Link>
        )}
        <div className="add-recipe-dialog-heading">
          <h2 id="add-recipe-title">How would you like to add it?</h2>
          <p id="add-recipe-description">
            Choose a starting point. You’ll review everything before it joins your cookbook.
          </p>
        </div>
        <div className="add-recipe-options">
          {options.map(({ href, label, icon: Icon }) => (
            <Link href={href} key={href} onClick={onClose}>
              <Icon size={31} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
