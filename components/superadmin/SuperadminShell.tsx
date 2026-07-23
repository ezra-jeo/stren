'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { ClipboardList, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/components/layout/app-shell';
import { Spinner } from '@/components/ui/loading-screen';
import { useAuth } from '@/lib/auth-context';

const NAV_ITEMS = [
  { href: '/superadmin/onboarding/new', label: 'Assisted Onboarding', icon: ClipboardList },
];

/**
 * Simplified operator shell — one nav item, no gym switcher, no access
 * provider. Platform admins may have zero gyms, so the ordinary admin
 * layout (which requires an active gym via useAccess()) cannot be reused.
 */
export function SuperadminShell({ operatorEmail, children }: { operatorEmail: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const { signOut, isSigningOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  const brand = (
    <div className="flex items-center gap-2.5">
      <div className="relative h-8 w-8 shrink-0">
        <Image src="/stren-logo.png" alt="Stren" fill sizes="32px" className="object-contain" />
      </div>
      <span className="text-lg font-bold" style={{ color: 'hsl(var(--light-gray))' }}>
        Stren
      </span>
    </div>
  );

  const logoutButton = (
    <Button
      onClick={() => void signOut()}
      disabled={isSigningOut}
      variant="destructive"
      className="w-full justify-start gap-3 shadow-sm"
      style={{ backgroundColor: 'hsl(var(--destructive))', color: 'hsl(var(--destructive-foreground))' }}
    >
      {isSigningOut ? <Spinner size={18} color="currentColor" /> : <LogOut size={20} />}
      {isSigningOut ? 'Logging out...' : 'Logout'}
    </Button>
  );

  const desktopFooter = (
    <>
      <div className="px-2">
        <p className="text-sm font-medium truncate" style={{ color: 'hsl(var(--light-gray))' }}>
          {operatorEmail}
        </p>
        <p className="text-xs" style={{ color: 'hsl(var(--gray))' }}>
          Stren operator
        </p>
      </div>
      {logoutButton}
    </>
  );

  return (
    <AppShell
      desktopBrand={brand}
      mobileBrand={brand}
      navItems={NAV_ITEMS.map((item) => ({ ...item, active: pathname.startsWith(item.href) }))}
      desktopFooter={desktopFooter}
      mobileFooter={logoutButton}
      mobileMenuOpen={isOpen}
      onToggleMobileMenu={() => setIsOpen((prev) => !prev)}
      onCloseMobileMenu={() => setIsOpen(false)}
    >
      {children}
    </AppShell>
  );
}

