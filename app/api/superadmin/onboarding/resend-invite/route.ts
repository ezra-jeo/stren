import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdminApi } from '@/lib/platform-admin';
import { generateClaimToken, hashClaimToken, claimExpiresAt, buildClaimUrl, deliverClaimInvite } from '@/lib/claim-invites';

const bodySchema = z.object({ gymId: z.string().uuid() });

function siteUrl(request: Request) {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin).replace(/\/$/, '');
}

type UntypedRpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
};

export async function POST(request: Request) {
  const auth = await requirePlatformAdminApi();
  if (auth.response) return auth.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const supabase = auth.context.supabase as unknown as UntypedRpcClient;
  const { data: invite, error: inviteError } = await supabase.rpc('get_platform_claim_invite', { p_gym_id: parsed.data.gymId });
  if (inviteError) return NextResponse.json({ error: inviteError.message }, { status: 500 });
  const current = invite as { gymName?: string; ownerEmail?: string; ownerName?: string | null } | null;
  if (!current?.gymName || !current.ownerEmail) {
    return NextResponse.json({ error: 'No active claim invitation exists for that gym.' }, { status: 404 });
  }

  const rawToken = generateClaimToken();
  const tokenHash = hashClaimToken(rawToken);
  const expiresAt = claimExpiresAt();
  const { error: supersedeError } = await supabase.rpc('supersede_claim_invite', {
    p_gym_id: parsed.data.gymId,
    p_new_token_hash: tokenHash,
    p_expires_at: expiresAt.toISOString(),
  });
  if (supersedeError) {
    const status = /no active invite|not found/i.test(supersedeError.message) ? 404 : 409;
    return NextResponse.json({ error: supersedeError.message }, { status });
  }

  // The raw token crosses only this email-delivery boundary and never enters
  // the response, React state, audit detail, or provisioning state.
  const emailResult = await deliverClaimInvite({
    to: current.ownerEmail,
    ownerName: current.ownerName ?? '',
    gymName: current.gymName,
    claimLink: buildClaimUrl(siteUrl(request), rawToken),
    expiresAt: expiresAt.toISOString(),
  });
  const deliveryStatus = emailResult.ok ? 'sent' : 'failed';
  const { error: deliveryError } = await supabase.rpc('mark_claim_invite_delivery', {
    p_gym_id: parsed.data.gymId,
    p_token_hash: tokenHash,
    p_status: deliveryStatus,
  });
  if (deliveryError) return NextResponse.json({ error: 'Invitation delivery state could not be recorded.' }, { status: 500 });

  return NextResponse.json(
    { expiresAt: expiresAt.toISOString(), deliveryStatus },
    { status: deliveryStatus === 'sent' ? 200 : 207 },
  );
}
