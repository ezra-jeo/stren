import { headers } from 'next/headers';
import { brandColorVars } from '@/lib/brand-color';
import { getGymBrandingById } from '@/lib/gym-member';
import { MemberShell } from '@/components/member/MemberShell';
import type { GymBranding } from '@/lib/gym-member';
import { getMyAccess } from '@/lib/permissions-server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { LapsedLockScreen } from '@/components/member/LapsedLockScreen';

export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const headerGymId = requestHeaders.get('x-gym-id');
  const headerUserRole = requestHeaders.get('x-user-role');
  const demoMode = requestHeaders.get('x-demo-mode') === '1';

  if (demoMode) {
    return (
      <>
        <style>{`:root { ${brandColorVars('#D56A28', null)} }`}</style>
        <MemberShell gymBranding={null} hasServerUser demoMode>{children}</MemberShell>
      </>
    );
  }

  const supabase = await createServerSupabaseClient();
  const [access, { data: memberStats }] = await Promise.all([
    getMyAccess(supabase),
    supabase.rpc('member_home_stats'),
  ]);

  let gymBranding: GymBranding | null = null;
  if (headerGymId) {
    gymBranding = await getGymBrandingById(headerGymId);
  }

  const hasServerUser = Boolean(headerUserRole);

  const brandColor = gymBranding?.brand_color ?? '#D4956A';
  const secondaryColor = gymBranding?.secondary_color ?? null;
  const subscription = memberStats as {
    subscription_status?: string;
    lapsed_summary?: { current_streak?: number; total_visits?: number; member_since?: string };
  } | null;
  const lapsed = subscription?.lapsed_summary as {
    current_streak?: number; best_streak?: number; total_visits?: number; member_since?: string | null;
  } | undefined;
  const content = subscription?.subscription_status === 'expired' ? (
    <LapsedLockScreen
      gymName={gymBranding?.name}
      summary={{
        current_streak: lapsed?.current_streak ?? 0,
        best_streak: lapsed?.best_streak ?? 0,
        total_visits: lapsed?.total_visits ?? 0,
        member_since: lapsed?.member_since ?? null,
      }}
    />
  ) : children;

  return (
    <>
      <style>{`:root { ${brandColorVars(brandColor, secondaryColor)} }`}</style>
      <MemberShell gymBranding={gymBranding} hasServerUser={hasServerUser} features={access.features}>
        {content}
      </MemberShell>
    </>
  );
}
