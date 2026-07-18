import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { hashClaimToken } from '@/lib/claim-invites';

const bodySchema = z.object({ token: z.string().min(1) });

const ERROR_MESSAGES: Record<string, string> = {
  '28000': 'Sign in to claim this gym.',
  P0002: 'This claim link is invalid.',
  P0003: 'This invitation was replaced by a newer one. Ask your Stren contact to resend it.',
  P0004: 'This invitation has already been used.',
  P0005: 'This invitation has expired. Ask your Stren contact to resend it.',
  P0006: 'This invitation was sent to a different email address than the one you are signed in with.',
};

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.', code: 'invalid_request' }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: ERROR_MESSAGES['28000'], code: 'auth_required' }, { status: 401 });

  const tokenHash = hashClaimToken(parsed.data.token);
  const { data, error } = await supabase.rpc('claim_gym_ownership', { p_token_hash: tokenHash });

  if (error) {
    const code = error.code ?? 'unknown';
    return NextResponse.json({ error: ERROR_MESSAGES[code] ?? 'Could not claim this gym right now.', code }, { status: 400 });
  }

  return NextResponse.json(data);
}
