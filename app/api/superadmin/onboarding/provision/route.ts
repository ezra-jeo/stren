import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { requirePlatformAdminApi } from '@/lib/platform-admin';
import {
  provisionRequestSchema, planDurationDays, serializeOperatingHours,
  accessSwitchesToFeatureFlags, type OperatingHours,
} from '@/lib/onboarding/schemas';
import { generateClaimToken, hashClaimToken, claimExpiresAt, buildClaimUrl, deliverClaimInvite } from '@/lib/claim-invites';

function siteUrl(request: Request) {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin).replace(/\/$/, '');
}

async function findAuthUserIdByEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const match = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}

/**
 * Find-or-create, idempotent by construction: retries after a partial
 * failure reuse the account created on the first attempt via the exact
 * lowercase-email lookup, never creating a duplicate.
 */
async function resolveAccount(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  name: string,
  contactNumber: string,
): Promise<string> {
  const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { name } });
  let userId = created?.user?.id ?? null;
  if (!userId && error) userId = await findAuthUserIdByEmail(admin, email);
  if (!userId) throw new Error(`Could not resolve an account for ${email}.`);

  const { error: profileError } = await admin.from('profiles').upsert(
    { id: userId, email, name, contact_number: contactNumber || null, qr_code: crypto.randomUUID() },
    { onConflict: 'id' },
  );
  if (profileError) throw new Error(profileError.message);
  return userId;
}

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { contentType: match[1], buffer: Buffer.from(match[2], 'base64') };
}

export async function POST(request: Request) {
  const auth = await requirePlatformAdminApi();
  if ('error' in auth) return auth.error;

  const parsed = provisionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.', issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;
  const admin = createAdminClient();

  let ownerId: string;
  const staffResolved: { userId: string; role: 'admin' | 'staff' }[] = [];
  const membersResolved: { userId: string }[] = [];
  try {
    ownerId = await resolveAccount(admin, body.owner.email, body.owner.name, body.owner.mobile);
    for (const entry of body.staff) {
      staffResolved.push({ userId: await resolveAccount(admin, entry.email, entry.name, entry.mobile ?? ''), role: entry.role });
    }
    for (const member of body.importedMembers) {
      membersResolved.push({ userId: await resolveAccount(admin, member.email, member.name, member.contactNumber ?? '') });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to resolve accounts.' }, { status: 400 });
  }

  const rawToken = generateClaimToken();
  const tokenHash = hashClaimToken(rawToken);
  const expiresAt = claimExpiresAt();

  const rpcPayload = {
    gymName: body.gym.gymName,
    slug: body.gym.slug,
    address: body.gym.address,
    branchName: body.gym.branchName || null,
    operatingHours: serializeOperatingHours(body.operatingHours as OperatingHours),
    isPublished: body.switches.visibility === 'public',
    owner: {
      userId: ownerId, name: body.owner.name, email: body.owner.email,
      role: body.owner.role, consentMethod: body.owner.consentMethod,
    },
    staff: staffResolved,
    plans: body.plans.map((plan) => ({
      name: plan.name, price: plan.price, durationDays: planDurationDays(plan),
      description: plan.description || null, isActive: plan.isActive,
    })),
    featureFlags: accessSwitchesToFeatureFlags(body.switches),
    importedMembers: membersResolved,
  };

  const { data: rpcResult, error: rpcError } = await admin.rpc('provision_gym_workspace', {
    p_payload: rpcPayload,
    p_token_hash: tokenHash,
    p_idempotency_key: body.idempotencyKey,
  });
  if (rpcError || !rpcResult) {
    return NextResponse.json({ error: rpcError?.message ?? 'Provisioning failed.' }, { status: 400 });
  }
  const result = rpcResult as { gymId: string; gymName: string; gymCode: string; ownerEmail: string; expiresAt: string };

  // Non-critical: logo finalization. A gym that provisioned successfully is
  // never rolled back solely because this step fails (falls back to the
  // Stren mark).
  if (body.logoDataUrl) {
    const decoded = dataUrlToBuffer(body.logoDataUrl);
    if (decoded) {
      const path = `${result.gymId}/logo-${Date.now()}.jpg`;
      const { error: uploadError } = await admin.storage.from('gym-assets').upload(path, decoded.buffer, {
        upsert: true, contentType: decoded.contentType,
      });
      if (!uploadError) await admin.from('gyms').update({ logo_path: path }).eq('id', result.gymId);
    }
  }

  // Non-critical: invite delivery. Failure is recoverable via Resend invitation.
  const claimLink = buildClaimUrl(siteUrl(request), rawToken);
  const emailResult = await deliverClaimInvite({
    to: result.ownerEmail, ownerName: body.owner.name, gymName: result.gymName,
    claimLink, expiresAt: expiresAt.toISOString(),
  });
  await admin.rpc('mark_claim_invite_delivery', {
    p_gym_id: result.gymId, p_token_hash: tokenHash, p_status: emailResult.ok ? 'sent' : 'failed',
  });

  return NextResponse.json(
    {
      gymId: result.gymId,
      gymName: result.gymName,
      gymCode: result.gymCode,
      ownerEmail: result.ownerEmail,
      expiresAt: result.expiresAt,
      claimLink,
      emailDelivered: emailResult.ok,
    },
    { status: emailResult.ok ? 200 : 207 },
  );
}
