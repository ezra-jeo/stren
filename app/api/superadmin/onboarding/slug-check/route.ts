import { NextResponse } from 'next/server';
import { requirePlatformAdminApi } from '@/lib/platform-admin';
import { createAdminClient } from '@/lib/supabase-admin';
import { slugify, validateSlugFormat } from '@/lib/onboarding/slug';

export async function GET(request: Request) {
  const auth = await requirePlatformAdminApi();
  if ('error' in auth) return auth.error;

  const url = new URL(request.url);
  const raw = url.searchParams.get('slug') ?? '';
  const normalized = slugify(raw.trim().toLowerCase());
  const format = validateSlugFormat(normalized);
  if (!format.valid) {
    return NextResponse.json({ available: false, normalized, reason: format.reason });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from('gyms').select('id').ilike('code', normalized).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ available: !data, normalized, reason: data ? 'That gym code is already taken.' : undefined });
}
