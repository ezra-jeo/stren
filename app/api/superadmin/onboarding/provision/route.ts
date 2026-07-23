import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { provisioningRequestFingerprint, requirePlatformAdminApi, type PlatformProvisioningResult } from '@/lib/platform-admin';
import {
  provisionRequestSchema, planDurationDays, serializeOperatingHours,
  accessSwitchesToFeatureFlags, type OperatingHours,
} from '@/lib/onboarding/schemas';
import { generateClaimToken, hashClaimToken, claimExpiresAt, buildClaimUrl, deliverClaimInvite } from '@/lib/claim-invites';

function siteUrl(request: Request) {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin).replace(/\/$/, '');
}

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  return buffer.length <= 2 * 1024 * 1024 ? { contentType: match[1], buffer } : null;
}

async function findAuthUserIdByEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error('Account lookup failed.');
    const match = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function resolveAccount(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  name: string,
  contactNumber: string,
): Promise<{ userId: string; created: boolean }> {
  const existing = await findAuthUserIdByEmail(admin, email);
  if (existing) return { userId: existing, created: false };

  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name, contact_number: contactNumber || undefined },
  });
  if (data.user?.id) return { userId: data.user.id, created: true };

  // Auth creation is outside the Postgres transaction. A duplicate or network
  // response is resolved by rereading Auth, so retries never create a second account.
  const afterCreate = await findAuthUserIdByEmail(admin, email);
  if (afterCreate) return { userId: afterCreate, created: false };
  throw new Error(error?.message ?? `Could not resolve an account for ${email}.`);
}

function errorStatus(message: string): number {
  if (/already taken|duplicate|idempotency|different request|belongs to another/i.test(message)) return 409;
  if (/not found|no active invite/i.test(message)) return 404;
  return 400;
}

export async function POST(request: Request) {
  const auth = await requirePlatformAdminApi();
  if (auth.response) return auth.response;
  const { supabase } = auth.context;

  const parsed = provisionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.', issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;
  const fingerprint = provisioningRequestFingerprint(body);
  const admin = createAdminClient(); // Auth account resolution and server-only Storage only.

  let owner: { userId: string; created: boolean };
  const staffResolved: { userId: string; role: 'admin' | 'staff' }[] = [];
  const membersResolved: { userId: string }[] = [];
  const createdUserIds: string[] = [];
  try {
    owner = await resolveAccount(admin, body.owner.email, body.owner.name, body.owner.mobile);
    if (owner.created) createdUserIds.push(owner.userId);
    for (const entry of body.staff) {
      const resolved = await resolveAccount(admin, entry.email, entry.name, entry.mobile ?? '');
      if (resolved.created) createdUserIds.push(resolved.userId);
      staffResolved.push({ userId: resolved.userId, role: entry.role });
    }
    for (const member of body.importedMembers) {
      const resolved = await resolveAccount(admin, member.email, member.name, member.contactNumber ?? '');
      if (resolved.created) createdUserIds.push(resolved.userId);
      membersResolved.push({ userId: resolved.userId });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to resolve accounts.' }, { status: 400 });
  }

  const authResolution = {
    ownerUserId: owner.userId,
    staffUserIds: staffResolved.map((entry) => entry.userId),
    importedMemberUserIds: membersResolved.map((entry) => entry.userId),
    createdUserIds,
  };
  const { data: authState, error: authStateError } = await supabase.rpc('record_platform_provisioning_auth_state', {
    p_idempotency_key: body.idempotencyKey,
    p_request_fingerprint: fingerprint,
    p_status: 'auth_ready',
    p_auth_resolution: authResolution,
  });
  if (authStateError) {
    return NextResponse.json({ error: authStateError.message }, { status: errorStatus(authStateError.message) });
  }
  const savedAuthState = authState as { status?: string; result?: unknown } | null;
  if (savedAuthState?.status === 'provisioned' && savedAuthState.result) {
    const storedResult = savedAuthState.result as PlatformProvisioningResult;
    const { data: invite } = await supabase.rpc('get_platform_claim_invite', {
      p_gym_id: storedResult.gymId,
    });
    const currentInvite = invite as { deliveryStatus?: PlatformProvisioningResult['deliveryStatus']; expiresAt?: string } | null;
    return NextResponse.json({
      ...storedResult,
      deliveryStatus: currentInvite?.deliveryStatus ?? storedResult.deliveryStatus,
      expiresAt: currentInvite?.expiresAt ?? storedResult.expiresAt,
    });
  }

  const rawToken = generateClaimToken();
  const tokenHash = hashClaimToken(rawToken);
  const expiresAt = claimExpiresAt();
  const logo = body.logoDataUrl ? dataUrlToBuffer(body.logoDataUrl) : null;
  const logoPath = logo ? `${body.idempotencyKey}/logo` : null;
  const rpcPayload = {
    gymName: body.gym.gymName,
    slug: body.gym.slug,
    address: body.gym.address,
    branchName: body.gym.branchName || null,
    operatingHours: serializeOperatingHours(body.operatingHours as OperatingHours),
    isPublished: false,
    logoPath,
    owner: {
      userId: owner.userId,
      name: body.owner.name,
      email: body.owner.email,
      role: 'owner' as const,
      consentMethod: body.owner.consentMethod,
    },
    staff: staffResolved,
    plans: body.plans.map((plan) => ({
      name: plan.name,
      price: plan.price,
      durationDays: planDurationDays(plan),
      description: plan.description || null,
      isActive: plan.isActive,
    })),
    featureFlags: accessSwitchesToFeatureFlags(body.switches),
    importedMembers: membersResolved,
  };

  const { data: rpcResult, error: rpcError } = await supabase.rpc('provision_gym_workspace', {
    p_payload: rpcPayload,
    p_token_hash: tokenHash,
    p_idempotency_key: body.idempotencyKey,
    p_request_fingerprint: fingerprint,
  });
  if (rpcError || !rpcResult) {
    const message = rpcError?.message ?? 'Provisioning failed.';
    return NextResponse.json({ error: message }, { status: errorStatus(message) });
  }
  const result = rpcResult as { gymId: string; gymName: string; gymCode: string; ownerEmail: string; expiresAt: string; deliveryStatus: 'pending' | 'sent' | 'failed' };

  if (logo) {
    // The path is written inside the user-bound RPC; Storage is the only
    // Postgres-adjacent operation allowed through the admin client here.
    await admin.storage.from('gym-assets').upload(logoPath!, logo.buffer, {
      upsert: true,
      contentType: logo.contentType,
    });
  }

  const claimLink = buildClaimUrl(siteUrl(request), rawToken);
  const emailResult = await deliverClaimInvite({
    to: result.ownerEmail,
    ownerName: body.owner.name,
    gymName: result.gymName,
    claimLink,
    expiresAt: result.expiresAt || expiresAt.toISOString(),
  });
  const deliveryStatus = emailResult.ok ? 'sent' : 'failed';
  const { error: deliveryError } = await supabase.rpc('mark_claim_invite_delivery', {
    p_gym_id: result.gymId,
    p_token_hash: tokenHash,
    p_status: deliveryStatus,
  });
  if (deliveryError) {
    return NextResponse.json({ error: 'Gym created, but invitation delivery state could not be recorded.' }, { status: 500 });
  }

  return NextResponse.json({
    gymId: result.gymId,
    gymName: result.gymName,
    gymCode: result.gymCode,
    ownerEmail: result.ownerEmail,
    expiresAt: result.expiresAt || expiresAt.toISOString(),
    deliveryStatus,
  }, { status: deliveryStatus === 'sent' ? 200 : 207 });
}
