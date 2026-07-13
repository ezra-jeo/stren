import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const PASSWORD_RECOVERY_COOKIE = 'stren_password_recovery';
export const PASSWORD_RECOVERY_MAX_AGE_SECONDS = 10 * 60;

export const passwordRecoveryCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/api/auth/password-reset/complete',
  maxAge: PASSWORD_RECOVERY_MAX_AGE_SECONDS,
};

function signingSecret(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error('Password recovery signing is not configured.');
  return secret;
}

function sign(payload: string): string {
  return createHmac('sha256', signingSecret())
    .update(`stren-password-recovery:${payload}`)
    .digest('base64url');
}

export function createPasswordRecoveryProof(userId: string, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000);
  const nonce = randomBytes(18).toString('base64url');
  const payload = `v1.${userId}.${issuedAt}.${nonce}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyPasswordRecoveryProof(
  proof: string | null | undefined,
  userId: string,
  now = Date.now(),
): boolean {
  if (!proof) return false;
  const parts = proof.split('.');
  if (parts.length !== 5) return false;
  const [version, proofUserId, issuedAtRaw, nonce, providedSignature] = parts;
  if (version !== 'v1' || proofUserId !== userId || !nonce || !providedSignature) return false;

  const issuedAt = Number(issuedAtRaw);
  const nowSeconds = Math.floor(now / 1000);
  if (!Number.isSafeInteger(issuedAt)
      || issuedAt > nowSeconds + 60
      || nowSeconds - issuedAt > PASSWORD_RECOVERY_MAX_AGE_SECONDS) return false;

  try {
    const expected = Buffer.from(sign(`${version}.${proofUserId}.${issuedAtRaw}.${nonce}`));
    const provided = Buffer.from(providedSignature);
    return expected.length === provided.length && timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}
