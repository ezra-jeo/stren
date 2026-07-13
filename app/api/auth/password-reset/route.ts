import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const requestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

const GENERIC_SUCCESS = 'If an account exists for this email, we’ve sent password-reset instructions.';

function resetRedirectUrl(): string | null {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!siteUrl) return null;
  const callback = new URL('/auth/callback', siteUrl.replace(/\/$/, ''));
  callback.searchParams.set('next', '/reset-password');
  return callback.toString();
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const clientKey = forwardedFor || request.headers.get('x-real-ip') || 'unknown';
  const emailKey = createHash('sha256').update(parsed.data.email).digest('hex').slice(0, 20);
  const allowedByAddress = rateLimit(`password-reset:address:${clientKey}`, 5, 60 * 60 * 1000).success;
  const allowedByAccount = rateLimit(`password-reset:account:${emailKey}`, 3, 60 * 60 * 1000).success;
  if (!allowedByAddress || !allowedByAccount) {
    return NextResponse.json({ error: 'Too many reset attempts. Please wait before trying again.' }, { status: 429 });
  }

  const redirectTo = resetRedirectUrl();
  if (!redirectTo) {
    return NextResponse.json(
      { error: 'Password-reset email is not configured right now. Please contact Stren support.' },
      { status: 503 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo });
  if (error) {
    return NextResponse.json(
      { error: 'We couldn’t send password-reset instructions right now. Please try again later.' },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, message: GENERIC_SUCCESS });
}
