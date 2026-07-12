import { revalidatePath, revalidateTag } from 'next/cache';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { rateLimit } from '@/lib/rate-limit';
import { apiRequirePermission, getMyAccess } from '@/lib/permissions-server';
import { resolveApiRequestUser } from '@/lib/api-request-auth';
import type { SupabaseClient } from '@supabase/supabase-js';

export function isSameGymScope(
  profileGymId: string | null | undefined,
  targetGymId: string | null | undefined,
): boolean {
  return typeof profileGymId === 'string' && profileGymId.length > 0 && profileGymId === targetGymId;
}

export async function POST(request: Request) {
  const ip = (await headers()).get('x-forwarded-for') ?? 'unknown';
  const { success } = rateLimit(`revalidate:${ip}`, 10, 60_000);
  if (!success) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  let code = '';

  try {
    const body = (await request.json()) as { code?: unknown };
    if (typeof body.code === 'string') {
      code = body.code.trim();
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: 'Missing gym code.' }, { status: 400 });
  }

  try {
    code = decodeURIComponent(code).trim();
  } catch {
    // Keep raw value if decode fails.
  }

  const supabase = await createServerSupabaseClient();

  const resolvedAuth = await resolveApiRequestUser(
    request,
    supabase as unknown as SupabaseClient,
  );
  if (!resolvedAuth) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const requestSupabase = resolvedAuth.supabase as unknown as typeof supabase;
  const access = await getMyAccess(requestSupabase as unknown as SupabaseClient);
  if (!access.gymId || !['owner', 'admin', 'staff'].includes(access.role)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

  const { data: gym } = await requestSupabase
    .from('gyms')
    .select('id')
    .eq('code', code)
    .maybeSingle();

  const gymId = gym?.id ?? '';

  if (!isSameGymScope(access.gymId, gymId)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const permissionError = await apiRequirePermission('cache:revalidate', access);
  if (permissionError) return permissionError;

  const encodedCode = encodeURIComponent(code);
  revalidatePath(`/gym/${encodedCode}`);
  revalidatePath(`/gym/${encodedCode}/contact`);
  revalidatePath(`/gym/${encodedCode}/pricing`);
  revalidatePath(`/gym/${encodedCode}/locate`);
  revalidateTag('gym-public', 'max');
  revalidateTag('gym-branding', 'max');

  if (gymId) {
    revalidateTag(`gym-stats-${gymId}`, 'max');
    revalidateTag(`gym-reports-${gymId}`, 'max');
    revalidateTag(`leaderboard-${gymId}`, 'max');
  }

  return NextResponse.json({ revalidated: true, code });
}
