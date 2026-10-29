'use client';

import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import {
  createContext,
  Children,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

type ToastTone = 'success' | 'error' | 'info';

export type ToastOptions = {
  key?: string;
  actions?: Array<{ label: string; onClick: () => void | Promise<void> }>;
  /** Buttons normally keep a notification until used; this lets a short offer such as Undo lapse. */
  autoDismissMs?: number;
};

type Toast = ToastOptions & {
  id: number;
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone, options?: ToastOptions) => () => void;
  dismissToast: (key: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);
const ToastRegionContext = createContext<HTMLElement | null>(null);

const CONTROLS = new Set(['details', 'summary', 'input', 'select', 'textarea']);

function noticeContent(children: ReactNode): {
  text: string;
  actionable: boolean;
  interactive: boolean;
} {
  let text = '';
  let actionable = false;
  let interactive = false;
  Children.forEach(children, (child) => {
    if (typeof child === 'string' || typeof child === 'number') text += String(child);
    else if (isValidElement<{ children?: ReactNode; href?: string; onClick?: unknown }>(child)) {
      const nested = noticeContent(child.props.children);
      text += nested.text;
      actionable ||=
        nested.actionable ||
        child.type === 'button' ||
        Boolean(child.props.href || child.props.onClick);
      interactive ||= nested.interactive || CONTROLS.has(child.type as string);
    }
  });
  return { text, actionable, interactive };
}

/** Declarative feedback shares the global region, including existing rich review actions. */
export function ToastNotice({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: ToastTone | 'warning';
}) {
  const content = noticeContent(children);
  return (
    <NoticeContent
      key={`${tone}:${content.text}`}
      tone={tone === 'warning' ? 'info' : tone}
      sticky={content.actionable}
      interactive={content.interactive}
    >
      {children}
    </NoticeContent>
  );
}

function NoticeContent({
  children,
  tone,
  sticky,
  interactive,
}: {
  children: ReactNode;
  tone: ToastTone;
  sticky: boolean;
  /** Holds controls (such as expandable details) that must stay usable until dismissed. */
  interactive: boolean;
}) {
  const region = useContext(ToastRegionContext);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (sticky || interactive) return;
    const timer = setTimeout(() => setVisible(false), tone === 'error' ? 7000 : 4500);
    return () => clearTimeout(timer);
  }, [sticky, interactive, tone]);
  if (!visible) return null;
  const notice = (
    <div
      className={`toast toast-${tone}`}
      data-actionable={sticky || interactive}
      data-dismissible={(!sticky && interactive) || undefined}
      role={tone === 'error' ? 'alert' : 'status'}
      onClick={(event) => {
        const link = (event.target as HTMLElement).closest('a[href]');
        if (sticky && link && link.getAttribute('aria-disabled') !== 'true') setVisible(false);
      }}
    >
      <ToastIcon tone={tone} />
      <div>{children}</div>
      {!sticky && (
        <button
          type="button"
          className="toast-dismiss"
          aria-label="Dismiss notification"
          onClick={() => setVisible(false)}
        >
          <X size={17} aria-hidden="true" />
        </button>
      )}
    </div>
  );
  return region ? createPortal(notice, region) : notice;
}

function ToastIcon({ tone }: { tone: ToastTone }) {
  if (tone === 'success') return <CheckCircle2 size={20} aria-hidden="true" />;
  if (tone === 'error') return <AlertCircle size={20} aria-hidden="true" />;
  return <Info size={20} aria-hidden="true" />;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [region, setRegion] = useState<HTMLElement | null>(null);
  const [modal, setModal] = useState<HTMLDialogElement | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    // Native modal dialogs make the rest of the document inert. Keep notification
    // actions inside the active dialog so they remain keyboard and pointer accessible.
    const update = () => {
      const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog[open]');
      const active = dialogs.item(dialogs.length - 1);
      setModal((current) => (current === active ? current : active));
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open'],
    });
    queueMicrotask(update);
    return () => observer.disconnect();
  }, []);

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, tone: ToastTone = 'info', options: ToastOptions = {}) => {
      const id = ++nextId.current;
      setToasts((current) => {
        if (
          current.some((t) =>
            options.key
              ? t.key === options.key || (!t.key && t.message === message && t.tone === tone)
              : t.message === message && t.tone === tone,
          )
        )
          return current;
        const sticky = current.filter((t) => t.actions?.length);
        const ordinary = current.filter((t) => !t.actions?.length).slice(-2);
        return [...sticky, ...ordinary, { id, message, tone, ...options }];
      });
      if (options.actions?.length && !options.autoDismissMs) return () => dismiss(id);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), options.autoDismissMs ?? (tone === 'error' ? 7000 : 4500)),
      );
      return () => dismiss(id);
    },
    [dismiss],
  );

  useEffect(
    () => () => {
      timers.current.forEach((timer) => clearTimeout(timer));
      timers.current.clear();
    },
    [],
  );

  const dismissToast = useCallback((key: string) => {
    setToasts((current) => current.filter((t) => t.key !== key));
  }, []);
  const value = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  const notices = (
    <div
      ref={setRegion}
      className="toast-region"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          className={`toast toast-${toast.tone}`}
          key={toast.id}
          data-actionable={Boolean(toast.actions?.length)}
          role={toast.tone === 'error' ? 'alert' : 'status'}
        >
          <ToastIcon tone={toast.tone} />
          <span>{toast.message}</span>
          {toast.actions?.map((action) => (
            <button
              type="button"
              key={action.label}
              onClick={() => {
                void action.onClick();
              }}
            >
              {action.label}
            </button>
          ))}
          {!toast.actions?.length && (
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              <X size={17} aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
  return (
    <ToastContext.Provider value={value}>
      <ToastRegionContext.Provider value={region}>
        {children}
        {modal ? createPortal(notices, modal) : notices}
      </ToastRegionContext.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider.');
  return context;
}
