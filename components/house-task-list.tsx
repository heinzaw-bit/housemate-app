'use client';

import { ChevronRight, type LucideIcon } from 'lucide-react';
import {
  type MouseEventHandler,
  type ReactNode,
  useEffect,
  useRef,
} from 'react';
import { Badge } from '@/components/ui/badge';

export function HouseTaskRow({
  title,
  status,
  icon: Icon,
  tone,
  active,
  disabled,
  onClick,
  children,
}: {
  title: string;
  status: string;
  icon: LucideIcon;
  tone: 'blue' | 'lilac';
  active: boolean;
  disabled: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-current={active ? 'true' : undefined}
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left hover:bg-muted/40 disabled:cursor-not-allowed ${active ? 'border-primary bg-primary/5' : 'border-border'}`}
    >
      <span className={`design-item-icon ${tone} shrink-0`}>
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <strong className="break-words">{title}</strong>
          <Badge variant="outline" className="capitalize">
            {status}
          </Badge>
        </span>
        <span className="block text-xs text-muted-foreground">{children}</span>
      </span>
      <ChevronRight
        size={16}
        className="shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </button>
  );
}

export function useHouseTaskFocus(
  formOpen: boolean,
  createRequest: number,
  selectedId: string | undefined,
) {
  const name = useRef<HTMLInputElement>(null);
  const detail = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLButtonElement>(null);
  const filters = useRef<HTMLFieldSetElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Refocus the open form when the header action is used again.
  useEffect(() => {
    if (!formOpen) return;
    name.current?.focus({ preventScroll: true });
    name.current?.closest('form')?.scrollIntoView({ block: 'start' });
  }, [formOpen, createRequest]);

  useEffect(() => {
    if (
      !formOpen &&
      selectedId &&
      window.matchMedia('(max-width: 1023px)').matches
    ) {
      detail.current?.focus({ preventScroll: true });
      detail.current?.scrollIntoView({ block: 'start' });
    }
  }, [formOpen, selectedId]);

  function back(close: () => void) {
    close();
    requestAnimationFrame(() => {
      const fallback = filters.current?.querySelector<HTMLButtonElement>(
        'button[aria-pressed="true"]',
      );
      (row.current?.isConnected ? row.current : fallback)?.focus();
    });
  }

  return { name, detail, row, filters, back };
}
