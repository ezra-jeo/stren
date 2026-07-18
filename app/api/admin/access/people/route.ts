import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-admin';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { apiRequirePermission, getMyAccess } from '@/lib/permissions-server';
import { sendStaffInvitationEmail } from '@/lib/email';
import type { SupabaseClient } from '@supabase/supabase-js';

const addSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(['admin', 'staff']),
});
const removeSchema = z.object({ userId: z.string().uuid() });

function siteUrl(request: Request) {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(request.url).origin).replace(/\/$/, '');
}

async function authorizeOwner() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) };

  const access = await getMyAccess(supabase as unknown as SupabaseClient);
  const denied = await apiRequirePermission('roles:manage', access);
  if (denied || access.role !== 'owner' || !access.gymId) {
    return { error: denied ?? NextResponse.json({ error: 'Only the owner can manage the team.' }, { status: 403 }) };
  }
  return { user, gymId: access.gymId, supabase };
}

/**
 * Recovery only for an older Auth account whose profile row was never created.
 * The normal path is the exact, indexed profile email lookup below.
 */
async function findAuthUserIdByEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (user) return user.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}

/** Owner-authorized roster read. Keep this server-side so the client never has
 * to depend on an embedded browser-RLS relation to render People & access. */
export async function GET() {
  const authorization = await authorizeOwner();
  if ('error' in authorization) return authorization.error;

  const admin = createAdminClient();
  const [{ data: gymUsers, error: gymUsersError }, { data: rawOverrides, error: overridesError }] = await Promise.all([
    admin.from('gym_users').select('user_id, role').eq('gym_id', authorization.gymId).in('role', ['admin', 'staff']),
    admin.from('gym_user_permission_overrides').select('user_id, permission, granted').eq('gym_id', authorization.gymId),
  ]);
  if (gymUsersError || overridesError) return NextResponse.json({ error: 'Could not load the team.' }, { status: 500 });

  const userIds = (gymUsers ?? []).map((person) => person.user_id);
  const { data: profiles, error: profilesError } = userIds.length > 0
    ? await admin.from('profiles').select('id, name, email').in('id', userIds)
    : { data: [], error: null };
  if (profilesError) return NextResponse.json({ error: 'Could not load the team.' }, { status: 500 });

  const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const overridesByUser = new Map<string, { permission: string; granted: boolean }[]>();
  for (const override of rawOverrides ?? []) {
    const list = overridesByUser.get(override.user_id) ?? [];
    list.push({ permission: override.permission, granted: override.granted });
    overridesByUser.set(override.user_id, list);
  }
  const people = (gymUsers ?? []).map((gymUser) => {
    const profile = profilesById.get(gymUser.user_id);
    return {
      userId: gymUser.user_id,
      name: profile?.name ?? '',
      email: profile?.email ?? '',
      role: gymUser.role,
      overrides: overridesByUser.get(gymUser.user_id) ?? [],
    };
  }).sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));

  return NextResponse.json({ people });
}

export async function POST(request: Request) {
  const authorization = await authorizeOwner();
  if ('error' in authorization) return authorization.error;
  const parsed = addSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a name, email, and staff role.' }, { status: 400 });

  const { name, email, role } = parsed.data;
  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, name, email')
    .eq('email', email)
    .maybeSingle();
  if (profileError) return NextResponse.json({ error: 'Could not check that account.' }, { status: 500 });

  let userId = profile?.id ?? null;
  let createdAccount = false;
  if (!userId) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { name },
    });
    if (created.user) {
      userId = created.user.id;
      createdAccount = true;
    } else if (createError) {
      // Existing Auth account + missing profile: attach it instead of surfacing
      // Supabase’s duplicate-email error to the owner.
      userId = await findAuthUserIdByEmail(admin, email);
      if (!userId) return NextResponse.json({ error: 'Could not resolve that account. Please ask them to sign in once, then try again.' }, { status: 400 });
    }
  }
  if (!userId) return NextResponse.json({ error: 'Could not resolve that account.' }, { status: 400 });

  let resolvedProfile = profile;
  if (!resolvedProfile) {
    const { data, error: lookupError } = await admin
      .from('profiles')
      .select('id, name, email')
      .eq('id', userId)
      .maybeSingle();
    if (lookupError) return NextResponse.json({ error: 'Could not prepare that account.' }, { status: 500 });
    resolvedProfile = data;
  }
  if (!resolvedProfile) {
    const { error } = await admin.from('profiles').insert({
      id: userId,
      email,
      name,
      qr_code: crypto.randomUUID(),
    });
    if (error) return NextResponse.json({ error: 'Could not prepare that account.' }, { status: 500 });
    resolvedProfile = { id: userId, email, name };
  }

  const { error: gymUserError } = await authorization.supabase.rpc('provision_gym_staff', {
    p_user_id: userId,
    p_role: role,
    p_reason: 'Owner added teammate through People & access',
  });
  if (gymUserError) return NextResponse.json({ error: 'Could not add that teammate.' }, { status: 500 });

  let setupLink = `${siteUrl(request)}/auth?mode=signin`;
  if (createdAccount) {
    const { data: link, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${siteUrl(request)}/auth/callback` },
    });
    if (error || !link.properties?.action_link) {
      return NextResponse.json({
        person: { userId, name: resolvedProfile.name, email: resolvedProfile.email, role, overrides: [] },
        createdAccount,
        deliveryStatus: 'failed',
      }, { status: 207 });
    }
    setupLink = link.properties.action_link;
  }

  const { data: gym } = await admin.from('gyms').select('name').eq('id', authorization.gymId).maybeSingle();
  const delivery = await sendStaffInvitationEmail({
    to: email,
    teammateName: resolvedProfile.name,
    gymName: gym?.name ?? 'Your Gym',
    setupLink,
  });

  return NextResponse.json({
    person: { userId, name: resolvedProfile.name, email: resolvedProfile.email, role, overrides: [] },
    createdAccount,
    deliveryStatus: delivery.ok ? 'sent' : 'failed',
  }, { status: delivery.ok ? 200 : 207 });
}

export async function DELETE(request: Request) {
  const authorization = await authorizeOwner();
  if ('error' in authorization) return authorization.error;
  const parsed = removeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid teammate.' }, { status: 400 });

  const admin = createAdminClient();
  const { data: target } = await admin
    .from('gym_users')
    .select('role')
    .eq('gym_id', authorization.gymId)
    .eq('user_id', parsed.data.userId)
    .maybeSingle();
  if (!target || !['admin', 'staff'].includes(target.role)) {
    return NextResponse.json({ error: 'Only staff-side teammates can be removed here.' }, { status: 400 });
  }

  const { error: removeError } = await authorization.supabase.rpc('set_gym_user_status', {
    p_user_id: parsed.data.userId,
    p_status: 'disabled',
    p_reason: 'Owner removed teammate through People & access',
  });
  if (removeError) return NextResponse.json({ error: 'Could not remove this teammate.' }, { status: 500 });
  return NextResponse.json({ removed: true });
}
