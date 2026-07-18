import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendOnboardingEmail } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';
import { apiRequirePermission, getMyAccess } from '@/lib/permissions-server';
import { buildAuthConfirmationUrl } from '@/lib/auth-email-link';

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  avatarUrl: z.string().url(),
  planId: z.string().uuid(),
  paymentMethod: z.enum(['cash', 'gcash']),
  idempotencyKey: z.string().uuid(),
  startDate: z.string().date().optional(),
});

function siteUrl(request: Request) {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim()
    || process.env.NEXT_PUBLIC_APP_URL?.trim()
    || new URL(request.url).origin).replace(/\/$/, '');
}

async function findAuthUserIdByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const match = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function markFailure(
  supabase: SupabaseClient,
  workflowId: string,
  stage: 'account' | 'profile' | 'payment',
  code: 'account_resolution_failed' | 'profile_creation_failed' | 'payment_failed',
) {
  await supabase.rpc('mark_member_onboarding_failure', {
    p_workflow_id: workflowId,
    p_stage: stage,
    p_failure_code: code,
  });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const access = await getMyAccess(supabase as unknown as SupabaseClient);
  const denied = await apiRequirePermission('members:manage', access);
  if (denied) return denied;
  if (!access.gymId || !['owner', 'admin', 'staff'].includes(access.role)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  if (!rateLimit(`onboard:${access.gymId}`, 20, 60_000).success) {
    return NextResponse.json({ error: 'Too many onboarding requests.' }, { status: 429 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body.', issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

  // Preflight is the first durable write. It validates every database-owned
  // permission and business input before Auth/account creation is attempted.
  const { data: preflight, error: preflightError } = await supabase.rpc(
    'preflight_member_onboarding',
    {
      p_email: body.email,
      p_plan_id: body.planId,
      p_payment_method: body.paymentMethod,
      p_idempotency_key: body.idempotencyKey,
      p_requested_start_date: body.startDate,
    },
  );
  const workflowId = (preflight as { workflow_id?: string } | null)?.workflow_id;
  if (preflightError || !workflowId) {
    return NextResponse.json(
      { error: preflightError?.message ?? 'Onboarding preflight failed.' },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id, qr_code')
    .eq('email', body.email)
    .maybeSingle();
  let memberId = existingProfile?.id ?? null;
  let createdAccount = false;

  if (!memberId) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: body.email,
      email_confirm: true,
      user_metadata: { name: body.name },
    });
    if (created.user) {
      memberId = created.user.id;
      createdAccount = true;
    } else if (error) {
      memberId = await findAuthUserIdByEmail(admin, body.email);
    }
  }
  if (!memberId) {
    await markFailure(
      supabase as unknown as SupabaseClient,
      workflowId,
      'account',
      'account_resolution_failed',
    );
    return NextResponse.json(
      { error: 'Could not resolve that account. Ask the member to sign in once, then retry.' },
      { status: 400 },
    );
  }

  // Auth normally creates the profile through handle_new_user. Historical
  // Auth-only accounts are repaired with INSERT; existing global identity is
  // never upserted from gym-entered name/photo data.
  const { data: resolvedProfile } = await admin
    .from('profiles')
    .select('id, qr_code')
    .eq('id', memberId)
    .maybeSingle();
  if (!resolvedProfile) {
    const { error } = await admin.from('profiles').insert({
      id: memberId,
      email: body.email,
      name: body.name,
      avatar_url: body.avatarUrl,
      qr_code: crypto.randomUUID(),
    });
    if (error) {
      await markFailure(
        supabase as unknown as SupabaseClient,
        workflowId,
        'profile',
        'profile_creation_failed',
      );
      return NextResponse.json({ error: 'Could not prepare that account.' }, { status: 400 });
    }
  } else if (createdAccount) {
    await admin.from('profiles').update({ avatar_url: body.avatarUrl }).eq('id', memberId);
  }

  const { data: completed, error: completionError } = await supabase.rpc(
    'complete_member_onboarding',
    { p_workflow_id: workflowId, p_member_id: memberId },
  );
  const membershipId = (completed as { membership_id?: string } | null)?.membership_id;
  if (completionError || !membershipId) {
    await markFailure(
      supabase as unknown as SupabaseClient,
      workflowId,
      'payment',
      'payment_failed',
    );
    return NextResponse.json(
      { error: completionError?.message ?? 'Payment could not be recorded. Retry safely with the same request.' },
      { status: 400 },
    );
  }

  const [{ data: gym }, { data: privateProfile }] = await Promise.all([
    supabase.from('gyms').select('name').eq('id', access.gymId).maybeSingle(),
    admin.from('profiles').select('qr_code').eq('id', memberId).maybeSingle(),
  ]);
  const qrPayload = privateProfile?.qr_code;
  let setupLink: string | null = null;
  if (createdAccount) {
    const { data: generated, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: body.email,
    });
    const tokenHash = generated.properties?.hashed_token;
    if (!error && tokenHash) {
      setupLink = buildAuthConfirmationUrl({
        siteUrl: siteUrl(request),
        tokenHash,
        type: 'magiclink',
      });
    }
  } else {
    setupLink = `${siteUrl(request)}/auth?mode=signin`;
  }

  if (!qrPayload || !setupLink) {
    await supabase.rpc('record_member_onboarding_delivery', {
      p_workflow_id: workflowId,
      p_delivery_status: 'failed',
      p_failure_code: 'setup_link_failed',
    });
    return NextResponse.json({
      memberId,
      membershipId,
      deliveryStatus: 'failed',
      emailSent: false,
      attachedExistingAccount: !createdAccount,
      resumable: true,
    }, { status: 207 });
  }

  const emailResult = await sendOnboardingEmail({
    to: body.email,
    memberName: body.name,
    gymName: gym?.name ?? 'Your Gym',
    qrPayload,
    setupLink,
  });
  await supabase.rpc('record_member_onboarding_delivery', {
    p_workflow_id: workflowId,
    p_delivery_status: emailResult.ok ? 'sent' : 'failed',
    p_failure_code: emailResult.ok ? undefined : 'email_delivery_failed',
  });

  return NextResponse.json({
    memberId,
    membershipId,
    deliveryStatus: emailResult.ok ? 'sent' : 'failed',
    emailSent: emailResult.ok,
    attachedExistingAccount: !createdAccount,
    resumable: true,
  }, { status: emailResult.ok ? 200 : 207 });
}
