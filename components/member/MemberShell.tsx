'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { MemberNotificationsPanel } from '@/components/member-notifications-panel';
import { NavLinkItem } from '@/components/layout/nav-link';
import { GymSwitcher } from '@/components/gyms/GymSwitcher';
import { Activity, Home, Settings, Trophy, User } from 'lucide-react';
import type { GymBranding } from '@/lib/gym-member';
import { isFeatureEnabled, type FeatureFlags, type FeatureKey } from '@/lib/features';
import { RouteContent } from '@/components/layout/route-content';
import { FirstLoginPasswordSetup } from '@/components/member/FirstLoginPasswordSetup';
import { DemoModeBanner } from '@/components/member/demo/DemoModeBanner';
import { DEMO_MEMBER_DATA, demoInitials } from '@/lib/demo-member';

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
  demoMode?: boolean;
}

export function MemberShell({ children, hasServerUser, features, demoMode = false }: MemberShellProps) {
  const pathname = usePathname();
  const { profile, isLoading } = useAuth();
  const navItems = NAV_ITEMS
    .filter((item) => demoMode || !item.feature || isFeatureEnabled(features, item.feature))
    .map((item) => demoMode ? {
      ...item,
      href: item.href === '/member'
        ? '/member/demo'
        : item.href === '/member/leaderboard'
          ? '/member/demo/ranks'
          : `/member/demo/${item.href.split('/').pop()}`,
    } : item);

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
        <Image src="/stren-logo.png" alt="Stren" width={102} height={35} priority className="h-auto w-25" />
        <div className="mt-10">
          <p className="member-eyebrow">Current gym</p>
          <div className="mt-2">{demoMode ? <DemoGymIdentity /> : <GymSwitcher variant="member" />}</div>
        </div>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Primary navigation">{links('row')}</nav>
        <Link href={demoMode ? '/member/demo/profile' : '/member/profile'} aria-label="Open your profile" className="mt-auto rounded-2xl border p-3 transition-colors hover:bg-(--color-background) focus-visible:outline-3 focus-visible:outline-(--color-primary-glow) focus-visible:outline-offset-3" style={{ borderColor: 'var(--color-surface)', backgroundColor: 'var(--color-white)' }}>
          <div className="flex items-center gap-2.5">
            {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="member-avatar-initial" aria-hidden="true">{demoInitials(profile?.name)}</span>}
            <span className="min-w-0"><span className="block truncate text-sm font-semibold text-(--color-text-primary)">{profile?.name ?? 'Member'}</span><span className="block text-xs text-(--color-text-muted)">Member</span></span>
          </div>
        </Link>
      </aside>

      <div className="min-w-0">
        <header className="member-mobile-header">
          <Image src="/stren-logo.png" alt="Stren" width={106} height={36} priority className="h-auto w-26" />
          {demoMode ? <span className="member-avatar-initial" aria-hidden="true">{demoInitials(profile?.name)}</span> : <MemberNotificationsPanel />}
          <div className="col-span-2 mt-3">{demoMode ? <DemoGymIdentity /> : <GymSwitcher variant="member" />}</div>
        </header>
        <main className="member-main" id="main-content">
          {demoMode && <DemoModeBanner />}
          <RouteContent>{children}</RouteContent>
        </main>
      </div>

      <nav className="member-bottom-nav" aria-label="Primary navigation">{links('column')}</nav>
      {!demoMode && <FirstLoginPasswordSetup />}
    </div>
  );
}

function DemoGymIdentity() {
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5" aria-label="Current demo gym">
      <Image src="/stren-logo.png" alt="" width={36} height={36} className="h-9 w-9 object-contain" />
      <div className="min-w-0"><p className="truncate text-sm font-bold text-(--color-text-primary)">{DEMO_MEMBER_DATA.gym.name}</p><p className="text-[11px] text-(--color-text-muted)">{DEMO_MEMBER_DATA.gym.subtitle}</p></div>
    </div>
  );
}
