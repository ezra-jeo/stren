import { notFound } from 'next/navigation';
import { getPlatformAdminUser } from '@/lib/platform-admin';
import { SuperadminShell } from '@/components/superadmin/SuperadminShell';

/**
 * Defense-in-depth only — middleware.ts is the single auth guard and already
 * redirects non-operators to /gyms before this layout renders. notFound()
 * here covers the case middleware is ever bypassed.
 */
export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const user = await getPlatformAdminUser();
  if (!user || !user.email) notFound();

  return <SuperadminShell operatorEmail={user.email}>{children}</SuperadminShell>;
}
