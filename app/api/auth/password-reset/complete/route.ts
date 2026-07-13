import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  PASSWORD_RECOVERY_COOKIE,
  passwordRecoveryCookieOptions,
  verifyPasswordRecoveryProof,
} from '@/lib/password-recovery';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const passwordSchema = z.object({
  password: z.string().min(8).max(128),
});

async function validatedRecovery() {
  const cookieStore = await cookies();
  const proof = cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  const user = !error ? data.user : null;
  if (!user || !verifyPasswordRecoveryProof(proof, user.id)) return null;
  return { supabase, user };
}

export async function GET() {
  const recovery = await validatedRecovery();
  if (!recovery) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const parsed = passwordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Password must be between 8 and 128 characters.' }, { status: 400 });
  }

  const recovery = await validatedRecovery();
  if (!recovery) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 401 });
  }

  const { data, error } = await recovery.supabase.auth.updateUser({ password: parsed.data.password });
  if (error || !data.user) {
    return NextResponse.json(
      { error: 'We couldn\'t update your password. Request a new reset link and try again.' },
      { status: 400 },
    );
  }

  await recovery.supabase.auth.signOut({ scope: 'local' });
  const response = NextResponse.json({ ok: true, userId: recovery.user.id });
  response.cookies.set(PASSWORD_RECOVERY_COOKIE, '', {
    ...passwordRecoveryCookieOptions,
    maxAge: 0,
  });
  return response;
}
