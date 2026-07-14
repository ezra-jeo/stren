'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { browserAllowsPrefetch } from '@/lib/navigation-performance';

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
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
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
  const pathname = usePathname();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const prefetched = useRef(false);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visualActive = active || pending;

  useEffect(() => {
    if (active || pathname === href) {
      setPending(false);
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
  }, [active, href, pathname]);

  useEffect(() => () => {
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
  }, []);

  function isPrimarySameTabNavigation(event: React.MouseEvent<HTMLAnchorElement>) {
    return event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey &&
      event.currentTarget.target !== '_blank';
  }

  function prefetchOnIntent() {
    if (prefetch === false || prefetched.current || !browserAllowsPrefetch()) return;
    prefetched.current = true;
    router.prefetch(href);
  }

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
      prefetch={false}
      onPointerEnter={prefetchOnIntent}
      onFocus={prefetchOnIntent}
      onTouchStart={prefetchOnIntent}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || !isPrimarySameTabNavigation(event)) return;
        if (pending) {
          event.preventDefault();
          return;
        }
        if (!active && pathname !== href) {
          setPending(true);
          pendingTimer.current = setTimeout(() => {
            setPending(false);
            pendingTimer.current = null;
          }, 4_000);
        }
      }}
      aria-current={active ? 'page' : undefined}
      aria-busy={pending || undefined}
      data-navigation-pending={pending ? 'true' : undefined}
      className={cn(
        'rounded-lg transition-[color,background-color,transform] duration-100 active:scale-[0.98]',
        isColumn
          ? 'flex flex-col items-center gap-0.5 px-3 py-1'
          : 'flex items-center gap-2 px-3 py-2 text-sm font-medium',
        className,
      )}
      style={{
        color: visualActive ? toneStyles.activeText : toneStyles.idleText,
        backgroundColor: visualActive ? toneStyles.activeBg : 'transparent',
      }}
    >
      <Icon size={isColumn ? 22 : 18} />
      <span className={isColumn ? 'text-[10px] font-medium' : undefined}>{label}</span>
    </Link>
  );
}
