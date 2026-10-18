'use client';

import { useEffect, useRef, type ComponentPropsWithoutRef } from 'react';
import { useModalSurface } from './use-modal-surface';
import styles from './app-dialog.module.css';

type AppDialogProps = Omit<ComponentPropsWithoutRef<'dialog'>, 'open' | 'onClose'> & {
  open?: boolean;
  onClose: () => void;
};

/** Shared native modal: focus containment, Escape, backdrop dismissal and scroll locking. */
export function AppDialog({
  open = true,
  onClose,
  className = '',
  children,
  ...props
}: AppDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const modal = useModalSurface({ open, onClose, panelRef: dialogRef });
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      dialog.close();
    };
  }, [open]);

  return (
    <dialog
      {...props}
      ref={dialogRef}
      className={`${styles.dialog} ${className}`}
      onKeyDown={(event) => {
        props.onKeyDown?.(event);
        if (!event.defaultPrevented) modal.onKeyDown(event);
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        props.onClick?.(event);
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
    >
      {children}
    </dialog>
  );
}
