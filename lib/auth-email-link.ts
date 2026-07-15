export type AuthEmailLinkType = 'email' | 'invite' | 'magiclink' | 'recovery' | 'signup';

export function buildAuthConfirmationUrl({
  siteUrl,
  tokenHash,
  type,
  next,
}: {
  siteUrl: string;
  tokenHash: string;
  type: AuthEmailLinkType;
  next?: '/reset-password';
}): string {
  const url = new URL('/auth/confirm', siteUrl.replace(/\/$/, ''));
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('type', type);
  if (next) url.searchParams.set('next', next);
  return url.toString();
}
