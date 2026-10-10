'use client';

import { Check } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { STATUS_LABELS, type ProjectStatus } from '@/lib/types';

/* Buttons. One primary (terracotta) per screen. */
const btnBase =
  'inline-flex flex-none cursor-pointer items-center justify-center gap-1.5 rounded-full font-semibold whitespace-nowrap transition-[background-color,transform] duration-[90ms] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45';
export const btn = {
  primary: `${btnBase} bg-terracotta text-white hover:bg-terracotta-hover`,
  secondary: `${btnBase} border border-border font-medium text-text hover:bg-hover`,
  ghost: `${btnBase} font-medium text-text hover:bg-hover`,
  danger: `${btnBase} bg-danger-fill text-white hover:brightness-95`,
  dangerGhost: `${btnBase} font-medium text-danger hover:bg-hover`,
};

/* Inputs: surface fill, 1px border, terracotta focus ring, label above in 500. */
export const inputClass =
  'w-full rounded-xl border border-border bg-surface px-3.5 text-text outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted focus:border-terracotta focus:shadow-focus disabled:opacity-50';

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-[14px] font-medium">
      {label}
      {children}
      {error ? (
        <span className="text-[13px] font-normal text-danger">{error}</span>
      ) : hint ? (
        <span className="text-[13px] font-normal text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

/* Toggle switch: fully round, terracotta when on. */
export function Switch({
  on,
  onChange,
  label,
  size = 'md',
}: {
  on: boolean;
  onChange?: (on: boolean) => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  const track = size === 'sm' ? 'h-[22px] w-9' : 'h-6 w-10';
  const knob = size === 'sm' ? 'size-4' : 'size-[18px]';
  const Tag = onChange ? 'button' : 'span';
  return (
    <Tag
      {...(onChange ? { type: 'button' as const, onClick: () => onChange(!on) } : {})}
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`flex flex-none cursor-pointer rounded-full p-[3px] transition-colors duration-150 ${track} ${
        on ? 'justify-end bg-terracotta' : 'justify-start bg-border'
      }`}
    >
      <span className={`block rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.25)] ${knob}`} />
    </Tag>
  );
}

/* Status pills: fully round, always carry a text label. */
export const STATUS_STYLE: Record<ProjectStatus, { pill: string; dot: string }> = {
  draft: { pill: 'bg-sel text-muted', dot: 'bg-muted' },
  pitch_sent: { pill: 'bg-warn-bg text-warn', dot: 'bg-warn-fill' },
  client_approved: { pill: 'bg-accent-bg text-accent-text', dot: 'bg-terracotta' },
  live: { pill: 'bg-success-bg text-success', dot: 'bg-success' },
};

export function StatusPill({ status, large = false }: { status: ProjectStatus; large?: boolean }) {
  return (
    <span
      className={`rounded-full font-medium whitespace-nowrap ${STATUS_STYLE[status].pill} ${
        large ? 'px-[11px] py-1 text-[12px]' : 'px-[9px] py-[3px] text-[11px]'
      }`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

/* Segmented control, used for link expiry. */
export function Segmented<T extends string | number | null>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full bg-sel p-[3px]">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`flex h-8 cursor-pointer items-center rounded-full px-3 text-[13px] font-medium ${
              on ? 'bg-surface text-text shadow-[0_1px_3px_rgba(0,0,0,.12)]' : 'text-muted'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* Toasts: bottom-right, short, with an optional action. */
interface ToastAction {
  label: string;
  href?: string;
  onClick?: () => void;
}
interface ToastState {
  id: number;
  text: string;
  action?: ToastAction;
}

const ToastContext = createContext<(text: string, action?: ToastAction) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((text: string, action?: ToastAction) => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), text, action });
    timer.current = setTimeout(() => setToast(null), 3000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-5 bottom-[84px] z-40 md:bottom-5">
        {toast && (
          <div
            key={toast.id}
            className="pointer-events-auto flex max-w-[calc(100vw-40px)] animate-fade-up items-center gap-3.5 rounded-xl border border-border bg-raised px-4 py-3 text-[14px] shadow-raised"
          >
            <Check size={16} strokeWidth={2} className="flex-none text-success" />
            <span>{toast.text}</span>
            {toast.action &&
              (toast.action.href ? (
                <a
                  href={toast.action.href}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-accent-text hover:underline"
                >
                  {toast.action.label}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={toast.action.onClick}
                  className="cursor-pointer font-medium text-accent-text hover:underline"
                >
                  {toast.action.label}
                </button>
              ))}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

/* Dialogs: only for destructive or irreversible actions. */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  pending,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(22,20,15,.45)] p-5"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
        className="flex w-[420px] max-w-full animate-fade-up flex-col gap-3 rounded-dialog border border-border bg-raised p-6 shadow-raised"
      >
        <h2 id="confirm-title" className="m-0 text-[20px] font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        <p className="m-0 text-[14px] leading-[1.55] text-muted">{body}</p>
        <div className="flex justify-end gap-2 pt-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className={`${btn.secondary} h-10 px-4 text-[14px]`}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={pending} className={`${btn.danger} h-10 px-4 text-[14px]`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
