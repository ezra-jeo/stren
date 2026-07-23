import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { hashClaimToken } from '@/lib/claim-invites';

const bodySchema = z.object({ token: z.string().min(1).max(512) });

const ERROR_MESSAGES: Record<string, string> = {
  '28000': 'Sign in to claim this gym.',
  P1002: 'This claim link is invalid.',
  P1003: 'This invitation was replaced by a newer one. Ask your Stren contact to resend it.',
  P1004: 'This invitation has already been used.',
  P1005: 'This invitation has expired. Ask your Stren contact to resend it.',
  P1006: 'This invitation was sent to a different email address than the one you are signed in with.',
  P1007: 'This invitation is not prepared for the signed-in account.',
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
    const status = code === 'P1002' ? 404 : code === 'P1003' || code === 'P1004' || code === 'P1007' ? 409 : 400;
    return NextResponse.json({ error: ERROR_MESSAGES[code] ?? 'Could not claim this gym right now.', code }, { status });
  }

  return NextResponse.json(data);
}
