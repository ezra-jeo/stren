'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase';
import { NotificationsPanel } from '@/components/notifications-panel';
import { LoadingScreen, Spinner } from '@/components/ui/loading-screen';
import { AppShell } from '@/components/layout/app-shell';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  BarChart3,
  LogOut,
  Megaphone,
  Monitor,
  PackageOpen,
  Tag,
  Globe,
  type LucideIcon,
} from 'lucide-react';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: '/admin',                 label: 'Dashboard',     icon: LayoutDashboard },
  { href: '/admin/members',         label: 'Members',       icon: Users },
  { href: '/admin/payments',        label: 'Payments',      icon: CreditCard },
  { href: '/admin/plans',           label: 'Plans',         icon: PackageOpen },
  { href: '/admin/promos',          label: 'Promos',        icon: Tag },
  // { href: '/admin/announcements',   label: 'Announcements', icon: Megaphone },
  { href: '/admin/gym-profile',     label: 'Gym Page',      icon: Globe, ownerOnly: true },
  { href: '/admin/reports',         label: 'Reports',       icon: BarChart3 },
  { href: '/kiosk',                 label: 'Kiosk',         icon: Monitor },
];

const AUTH_LOADING_TIMEOUT_MS = 12000;
const PROFILE_GRACE_MS = 2500;

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, isLoading, isSigningOut, signOut, refreshProfile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [isOpen, setIsOpen] = useState(false);
  const [gymName, setGymName] = useState<string | null>(null);
  const [authTimeoutExceeded, setAuthTimeoutExceeded] = useState(false);
  const [profileGraceExceeded, setProfileGraceExceeded] = useState(false);

  useEffect(() => {
    if (isSigningOut) return;

    if (isLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }

    if (!profile) {
      return;
    }

    if (!['owner', 'admin', 'staff'].includes(profile.role)) {
      router.replace('/member');
    }
  }, [isLoading, isSigningOut, profile, router, user]);

  useEffect(() => {
    if (!isLoading || user) {
      setAuthTimeoutExceeded(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setAuthTimeoutExceeded(true);
    }, AUTH_LOADING_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isLoading, user]);

  useEffect(() => {
    if (!user || isLoading || profile) {
      setProfileGraceExceeded(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setProfileGraceExceeded(true);
    }, PROFILE_GRACE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isLoading, profile, user]);

  useEffect(() => {
    if (isSigningOut) return;

    if (!authTimeoutExceeded || user) return;
    router.replace('/login');
  }, [authTimeoutExceeded, isSigningOut, router, user]);

  // Fetch gym name once profile (and gymId) is available
  useEffect(() => {
    if (!profile?.gymId) return;
    supabase
      .from('gyms')
      .select('name')
      .eq('id', profile.gymId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.name) setGymName(data.name);
      });
  }, [profile?.gymId, supabase]);

  const visibleNavItems = useMemo(
    () =>
      NAV_ITEMS.filter((item) => {
        if (item.ownerOnly) return profile?.role === 'owner';
        return true;
      }),
    [profile?.role]
  );

  // Always collapse mobile menu after route changes.
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    if (isSigningOut) return;
    await signOut();
  };

  if (isLoading) return <LoadingScreen />;
  if (authTimeoutExceeded && !user) return <LoadingScreen />;

  if (!user) return <LoadingScreen />;

  if (!profile && profileGraceExceeded) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="max-w-md w-full rounded-xl border p-5 space-y-3" style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}>
          <p className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Loading your admin profile is taking longer than expected.</p>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            This can happen during temporary auth lock contention. You can retry or sign out and sign back in.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void refreshProfile()}
              className="rounded-md px-3 py-2 text-sm font-medium"
              style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }}
            >
              Retry
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md px-3 py-2 text-sm font-medium"
              style={{ backgroundColor: 'var(--color-danger)', color: 'var(--color-white)' }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) return <LoadingScreen />;

  const displayName = gymName ?? 'Stren';
  const displayInitial = displayName.charAt(0).toUpperCase();

  const GymBadge = () => (
    <div className="flex items-center gap-3">
      <div
        className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
        style={{ backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--white))' }}
      >
        {displayInitial}
      </div>
      <div className="min-w-0">
        <h1
          className="text-base font-bold leading-tight truncate"
          style={{ color: 'hsl(var(--primary-light))', fontFamily: 'var(--font-heading)' }}
        >
          {displayName}
        </h1>
        <p className="text-xs capitalize" style={{ color: 'hsl(var(--gray))' }}>
          {profile.role} Panel
        </p>
      </div>
    </div>
  );

  const desktopFooter = (
    <>
      <div className="px-2 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'hsl(var(--light-gray))' }}>
            {profile.email}
          </p>
          <p className="text-xs capitalize" style={{ color: 'hsl(var(--gray))' }}>
            {profile.role}
          </p>
        </div>
        <NotificationsPanel />
      </div>
      <Button
        onClick={handleLogout}
        disabled={isSigningOut}
        variant="destructive"
        className="w-full justify-start gap-3 shadow-sm"
        style={{ backgroundColor: 'hsl(var(--destructive))', color: 'hsl(var(--destructive-foreground))' }}
      >
        {isSigningOut ? <Spinner size={18} color="currentColor" /> : <LogOut size={20} />}
        {isSigningOut ? 'Logging out...' : 'Logout'}
      </Button>
    </>
  );

  const mobileFooter = (
    <Button
      onClick={handleLogout}
      disabled={isSigningOut}
      variant="destructive"
      className="w-full justify-start gap-3 shadow-sm"
      style={{ backgroundColor: 'hsl(var(--destructive))', color: 'hsl(var(--destructive-foreground))' }}
    >
      {isSigningOut ? <Spinner size={16} color="currentColor" /> : <LogOut size={20} />}
      {isSigningOut ? 'Logging out...' : 'Logout'}
    </Button>
  );

  return (
    <AppShell
      desktopBrand={<GymBadge />}
      mobileBrand={<GymBadge />}
      navItems={visibleNavItems.map((item) => ({
        href: item.href,
        label: item.label,
        icon: item.icon,
        active: item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href),
      }))}
      desktopFooter={desktopFooter}
      mobileFooter={mobileFooter}
      mobileHeaderActions={<NotificationsPanel />}
      mobileMenuOpen={isOpen}
      onToggleMobileMenu={() => setIsOpen((prev) => !prev)}
      onCloseMobileMenu={() => setIsOpen(false)}
    >
      {children}
    </AppShell>
  );
}