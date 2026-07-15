'use client';

import { MemberHomeClient } from '@/components/member/MemberHomeClient';
import { useAuth } from '@/lib/auth-context';
import { DEMO_MEMBER_DATA } from '@/lib/demo-member';

export default function DemoMemberHomePage() {
  const { profile } = useAuth();
  return (
    <MemberHomeClient
      demoMode
      data={{ ...DEMO_MEMBER_DATA.home, memberName: profile?.name?.trim() || 'Member' }}
    />
  );
}
