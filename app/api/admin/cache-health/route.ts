import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { rateLimit } from '@/lib/rate-limit';
import { getGymPublicByCode } from '@/lib/gym-public';
import { getGymBrandingById } from '@/lib/gym-member';
import { apiRequirePermission, getMyAccess } from '@/lib/permissions-server';
import { resolveApiRequestUser } from '@/lib/api-request-auth';
import type { SupabaseClient } from '@supabase/supabase-js';

function msSince(start: number): number {
  return Number((performance.now() - start).toFixed(2));
}

export async function GET(request: Request) {
  const ip = (await headers()).get('x-forwarded-for') ?? 'unknown';
  const { success } = rateLimit(`cache-health:${ip}`, 30, 60_000);
  if (!success) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
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
  const permissionError = await apiRequirePermission('cache:revalidate', access);
  if (permissionError) return permissionError;

  const url = new URL(request.url);
  let gymCode = (url.searchParams.get('code') ?? '').trim();

  if (!gymCode && access.gymId) {
    const { data: gymRow } = await requestSupabase
      .from('gyms')
      .select('code')
      .eq('id', access.gymId)
      .maybeSingle();

    gymCode = (gymRow?.code ?? '').trim();
  }

  if (!gymCode) {
    return NextResponse.json(
      { error: 'Missing gym code. Provide ?code=... or ensure your profile has a gym_id.' },
      { status: 400 },
    );
  }

  const { data: targetGym } = await requestSupabase
    .from('gyms')
    .select('id')
    .eq('code', gymCode)
    .maybeSingle();

  if (targetGym?.id !== access.gymId) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const publicFirstStart = performance.now();
  const publicFirst = await getGymPublicByCode(gymCode);
  const publicFirstMs = msSince(publicFirstStart);

  const publicSecondStart = performance.now();
  const publicSecond = await getGymPublicByCode(gymCode);
  const publicSecondMs = msSince(publicSecondStart);

  const gymId = publicFirst.data?.id ?? null;

  let brandingFirstMs: number | null = null;
  let brandingSecondMs: number | null = null;

  if (gymId) {
    const brandingFirstStart = performance.now();
    await getGymBrandingById(gymId);
    brandingFirstMs = msSince(brandingFirstStart);

    const brandingSecondStart = performance.now();
    await getGymBrandingById(gymId);
    brandingSecondMs = msSince(brandingSecondStart);
  }

  const response = NextResponse.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    gymCode,
    resolvedGymId: gymId,
    publicCache: {
      firstMs: publicFirstMs,
      secondMs: publicSecondMs,
      secondCallFasterOrEqual: publicSecondMs <= publicFirstMs,
      hasData: !!publicFirst.data && !!publicSecond.data,
    },
    brandingCache: gymId
      ? {
          firstMs: brandingFirstMs,
          secondMs: brandingSecondMs,
          secondCallFasterOrEqual: (brandingSecondMs ?? 0) <= (brandingFirstMs ?? 0),
        }
      : null,
  });

  response.headers.set('Cache-Control', 'no-store');
  return response;
}
