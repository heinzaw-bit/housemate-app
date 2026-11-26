'use client';

import {
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  Megaphone,
  MessageSquareText,
  ShoppingBasket,
  Utensils,
} from 'lucide-react';

export const houseTools = [
  {
    id: 'meals',
    title: 'Meals',
    detail: 'Make plans and see who’s joining.',
    icon: Utensils,
    tone: 'green',
  },
  {
    id: 'shopping',
    title: 'Shopping',
    detail: 'Keep your shared list together.',
    icon: ShoppingBasket,
    tone: 'lilac',
  },
  {
    id: 'chores',
    title: 'Chores',
    detail: 'See what needs doing next.',
    icon: ClipboardCheck,
    tone: 'blue',
  },
  {
    id: 'events',
    title: 'Events',
    detail: 'Bring everyone into the plan.',
    icon: CalendarDays,
    tone: 'amber',
  },
  {
    id: 'announcements',
    title: 'Announcements',
    detail: 'Keep important updates visible.',
    icon: Megaphone,
    tone: 'coral',
  },
  {
    id: 'polls',
    title: 'Polls',
    detail: 'Make everyday decisions together.',
    icon: MessageSquareText,
    tone: 'blue',
  },
] as const;

export type HouseView = (typeof houseTools)[number]['id'];

export function HouseTools({
  view,
  onSelect,
  disabled = false,
}: {
  view: HouseView | null;
  onSelect: (view: HouseView) => void;
  disabled?: boolean;
}) {
  return (
    <nav className="design-tool-grid" aria-label="Board sections">
      {houseTools.map(({ id, title, detail, icon: Icon, tone }) => (
        <button
          type="button"
          key={id}
          className="design-tool"
          aria-label={title}
          aria-current={view === id ? 'page' : undefined}
          disabled={disabled}
          onClick={() => onSelect(id)}
        >
          <span className={`design-item-icon ${tone}`}>
            <Icon size={21} aria-hidden="true" />
          </span>
          <span className="design-row-copy">
            <strong>{title}</strong>
            <small>{detail}</small>
          </span>
          <ChevronRight size={17} aria-hidden="true" />
        </button>
      ))}
    </nav>
  );
}
