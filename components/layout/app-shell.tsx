'use client';

import Link from 'next/link';
import { Menu, X, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NavLinkItem } from '@/components/layout/nav-link';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
};

interface AppShellProps {
  children: React.ReactNode;
  desktopBrand: React.ReactNode;
  mobileBrand: React.ReactNode;
  navItems: NavItem[];
  desktopFooter: React.ReactNode;
  mobileFooter: React.ReactNode;
  mobileHeaderActions?: React.ReactNode;
  mobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
  onCloseMobileMenu: () => void;
}

export function AppShell({
  children,
  desktopBrand,
  mobileBrand,
  navItems,
  desktopFooter,
  mobileFooter,
  mobileHeaderActions,
  mobileMenuOpen,
  onToggleMobileMenu,
  onCloseMobileMenu,
}: AppShellProps) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'hsl(var(--background))' }}>
      <aside
        className="hidden md:fixed md:left-0 md:top-0 md:h-screen md:w-64 md:border-r md:flex md:flex-col md:p-6"
        style={{
          backgroundColor: 'hsl(var(--charcoal))',
          borderColor: 'hsl(var(--graphite))',
        }}
      >
        <div className="mb-8">{desktopBrand}</div>

        <nav className="flex-1 space-y-1">
          {navItems.map(({ label, href, icon, active }) => (
            <NavLinkItem
              key={href}
              href={href}
              label={label}
              icon={icon}
              active={active}
              tone="dark"
              prefetch={href.startsWith('/admin') || href.startsWith('/dashboard')}
              className="w-full justify-start gap-3 rounded-md px-4 py-3 text-sm font-medium"
            />
          ))}
        </nav>

        <div className="space-y-4 pt-4 border-t" style={{ borderColor: 'hsl(var(--graphite))' }}>
          {desktopFooter}
        </div>
      </aside>

      <main className="md:ml-64">
        <div
          className="md:hidden sticky top-0 z-40 border-b p-4 flex items-center justify-between"
          style={{
            backgroundColor: 'hsl(var(--charcoal))',
            borderColor: 'hsl(var(--graphite))',
          }}
        >
          {mobileBrand}
          <div className="flex items-center gap-1">
            {mobileHeaderActions}
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleMobileMenu}
              style={{ color: 'hsl(var(--gray))' }}
            >
              {mobileMenuOpen ? <X /> : <Menu />}
            </Button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div
            className="md:hidden border-b p-4 space-y-2"
            style={{
              backgroundColor: 'hsl(var(--charcoal))',
              borderColor: 'hsl(var(--graphite))',
            }}
          >
            {navItems.map(({ label, href, icon, active }) => (
              <NavLinkItem
                key={href}
                href={href}
                label={label}
                icon={icon}
                active={active}
                tone="dark"
                className="w-full justify-start gap-3"
                onClick={onCloseMobileMenu}
              />
            ))}
            <div className="pt-4">{mobileFooter}</div>
          </div>
        )}

        <div className="p-4 md:p-8" style={{ backgroundColor: 'hsl(var(--background))' }}>
          {children}
        </div>
      </main>
    </div>
  );
}
