'use client';

import React from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { MemberNotificationsPanel } from '@/components/member-notifications-panel';
import { NavLinkItem } from '@/components/layout/nav-link';
import { GymSwitcher } from '@/components/gyms/GymSwitcher';
import { Activity, Home, Settings, Trophy, User } from 'lucide-react';
import type { GymBranding } from '@/lib/gym-member';
import { isFeatureEnabled, type FeatureFlags, type FeatureKey } from '@/lib/features';

const NAV_ITEMS: { href: string; label: string; icon: typeof Home; feature?: FeatureKey }[] = [
  { href: '/member', label: 'Home', icon: Home },
  { href: '/member/feed', label: 'Feed', icon: Activity, feature: 'member_feed' },
  { href: '/member/leaderboard', label: 'Ranks', icon: Trophy, feature: 'leaderboards' },
  { href: '/member/profile', label: 'Profile', icon: User },
  { href: '/member/settings', label: 'Settings', icon: Settings },
];

interface MemberShellProps {
  children: React.ReactNode;
  gymBranding: GymBranding | null;
  hasServerUser: boolean;
  features?: FeatureFlags;
}

export function MemberShell({ children, hasServerUser, features }: MemberShellProps) {
  const pathname = usePathname();
  const { profile, isLoading } = useAuth();
  const navItems = NAV_ITEMS.filter((item) => !item.feature || isFeatureEnabled(features, item.feature));

  if (isLoading && !hasServerUser) return <LoadingScreen />;

  const links = (layout: 'row' | 'column') => navItems.map(({ href, label, icon }) => (
    <NavLinkItem
      key={href}
      href={href}
      label={label}
      icon={icon}
      active={pathname === href}
      tone={layout === 'column' ? 'muted' : 'light'}
      layout={layout}
      className={layout === 'row' ? 'member-sidebar-link' : 'min-w-13 min-h-12 justify-center'}
    />
  ));

  return (
    <div className="member-app-shell">
      <aside className="member-sidebar" aria-label="Member navigation">
        <Image src="/stren-logo.svg" alt="Stren" width={102} height={35} priority className="h-auto w-25" />
        <div className="mt-10">
          <p className="member-eyebrow">Current gym</p>
          <div className="mt-2"><GymSwitcher variant="member" /></div>
        </div>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Primary navigation">{links('row')}</nav>
        <div className="mt-auto rounded-2xl border p-3" style={{ borderColor: 'var(--color-surface)', backgroundColor: 'var(--color-white)' }}>
          <div className="flex items-center gap-2.5">
            <span className="member-avatar-initial" aria-hidden="true">{profile?.name?.slice(0, 1).toUpperCase() ?? '?'}</span>
            <span className="min-w-0"><span className="block truncate text-sm font-semibold text-(--color-text-primary)">{profile?.name ?? 'Member'}</span><span className="block text-xs text-(--color-text-muted)">Member</span></span>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="member-mobile-header">
          <Image src="/stren-logo.svg" alt="Stren" width={106} height={36} priority className="h-auto w-26" />
          <MemberNotificationsPanel />
          <div className="col-span-2 mt-3"><GymSwitcher variant="member" /></div>
        </header>
        <main className="member-main" id="main-content">{children}</main>
      </div>

      <nav className="member-bottom-nav" aria-label="Primary navigation">{links('column')}</nav>
    </div>
  );
}
