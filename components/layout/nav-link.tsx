'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type NavTone = 'dark' | 'light' | 'muted';
type NavLayout = 'row' | 'column';

interface NavLinkProps {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  tone?: NavTone;
  layout?: NavLayout;
  className?: string;
  onClick?: () => void;
  prefetch?: boolean;
}

export function NavLinkItem({
  href,
  label,
  icon: Icon,
  active,
  tone = 'light',
  layout = 'row',
  className,
  onClick,
  prefetch,
}: NavLinkProps) {
  const isColumn = layout === 'column';

  const colorsByTone: Record<NavTone, { activeText: string; idleText: string; activeBg: string }> = {
    dark: {
      activeText: 'hsl(var(--primary-light))',
      idleText: 'hsl(var(--gray))',
      activeBg: 'hsl(var(--primary) / 0.12)',
    },
    light: {
      activeText: 'hsl(var(--primary))',
      idleText: 'hsl(var(--text-secondary))',
      activeBg: 'hsl(var(--primary-glow))',
    },
    muted: {
      activeText: 'hsl(var(--primary))',
      idleText: 'hsl(var(--text-muted))',
      activeBg: 'transparent',
    },
  };

  const toneStyles = colorsByTone[tone];

  return (
    <Link
      href={href}
      prefetch={prefetch}
      onClick={onClick}
      className={cn(
        'transition-all rounded-lg',
        isColumn
          ? 'flex flex-col items-center gap-0.5 px-3 py-1'
          : 'flex items-center gap-2 px-3 py-2 text-sm font-medium',
        className,
      )}
      style={{
        color: active ? toneStyles.activeText : toneStyles.idleText,
        backgroundColor: active ? toneStyles.activeBg : 'transparent',
      }}
    >
      <Icon size={isColumn ? 22 : 18} />
      <span className={isColumn ? 'text-[10px] font-medium' : undefined}>{label}</span>
    </Link>
  );
}
