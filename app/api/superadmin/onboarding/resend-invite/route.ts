import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdminApi } from '@/lib/platform-admin';
import { createAdminClient } from '@/lib/supabase-admin';
import { generateClaimToken, hashClaimToken, claimExpiresAt, buildClaimUrl, deliverClaimInvite } from '@/lib/claim-invites';

const bodySchema = z.object({ gymId: z.string().uuid() });

function siteUrl(request: Request) {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin).replace(/\/$/, '');
}

export async function POST(request: Request) {
  const auth = await requirePlatformAdminApi();
  if ('error' in auth) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const { gymId } = parsed.data;

  const admin = createAdminClient();

  const [{ data: gym }, { data: activeInvite }] = await Promise.all([
    admin.from('gyms').select('name').eq('id', gymId).maybeSingle(),
    admin.from('gym_claim_invites').select('invited_email, invited_name')
      .eq('gym_id', gymId).is('consumed_at', null).is('superseded_at', null).maybeSingle(),
  ]);
  if (!gym || !activeInvite) {
    return NextResponse.json({ error: 'No active claim invitation exists for that gym.' }, { status: 404 });
  }

  const rawToken = generateClaimToken();
  const tokenHash = hashClaimToken(rawToken);
  const expiresAt = claimExpiresAt();

  const { error: rpcError } = await admin.rpc('supersede_claim_invite', {
    p_gym_id: gymId, p_new_token_hash: tokenHash, p_expires_at: expiresAt.toISOString(),
  });
  if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 400 });

  const claimLink = buildClaimUrl(siteUrl(request), rawToken);
  const emailResult = await deliverClaimInvite({
    to: activeInvite.invited_email,
    ownerName: activeInvite.invited_name ?? '',
    gymName: gym.name,
    claimLink,
    expiresAt: expiresAt.toISOString(),
  });
  await admin.rpc('mark_claim_invite_delivery', { p_gym_id: gymId, p_token_hash: tokenHash, p_status: emailResult.ok ? 'sent' : 'failed' });

  return NextResponse.json(
    { claimLink, expiresAt: expiresAt.toISOString(), emailDelivered: emailResult.ok },
    { status: emailResult.ok ? 200 : 207 },
  );
}
