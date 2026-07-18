import { NextResponse } from 'next/server';
import { requirePlatformAdminApi } from '@/lib/platform-admin';
import { createAdminClient } from '@/lib/supabase-admin';

export interface EmailCheckResponse {
  exists: boolean;
  ownsOrManagesGymCount: number;
  pendingInvite: { gymName: string; expiresAt: string } | null;
}

export async function GET(request: Request) {
  const auth = await requirePlatformAdminApi();
  if ('error' in auth) return auth.error;

  const url = new URL(request.url);
  const email = (url.searchParams.get('email') ?? '').trim().toLowerCase();
  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 });

  const admin = createAdminClient();

  const { data: profile } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();

  let ownsOrManagesGymCount = 0;
  if (profile) {
    const { count } = await admin
      .from('gym_users')
      .select('gym_id', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .eq('status', 'active')
      .in('role', ['owner', 'admin']);
    ownsOrManagesGymCount = count ?? 0;
  }

  const { data: invite } = await admin
    .from('gym_claim_invites')
    .select('expires_at, gyms(name)')
    .eq('invited_email', email)
    .is('consumed_at', null)
    .is('superseded_at', null)
    .maybeSingle();

  const response: EmailCheckResponse = {
    exists: Boolean(profile),
    ownsOrManagesGymCount,
    pendingInvite: invite
      ? { gymName: (invite.gyms as unknown as { name: string } | null)?.name ?? 'a gym', expiresAt: invite.expires_at }
      : null,
  };

  return NextResponse.json(response);
}
