import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-admin';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { apiRequirePermission, getMyAccess } from '@/lib/permissions-server';
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
  return { user, gymId: access.gymId };
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

  if (!profile) {
    const { error } = await admin.from('profiles').upsert({
      id: userId,
      email,
      name,
      qr_code: crypto.randomUUID(),
    }, { onConflict: 'id' });
    if (error) return NextResponse.json({ error: 'Could not prepare that account.' }, { status: 500 });
  }

  const { error: gymUserError } = await admin.from('gym_users').upsert({
    gym_id: authorization.gymId,
    user_id: userId,
    role,
    status: 'active',
    added_by: authorization.user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'gym_id,user_id' });
  if (gymUserError) return NextResponse.json({ error: 'Could not add that teammate.' }, { status: 500 });

  let magicLink: string | null = null;
  if (createdAccount) {
    const { data: link } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${siteUrl(request)}/auth/callback` },
    });
    magicLink = link.properties?.action_link ?? null;
  }

  return NextResponse.json({
    person: { userId, name: profile?.name ?? name, email: profile?.email ?? email, role, overrides: [] },
    createdAccount,
    magicLink,
  });
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

  const { error: overrideError } = await admin
    .from('gym_user_permission_overrides')
    .delete()
    .eq('gym_id', authorization.gymId)
    .eq('user_id', parsed.data.userId);
  if (overrideError) return NextResponse.json({ error: 'Could not clear this teammate’s access settings.' }, { status: 500 });

  const { error: removeError } = await admin
    .from('gym_users')
    .delete()
    .eq('gym_id', authorization.gymId)
    .eq('user_id', parsed.data.userId);
  if (removeError) return NextResponse.json({ error: 'Could not remove this teammate.' }, { status: 500 });
  return NextResponse.json({ removed: true });
}
