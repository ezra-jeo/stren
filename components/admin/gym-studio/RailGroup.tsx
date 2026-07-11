'use client';

import { ChevronDown } from 'lucide-react';
import type { StudioGroupKey } from './GymPageStudio';

/**
 * Shared collapsible control-rail card (§7.3). A real `<button>` disclosure with
 * `aria-expanded` so groups are keyboard-operable (§7.10).
 */
export function RailGroup({
  id,
  icon,
  title,
  subtitle,
  badge,
  rightSlot,
  open,
  onToggle,
  children,
}: {
  id: StudioGroupKey;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
  rightSlot?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      id={`studio-group-${id}`}
      className="overflow-hidden rounded-[14px] border"
      style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)', scrollMarginTop: '16px' }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`studio-group-body-${id}`}
        className="flex w-full items-center gap-3 px-4 py-4 text-left"
      >
        <span
          className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg"
          style={{ backgroundColor: 'var(--color-primary-glow)', color: 'var(--color-primary)' }}
        >
          {icon}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14.5px] font-bold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}>
            {title}
          </span>
          <span className="block text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {subtitle}
          </span>
        </span>
        {badge}
        {rightSlot}
        <ChevronDown
          size={17}
          className="flex-none transition-transform"
          style={{ color: 'var(--color-text-muted)', transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>
      {open && (
        <div id={`studio-group-body-${id}`} className="px-4 pb-[17px]">
          {children}
        </div>
      )}
    </div>
  );
}

/** Small pill toggle used by publish/section visibility rows (real `role="switch"`). */
export function PillToggle({
  on,
  onLabel,
  offLabel,
  onClick,
  ariaLabel,
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      onClick={onClick}
      className="rounded-full px-3 py-1 text-xs font-semibold"
      style={{
        backgroundColor: on ? 'var(--color-success)' : 'var(--color-surface)',
        color: on ? 'var(--color-white)' : 'var(--color-text-secondary)',
      }}
    >
      {on ? onLabel : offLabel}
    </button>
  );
}
