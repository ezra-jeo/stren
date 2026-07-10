import {
  LayoutDashboard,
  Users,
  CreditCard,
  BarChart3,
  Megaphone,
  Monitor,
  PackageOpen,
  Tag,
  Globe,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import type { PermissionKey } from '@/lib/permissions';
import type { FeatureKey } from '@/lib/features';
import { canUse, type MyAccess } from '@/lib/access';

/**
 * Admin nav config + filter (ImplementationPlan.md §6 client table, §7.9).
 * Each item declares the feature + permission gating it; `visibleAdminNav`
 * consumes `useAccess()` so hiding stays a courtesy over the server enforcement.
 */
export type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: PermissionKey;
  feature?: FeatureKey;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard:view' },
  { href: '/admin/members', label: 'Members', icon: Users, permission: 'members:view' },
  { href: '/admin/payments', label: 'Payments', icon: CreditCard, permission: 'payments:view' },
  { href: '/admin/plans', label: 'Plans', icon: PackageOpen, permission: 'plans:manage' },
  { href: '/admin/promos', label: 'Promos', icon: Tag, permission: 'promos:manage', feature: 'promos' },
  { href: '/admin/announcements', label: 'Announcements', icon: Megaphone, permission: 'announcements:manage', feature: 'announcements' },
  { href: '/admin/gym-profile', label: 'Gym Page', icon: Globe, permission: 'gym_page:view' },
  { href: '/admin/access', label: 'People & access', icon: ShieldCheck, permission: 'roles:manage' },
  { href: '/admin/reports', label: 'Reports', icon: BarChart3, permission: 'reports:attendance:view' },
  { href: '/kiosk', label: 'Kiosk', icon: Monitor, permission: 'kiosk:use', feature: 'kiosk_checkin' },
];

export function visibleAdminNav(access: MyAccess): AdminNavItem[] {
  return ADMIN_NAV_ITEMS.filter((item) => canUse(access, item.feature ?? null, item.permission ?? null));
}
