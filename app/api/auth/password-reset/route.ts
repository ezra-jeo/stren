import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAuthConfirmationUrl } from '@/lib/auth-email-link';
import { sendPasswordResetEmail } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase-admin';

const requestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

const GENERIC_SUCCESS = 'If an account exists for this email, we\u2019ve sent password-reset instructions.';
const DELIVERY_ERROR = 'We couldn\'t send password-reset instructions right now. Please try again later.';

function configuredSiteUrl(): string | null {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  return siteUrl ? siteUrl.replace(/\/$/, '') : null;
}

function genericSuccess() {
  return NextResponse.json({ ok: true, message: GENERIC_SUCCESS });
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

  const siteUrl = configuredSiteUrl();
  if (!siteUrl) {
    return NextResponse.json(
      { error: 'Password-reset email is not configured right now. Please contact Stren support.' },
      { status: 503 },
    );
  }

  let generated: {
    data: { properties?: { hashed_token?: string } | null } | null;
    error: { code?: string; message: string } | null;
  };
  try {
    generated = await createAdminClient().auth.admin.generateLink({
      type: 'recovery',
      email: parsed.data.email,
    });
  } catch {
    return NextResponse.json({ error: DELIVERY_ERROR }, { status: 503 });
  }

  if (generated.error) {
    const code = String(generated.error.code ?? '');
    if (/user_not_found|email_not_found/i.test(code) || /user.*not found/i.test(generated.error.message)) {
      return genericSuccess();
    }
    return NextResponse.json({ error: DELIVERY_ERROR }, { status: 503 });
  }

  const tokenHash = generated.data?.properties?.hashed_token;
  if (!tokenHash) {
    return NextResponse.json({ error: DELIVERY_ERROR }, { status: 503 });
  }

  const resetLink = buildAuthConfirmationUrl({
    siteUrl,
    tokenHash,
    type: 'recovery',
    next: '/reset-password',
  });
  const emailResult = await sendPasswordResetEmail({ to: parsed.data.email, resetLink });
  if (!emailResult.ok) {
    return NextResponse.json({ error: DELIVERY_ERROR }, { status: 503 });
  }

  return genericSuccess();
}
