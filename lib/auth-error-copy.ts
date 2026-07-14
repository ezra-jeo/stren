/**
 * Plain-language copy for the magic-link / auth `?error=` banner on `/auth`
 * (ImplementationPlan-UnifiedAccounts.md §5 U1).
 *
 * Supabase hands back terse codes and technical messages when a magic link,
 * invite, or recovery link fails. The owner/member should never read
 * "otp_expired" or a raw exception — they read one calm sentence and a way
 * forward. Unknown values fall back to a generic, non-alarming message.
 */

const KNOWN_ERRORS: Record<string, string> = {
  otp_expired: 'That link has expired. Request a new one and try again.',
  access_denied: 'That link is no longer valid. Request a new one and try again.',
  invalid_magic_link_session: 'We could not sign you in from that link. Please sign in with your email and password.',
  server_error: 'Something went wrong on our end. Please try again in a moment.',
  email_not_confirmed: 'Please confirm your email first, then sign in.',
  unauthorized_client: 'That link is no longer valid. Request a new one and try again.',
  oauth_cancelled: 'Google sign-in was cancelled. You can try again whenever you are ready.',
  oauth_failed: 'We could not complete Google sign-in. Please try again or use your email and password.',
};

export function readableAuthError(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const value = raw.trim();
  if (!value) return null;

  // Supabase often sends the machine code in `error_code` / `error`; try an
  // exact match first, then a loose contains match for messages that embed it.
  const lower = value.toLowerCase();
  if (KNOWN_ERRORS[lower]) return KNOWN_ERRORS[lower];

  for (const [code, copy] of Object.entries(KNOWN_ERRORS)) {
    if (lower.includes(code)) return copy;
  }

  // A human-readable message (has spaces, sentence-like) passes through so we
  // never hide a genuinely useful message behind a generic one.
  if (/\s/.test(value) && value.length <= 160) return value;

  return 'We could not complete that sign-in. Please sign in with your email and password.';
}
