'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/components/layout/app-shell';
import {
  LayoutDashboard,
  Users,
  QrCode,
  BarChart3,
  Settings,
  LogOut,
  Calendar,
  CreditCard,
  UserCog,
} from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<{ email: string; role: string } | null>(null);

  useEffect(() => {
    // Check if user is authenticated
    const session = localStorage.getItem('session');
    if (!session) {
      router.push('/');
      return;
    }
    setUser(JSON.parse(session));
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('session');
    router.push('/');
  };

  if (!user) return null;

  const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Members', href: '/dashboard/members', icon: Users },
    { label: 'Check-In', href: '/dashboard/checkin', icon: QrCode },
    { label: 'Classes', href: '/dashboard/classes', icon: Calendar },
    { label: 'Plans', href: '/dashboard/plans', icon: CreditCard },
    { label: 'Staff', href: '/dashboard/staff', icon: UserCog },
    { label: 'Reports', href: '/dashboard/reports', icon: BarChart3 },
    { label: 'Settings', href: '/dashboard/settings', icon: Settings },
  ];

  const desktopBrand = (
    <div className="flex items-center gap-3 mb-8">
      <div className="h-8 w-8 relative">
        <Image src="/stren-logo.png" alt="Stren" fill className="object-contain" />
      </div>
      <h1 className="text-xl font-bold" style={{ color: 'hsl(var(--primary-light))' }}>Stren</h1>
    </div>
  );

  const mobileBrand = (
    <div className="flex items-center gap-3">
      <div className="h-6 w-6 relative">
        <Image src="/stren-logo.png" alt="Stren" fill className="object-contain" />
      </div>
      <h1 className="text-lg font-bold" style={{ color: 'hsl(var(--primary-light))' }}>Stren</h1>
    </div>
  );

  const desktopFooter = (
    <>
      <div className="px-2">
        <p className="text-sm font-medium truncate" style={{ color: 'hsl(var(--light-gray))' }}>
          {user.email}
        </p>
        <p className="text-xs capitalize" style={{ color: 'hsl(var(--gray))' }}>
          {user.role}
        </p>
      </div>
      <Button
        onClick={handleLogout}
        variant="destructive"
        className="w-full justify-start gap-3"
      >
        <LogOut size={20} />
        Logout
      </Button>
    </>
  );

  const mobileFooter = (
    <Button
      onClick={handleLogout}
      variant="destructive"
      className="w-full justify-start gap-3"
    >
      <LogOut size={20} />
      Logout
    </Button>
  );

  return (
    <AppShell
      desktopBrand={desktopBrand}
      mobileBrand={mobileBrand}
      navItems={navItems.map((item) => ({
        ...item,
        active: pathname === item.href,
      }))}
      desktopFooter={desktopFooter}
      mobileFooter={mobileFooter}
      mobileMenuOpen={isOpen}
      onToggleMobileMenu={() => setIsOpen((prev) => !prev)}
      onCloseMobileMenu={() => setIsOpen(false)}
    >
      {children}
    </AppShell>
  );
}
