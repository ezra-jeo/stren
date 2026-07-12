'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { MemberNotificationsPanel } from '@/components/member-notifications-panel';
import { NavLinkItem } from '@/components/layout/nav-link';
import { GymSwitcher } from '@/components/gyms/GymSwitcher';
import { Home, Activity, Trophy, User, Settings } from 'lucide-react';
import type { GymBranding } from '@/lib/gym-member';
import { isFeatureEnabled, type FeatureFlags, type FeatureKey } from '@/lib/features';

const NAV_ITEMS: { href: string; label: string; icon: typeof Home; feature?: FeatureKey }[] = [
  { href: '/member', label: 'Home', icon: Home },
  { href: '/member/feed', label: 'Feed', icon: Activity, feature: 'member_feed' },
  { href: '/member/leaderboard', label: 'Ranks', icon: Trophy, feature: 'leaderboards' },
  { href: '/member/settings', label: 'Settings', icon: Settings },
];

interface MemberShellProps {
  children: React.ReactNode;
  gymBranding: GymBranding | null;
  hasServerUser: boolean;
  /** Effective gym feature flags (§8.5). Wired server-side by Agent B; defaults to catalog-on. */
  features?: FeatureFlags;
}

export function MemberShell({ children, hasServerUser, features }: MemberShellProps) {
  const pathname = usePathname();
  const { profile, isLoading } = useAuth();
  const navItems = NAV_ITEMS.filter((item) => !item.feature || isFeatureEnabled(features, item.feature));

  // Middleware is the single auth guard — no client-side redirects here.
  // The active gym's name/logo is now shown by the gym switcher (§5 U3).
  if (isLoading && !hasServerUser) return <LoadingScreen />;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--color-background)' }}>
      <header
        className="hidden md:flex items-center justify-between px-6 py-3 border-b"
        style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
      >
        <div className="min-w-0 max-w-[240px] flex-1">
          <GymSwitcher variant="member" />
        </div>

        <div className="flex items-center gap-6">
          {navItems.map(({ href, label, icon }) => (
            <NavLinkItem
              key={href}
              href={href}
              label={label}
              icon={icon}
              active={pathname === href}
              tone="light"
            />
          ))}
          <NavLinkItem
            href="/member/profile"
            label={profile?.name ?? 'Profile'}
            icon={User}
            active={pathname === '/member/profile'}
            tone="light"
          />
          <MemberNotificationsPanel />
        </div>
      </header>

      <header
        className="md:hidden flex items-center justify-between px-4 py-3 border-b"
        style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
      >
        <div className="min-w-0 max-w-[190px] flex-1">
          <GymSwitcher variant="member" />
        </div>

        <div className="flex items-center gap-2">
          <MemberNotificationsPanel />
          <Link href="/member/profile">
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ backgroundColor: 'var(--color-primary-glow)', color: 'var(--color-primary)' }}
            >
              {profile?.name?.charAt(0)?.toUpperCase() ?? '?'}
            </div>
          </Link>
        </div>
      </header>

      <main className="flex-1 pb-20 md:pb-6">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {children}
        </div>
      </main>

      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 border-t flex justify-around py-2 z-50"
        style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
      >
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <NavLinkItem
              key={href}
              href={href}
              label={label}
              icon={Icon}
              active={isActive}
              tone="muted"
              layout="column"
            />
          );
        })}
        <NavLinkItem
          href="/member/profile"
          label="Profile"
          icon={User}
          active={pathname === '/member/profile'}
          tone="muted"
          layout="column"
        />
      </nav>
    </div>
  );
}
